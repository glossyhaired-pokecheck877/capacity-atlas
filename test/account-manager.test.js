import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loginSpec, resolveProviderCommand, sanitizeLoginOutput, AccountManager } from "../lib/account-manager.js";

test("loginSpec isolates Codex and Grok while Claude uses its official ambient store", () => {
  const codex = loginSpec("codex", "/profiles/one");
  assert.equal(codex.command, "codex");
  assert.deepEqual(codex.args, ["login"]);
  assert.equal(codex.env.CODEX_HOME, "/profiles/one");
  assert.equal(codex.profileHome, "/profiles/one");
  assert.equal(codex.isolated, true);

  const claude = loginSpec("claude", "/profiles/two");
  assert.deepEqual(claude.args, ["auth", "login", "--claudeai"]);
  assert.deepEqual(claude.env, {});
  assert.match(claude.credentialPath, /\.claude[\\/]\.credentials\.json$/);
  assert.equal(claude.isolated, false);

  const grok = loginSpec("grok", "/profiles/three");
  assert.deepEqual(grok.args, ["login", "--oauth"]);
  assert.deepEqual(grok.env, { GROK_HOME: "/profiles/three" });
  assert.equal(grok.credentialPath, join("/profiles/three", "auth.json"));
  assert.equal(grok.isolated, true);
});

test("AccountManager prepares a managed provider helper before starting browser OAuth", async () => {
  let finishHelper;
  const helperReady = new Promise(resolve => { finishHelper = resolve; });
  const spawned = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const manager = new AccountManager({
    root: "/tmp/capacity-atlas-managed-helper-test",
    helperManager: {
      ensure: async (provider, { onProgress }) => {
        assert.equal(provider, "grok");
        onProgress({ message: "Grok公式認証機能を準備しています…" });
        await helperReady;
        return "/managed/helpers/grok";
      }
    },
    spawn: (command, args, options) => {
      spawned.push({ command, args, options });
      return child;
    },
    mkdir: async () => {},
    access: async () => {},
    readFile: async () => '{"version":1,"accounts":[]}',
    writeFile: async () => {}
  });

  const session = await manager.start("grok");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.get(session.id).status, "preparing");
  assert.match(manager.get(session.id).output, /公式認証機能を準備/);
  assert.equal(spawned.length, 0);

  finishHelper();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(spawned[0].command, "/managed/helpers/grok");
  assert.deepEqual(spawned[0].args, ["login", "--oauth"]);
  assert.match(spawned[0].options.env.GROK_HOME, /profiles[\\/]grok[\\/]/);
});

test("Claude OAuth completion is verified with the official auth status instead of a credential file", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const writes = [];
  const manager = new AccountManager({
    root: "/tmp/capacity-atlas-claude-oauth-test",
    helperManager: { ensure: async () => "/managed/helpers/claude" },
    spawn: () => child,
    execFile: async (command, args) => {
      assert.equal(command, "/managed/helpers/claude");
      assert.deepEqual(args, ["auth", "status", "--json"]);
      return { stdout: '{"loggedIn":true,"authMethod":"oauth","email":"sales@example.com","subscriptionType":"max"}', stderr: "" };
    },
    mkdir: async () => {},
    access: async () => { throw new Error("credentials are stored in Keychain"); },
    readFile: async () => '{"version":1,"accounts":[]}',
    writeFile: async (path, value) => { writes.push({ path, value: JSON.parse(value) }); }
  });

  const session = await manager.start("claude");
  await new Promise(resolve => setImmediate(resolve));
  child.emit("close", 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.get(session.id).status, "completed");
  const metadataWrite = writes.find(write => write.path.endsWith("provider-metadata.json"));
  assert.equal(metadataWrite.value.providers.claude.email, "sales@example.com");
  assert.equal(metadataWrite.value.providers.claude.plan, "max");
});

test("AccountManager labels managed profile homes without treating ambient CLI auth as removable", async () => {
  const manager = new AccountManager({
    root: "/tmp/capacity-atlas-home-metadata-test",
    readFile: async () => JSON.stringify({
      version: 1,
      accounts: [{ id: "managed-one", provider: "codex", home: "/profiles/managed-one" }]
    })
  });

  const homes = await manager.homes();
  assert.equal(homes.codex[0].managed, false);
  assert.equal(homes.codex[0].connectionId, null);
  assert.deepEqual(homes.codex[1], {
    home: "/profiles/managed-one",
    managed: true,
    connectionId: "managed-one"
  });
});

test("AccountManager disconnect removes only selected managed profiles and rewrites the registry", async () => {
  const removed = [];
  let written;
  const root = join(tmpdir(), "capacity-atlas-disconnect-test");
  const removeHome = join(root, "profiles", "codex", "remove-me");
  const keepHome = join(root, "profiles", "codex", "keep-me");
  const manager = new AccountManager({
    root,
    readFile: async () => JSON.stringify({
      version: 1,
      accounts: [
        { id: "remove-me", provider: "codex", home: removeHome },
        { id: "keep-me", provider: "codex", home: keepHome }
      ]
    }),
    writeFile: async (_path, value) => { written = JSON.parse(value); },
    mkdir: async () => {},
    rm: async path => { removed.push(path); }
  });

  const result = await manager.disconnect(["remove-me"]);
  assert.deepEqual(result, { removed: 1 });
  assert.deepEqual(removed, [removeHome]);
  assert.deepEqual(written.accounts.map(account => account.id), ["keep-me"]);
});

test("bundled Codex is preferred so account login works without a system CLI", () => {
  assert.equal(resolveProviderCommand("codex", {
    execPath: "/Applications/Capacity Atlas Connector.app/Contents/Resources/connector",
    platform: "darwin",
    env: {},
    existsSync: path => path.endsWith("/codex")
  }), "/Applications/Capacity Atlas Connector.app/Contents/Resources/codex");
  assert.equal(resolveProviderCommand("codex", {
    execPath: "C:\\Capacity Atlas\\capacity-atlas-connector.exe",
    platform: "win32",
    env: {},
    existsSync: path => path.endsWith("codex.exe")
  }), "C:\\Capacity Atlas\\codex.exe");
});

test("Finder-launched Connector discovers provider CLIs in their official user locations", () => {
  const available = new Set([
    "/Users/test/.local/bin/claude",
    "/Users/test/.grok/bin/grok"
  ]);
  const options = {
    execPath: "/Applications/Capacity Atlas Connector.app/Contents/Resources/connector",
    platform: "darwin",
    home: "/Users/test",
    env: {},
    existsSync: path => available.has(path)
  };
  assert.equal(resolveProviderCommand("claude", options), "/Users/test/.local/bin/claude");
  assert.equal(resolveProviderCommand("grok", options), "/Users/test/.grok/bin/grok");
});

test("login output redacts credential-shaped values", () => {
  const output = sanitizeLoginOutput("\u001b[94mAuthorization: Bearer abcdefghijklmnop\u001b[0m refresh_token=super-secret-token\nOpen https://example.com");
  assert.doesNotMatch(output, /abcdefghijklmnop|super-secret-token|\[94m|\u001b/);
  assert.match(output, /Open https:\/\/example.com/);
});

test("AccountManager exposes login progress without exposing the child process", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const manager = new AccountManager({
    root: "/tmp/capacity-atlas-test",
    spawn: () => child,
    mkdir: async () => {},
    access: async () => {},
    readFile: async () => '{"version":1,"accounts":[]}',
    writeFile: async () => {}
  });
  const session = await manager.start("codex");
  child.stdout.emit("data", Buffer.from("Open https://auth.openai.com and enter ABCD-EFGH\n"));
  const progress = manager.get(session.id);
  assert.equal(progress.provider, "codex");
  assert.equal(progress.status, "waiting");
  assert.match(progress.output, /ABCD-EFGH/);
  assert.equal("child" in progress, false);

  const missing = Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" });
  child.emit("error", missing);
  const failed = manager.get(session.id);
  assert.equal(failed.status, "failed");
  assert.match(failed.output, /認証機能を起動できませんでした/);
  assert.doesNotMatch(failed.output, /ENOENT/);
});

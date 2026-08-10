import { execFile as nodeExecFile, spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync as nodeExistsSync } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep, win32 } from "node:path";
import { promisify } from "node:util";
import { ProviderHelperManager } from "./provider-helper.js";

const execFile = promisify(nodeExecFile);

const PROVIDER_SPECS = {
  codex: {
    command: "codex",
    args: ["login"],
    envKey: "CODEX_HOME",
    credentialFile: "auth.json",
    isolated: true
  },
  claude: {
    command: "claude",
    args: ["auth", "login", "--claudeai"],
    credentialFile: ".credentials.json",
    ambientHome: ".claude",
    isolated: false
  },
  grok: {
    command: "grok",
    args: ["login", "--oauth"],
    envKey: "GROK_HOME",
    credentialFile: "auth.json",
    isolated: true
  }
};

export function resolveProviderCommand(provider, {
  execPath = process.execPath,
  platform = process.platform,
  home = homedir(),
  env = process.env,
  existsSync = nodeExistsSync
} = {}) {
  const spec = PROVIDER_SPECS[provider];
  if (!spec) throw new Error("未対応のAIサービスです。");
  const override = env[`CAPACITY_ATLAS_${provider.toUpperCase()}_BIN`];
  if (override) return override;
  const pathApi = platform === "win32" ? win32 : { dirname, join };
  const filename = platform === "win32" ? `${provider}.exe` : provider;
  const bundled = pathApi.join(pathApi.dirname(execPath), filename);
  const candidates = [bundled];
  if (platform === "win32") {
    candidates.push(
      pathApi.join(home, ".local", "bin", filename),
      pathApi.join(home, `.${provider}`, "bin", filename)
    );
  } else {
    if (provider === "claude") candidates.push(pathApi.join(home, ".local", "bin", "claude"));
    if (provider === "grok") candidates.push(pathApi.join(home, ".grok", "bin", "grok"));
    candidates.push(`/opt/homebrew/bin/${provider}`, `/usr/local/bin/${provider}`);
  }
  return candidates.find(candidate => existsSync(candidate)) || spec.command;
}

export function loginSpec(provider, requestedHome) {
  const spec = PROVIDER_SPECS[provider];
  if (!spec) throw new Error("未対応のAIサービスです。");
  const profileHome = spec.isolated ? requestedHome : join(homedir(), spec.ambientHome);
  return {
    command: spec.command,
    args: [...spec.args],
    env: spec.envKey ? { [spec.envKey]: profileHome } : {},
    credentialPath: join(profileHome, spec.credentialFile),
    profileHome,
    isolated: spec.isolated
  };
}

export function sanitizeLoginOutput(value) {
  return String(value || "")
    .replace(/\u001b?\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/((?:access|refresh|id)[_-]?token\s*[=:]\s*)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|sess|xai)-[A-Za-z0-9._-]{12,}\b/g, "[REDACTED]")
    .slice(-12_000);
}

async function exists(path, accessFn) {
  try {
    await accessFn(path);
    return true;
  } catch {
    return false;
  }
}

export class AccountManager {
  constructor({
    root = join(homedir(), ".capacity-atlas"),
    spawn = nodeSpawn,
    execFile: execFileFn = execFile,
    mkdir: mkdirFn = mkdir,
    access: accessFn = access,
    readFile: readFileFn = readFile,
    rm: rmFn = rm,
    writeFile: writeFileFn = writeFile,
    helperManager = new ProviderHelperManager({ root: join(root, "helpers") })
  } = {}) {
    this.root = root;
    this.spawn = spawn;
    this.execFile = execFileFn;
    this.mkdir = mkdirFn;
    this.access = accessFn;
    this.readFile = readFileFn;
    this.rm = rmFn;
    this.writeFile = writeFileFn;
    this.helperManager = helperManager;
    this.sessions = new Map();
    this.registryPath = join(root, "accounts.json");
    this.providerMetadataPath = join(root, "provider-metadata.json");
  }

  async start(provider) {
    const id = randomUUID();
    const requestedHome = join(this.root, "profiles", provider, id);
    const spec = loginSpec(provider, requestedHome);
    const home = spec.profileHome;
    await this.mkdir(home, { recursive: true, mode: 0o700 });
    const session = {
      id,
      provider,
      home,
      status: "starting",
      output: "認証を開始しています…",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.sessions.set(id, session);

    if (["claude", "grok"].includes(provider)) {
      session.status = "preparing";
      session.output = "公式認証機能を準備しています…";
      void this.prepareManagedLogin(session, spec);
      return this.publicSession(session);
    }

    this.spawnLogin(session, spec, resolveProviderCommand(provider));
    return this.publicSession(session);
  }

  async prepareManagedLogin(session, spec) {
    try {
      const command = await this.helperManager.ensure(session.provider, {
        onProgress: progress => {
          session.status = "preparing";
          session.output = sanitizeLoginOutput(progress?.message || "公式認証機能を準備しています…");
          session.updatedAt = new Date().toISOString();
        }
      });
      this.spawnLogin(session, spec, command);
    } catch (error) {
      session.status = "failed";
      session.output = sanitizeLoginOutput(error?.message || "公式認証機能を準備できませんでした。");
      session.updatedAt = new Date().toISOString();
    }
  }

  spawnLogin(session, spec, command) {
    session.command = command;
    let child;
    try {
      child = this.spawn(command, spec.args, {
        env: { ...process.env, ...spec.env },
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      session.status = "failed";
      session.output = sanitizeLoginOutput(error.message);
      return;
    }

    const append = (chunk, status = "waiting") => {
      session.output = sanitizeLoginOutput(`${session.output}\n${chunk}`);
      session.status = status;
      session.updatedAt = new Date().toISOString();
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", error => {
      const providerName = { codex: "GPT / Codex", claude: "Claude", grok: "Grok" }[session.provider] || session.provider;
      const message = error?.code === "ENOENT"
        ? `${providerName}の認証機能を起動できませんでした。Connectorを再起動して、もう一度お試しください。`
        : error.message;
      append(message, "failed");
    });
    child.on("close", code => {
      void this.finish(session, spec, code);
    });
  }

  get(id) {
    const session = this.sessions.get(id);
    return session ? this.publicSession(session) : null;
  }

  async finish(session, spec, code) {
    let authenticated = false;
    let authProfile = null;
    if (code === 0 && session.provider === "claude") {
      try {
        const { stdout } = await this.execFile(session.command, ["auth", "status", "--json"], {
          env: { ...process.env, ...spec.env }
        });
        const status = JSON.parse(stdout);
        authenticated = status?.loggedIn === true && !/api[_ -]?key/i.test(status?.authMethod || "");
        if (authenticated) {
          authProfile = {
            email: status.email || null,
            plan: status.subscriptionType || null,
            authMethod: status.authMethod || null
          };
        }
      } catch {
        authenticated = false;
      }
    } else if (code === 0) {
      authenticated = await exists(spec.credentialPath, this.access);
    }
    if (!authenticated) {
      session.status = "failed";
      session.output = sanitizeLoginOutput(`${session.output}\n認証が完了しませんでした。もう一度お試しください。`);
      session.updatedAt = new Date().toISOString();
      return;
    }
    if (spec.isolated) {
      await this.register({ id: session.id, provider: session.provider, home: session.home });
    }
    if (session.provider === "claude" && authProfile) {
      await this.saveProviderMetadata("claude", authProfile);
    }
    session.status = "completed";
    session.output = "認証が完了しました。利用枠を更新しています。";
    session.updatedAt = new Date().toISOString();
  }

  async register(account) {
    const registry = await this.readRegistry();
    const accounts = registry.accounts.filter(item => item.id !== account.id);
    accounts.push({ ...account, createdAt: new Date().toISOString() });
    await this.mkdir(this.root, { recursive: true, mode: 0o700 });
    await this.writeFile(this.registryPath, JSON.stringify({ version: 1, accounts }, null, 2), { mode: 0o600 });
  }

  async readRegistry() {
    try {
      const parsed = JSON.parse(await this.readFile(this.registryPath, "utf8"));
      return { version: 1, accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [] };
    } catch {
      return { version: 1, accounts: [] };
    }
  }

  async readProviderMetadata() {
    try {
      const parsed = JSON.parse(await this.readFile(this.providerMetadataPath, "utf8"));
      return { version: 1, providers: parsed?.providers && typeof parsed.providers === "object" ? parsed.providers : {} };
    } catch {
      return { version: 1, providers: {} };
    }
  }

  async saveProviderMetadata(provider, profile) {
    const metadata = await this.readProviderMetadata();
    metadata.providers[provider] = {
      email: profile.email || null,
      plan: profile.plan || null,
      authMethod: profile.authMethod || null,
      updatedAt: new Date().toISOString()
    };
    await this.mkdir(this.root, { recursive: true, mode: 0o700 });
    await this.writeFile(this.providerMetadataPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  }

  async disconnect(connectionIds) {
    const ids = new Set((Array.isArray(connectionIds) ? connectionIds : []).filter(id => typeof id === "string" && id));
    if (!ids.size) return { removed: 0 };
    const registry = await this.readRegistry();
    const selected = registry.accounts.filter(account => ids.has(account.id));
    const managedRoot = `${resolve(this.root, "profiles")}${sep}`;
    for (const account of selected) {
      const target = resolve(account.home || "");
      if (!target.startsWith(managedRoot)) {
        const error = new Error("管理対象外の接続は解除できません。");
        error.status = 400;
        throw error;
      }
    }
    for (const account of selected) {
      await this.rm(resolve(account.home), { recursive: true, force: true });
    }
    const accounts = registry.accounts.filter(account => !ids.has(account.id));
    await this.mkdir(this.root, { recursive: true, mode: 0o700 });
    await this.writeFile(this.registryPath, JSON.stringify({ version: 1, accounts }, null, 2), { mode: 0o600 });
    return { removed: selected.length };
  }

  async homes() {
    const registry = await this.readRegistry();
    const metadata = await this.readProviderMetadata();
    const home = homedir();
    const claudeMetadata = metadata.providers.claude || null;
    const result = {
      codex: [{ home: join(home, ".codex"), managed: false, connectionId: null }],
      claude: [{
        home: join(home, ".claude"),
        managed: false,
        connectionId: null,
        ...(claudeMetadata?.email ? { email: claudeMetadata.email } : {}),
        ...(claudeMetadata?.plan ? { plan: claudeMetadata.plan } : {})
      }],
      grok: [{ home: join(home, ".grok"), managed: false, connectionId: null }]
    };
    for (const account of registry.accounts) {
      if (result[account.provider] && account.home) {
        result[account.provider].push({ home: account.home, managed: true, connectionId: account.id });
      }
    }
    return Object.fromEntries(Object.entries(result).map(([provider, homes]) => {
      const seen = new Set();
      return [provider, homes.filter(entry => {
        if (seen.has(entry.home)) return false;
        seen.add(entry.home);
        return true;
      })];
    }));
  }

  publicSession(session) {
    return {
      id: session.id,
      provider: session.provider,
      status: session.status,
      output: sanitizeLoginOutput(session.output),
      startedAt: session.startedAt,
      updatedAt: session.updatedAt
    };
  }
}

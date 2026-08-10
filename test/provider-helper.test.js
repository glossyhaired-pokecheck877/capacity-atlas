import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProviderHelperManager, providerArtifact } from "../lib/provider-helper.js";

function response(body, { json = false } = {}) {
  const bytes = Buffer.from(json ? JSON.stringify(body) : body);
  return {
    ok: true,
    status: 200,
    text: async () => bytes.toString("utf8"),
    json: async () => JSON.parse(bytes.toString("utf8")),
    arrayBuffer: async () => bytes
  };
}

test("providerArtifact maps supported Connector platforms to official artifacts", () => {
  assert.deepEqual(providerArtifact("claude", { platform: "darwin", arch: "arm64", version: "2.1.226" }), {
    platformKey: "darwin-arm64",
    filename: "claude",
    url: "https://downloads.claude.ai/claude-code-releases/2.1.226/darwin-arm64/claude"
  });
  assert.deepEqual(providerArtifact("grok", { platform: "win32", arch: "x64", version: "1.0.0" }), {
    platformKey: "windows-x86_64",
    filename: "grok.exe",
    url: "https://x.ai/cli/grok-1.0.0-windows-x86_64.exe"
  });
});

test("Claude helper is downloaded to Connector storage and checksum verified without a system CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-"));
  const binary = Buffer.from("signed-claude-binary");
  const checksum = createHash("sha256").update(binary).digest("hex");
  const requests = [];
  const manager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    fetch: async url => {
      requests.push(url);
      if (url.endsWith("/latest")) return response("2.1.226");
      if (url.endsWith("/manifest.json")) return response({ platforms: { "darwin-arm64": { checksum } } }, { json: true });
      return response(binary);
    },
    verifyBinary: async ({ provider, path }) => {
      assert.equal(provider, "claude");
      assert.match(path, /claude\.download$/);
    }
  });

  const path = await manager.ensure("claude");
  assert.equal((await readFile(path)).toString(), binary.toString());
  if (process.platform !== "win32") assert.ok((await stat(path)).mode & 0o100);
  assert.equal(requests.length, 3);

  assert.equal(await manager.ensure("claude"), path);
  assert.equal(requests.length, 3, "verified helper is reused without another download");
});

test("Grok helper is downloaded from the official stable channel without a system CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-"));
  const binary = Buffer.from("signed-grok-binary");
  const requests = [];
  const manager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    fetch: async url => {
      requests.push(url);
      if (url.endsWith("/stable")) return response("1.0.0");
      return response(binary);
    },
    verifyBinary: async ({ provider }) => assert.equal(provider, "grok")
  });

  const path = await manager.ensure("grok");
  assert.equal((await readFile(path)).toString(), binary.toString());
  assert.deepEqual(requests, [
    "https://x.ai/cli/stable",
    "https://x.ai/cli/grok-1.0.0-macos-aarch64"
  ]);
});

test("a checksum mismatch deletes the untrusted Claude download", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-"));
  const manager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    fetch: async url => {
      if (url.endsWith("/latest")) return response("2.1.226");
      if (url.endsWith("/manifest.json")) return response({ platforms: { "darwin-arm64": { checksum: "0".repeat(64) } } }, { json: true });
      return response("tampered");
    },
    verifyBinary: async () => {}
  });
  await assert.rejects(() => manager.ensure("claude"), /整合性/);
});

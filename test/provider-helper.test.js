import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProviderHelperManager, providerArtifact } from "../lib/provider-helper.js";

function response(value, { json = false } = {}) {
  const bytes = json ? Buffer.from(JSON.stringify(value)) : Buffer.from(value);
  return new Response(bytes, {
    status: 200,
    headers: { "content-length": String(bytes.length) }
  });
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
  const verifiedPaths = [];
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
      verifiedPaths.push(path);
    }
  });

  const path = await manager.ensure("claude");
  assert.equal((await readFile(path)).toString(), binary.toString());
  if (process.platform !== "win32") assert.ok((await stat(path)).mode & 0o100);
  assert.equal(requests.length, 3);

  assert.equal(await manager.ensure("claude"), path);
  assert.equal(requests.length, 3, "verified helper is reused without another download");
  assert.match(verifiedPaths[0], /\.download$/);
  assert.equal(verifiedPaths[1], path, "cached helper signature is reverified before reuse");
  assert.deepEqual((await readdir(join(root, "claude"))).sort(), ["2.1.226", "current.json"]);
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

test("an oversized cached helper is rejected without reading it into memory", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-local-size-"));
  const providerRoot = join(root, "claude");
  const oldVersionRoot = join(providerRoot, "2.1.226");
  await mkdir(oldVersionRoot, { recursive: true });
  const planted = Buffer.alloc(64, 1);
  const plantedPath = join(oldVersionRoot, "claude");
  await writeFile(plantedPath, planted);
  await writeFile(join(providerRoot, "current.json"), JSON.stringify({
    version: "2.1.226",
    platformKey: "darwin-arm64",
    checksum: createHash("sha256").update(planted).digest("hex")
  }));
  const replacement = Buffer.from("safe");
  const checksum = createHash("sha256").update(replacement).digest("hex");
  let requests = 0;
  const manager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    maxBinaryBytes: 32,
    fetch: async url => {
      requests += 1;
      if (url.endsWith("/latest")) return response("2.1.227");
      if (url.endsWith("/manifest.json")) return response({ platforms: { "darwin-arm64": { checksum } } }, { json: true });
      return response(replacement);
    },
    verifyBinary: async () => {}
  });
  assert.match(await manager.ensure("claude"), /2\.1\.227/);
  assert.equal(requests, 3);
});

test("oversized cached metadata is ignored through a bounded local read", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-local-metadata-"));
  const providerRoot = join(root, "grok");
  await mkdir(providerRoot, { recursive: true });
  await writeFile(join(providerRoot, "current.json"), "x".repeat(300));
  let requests = 0;
  const manager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    maxMetadataBytes: 256,
    fetch: async url => {
      requests += 1;
      return url.endsWith("/stable") ? response("1.0.1") : response("safe-grok");
    },
    verifyBinary: async () => {}
  });
  assert.match(await manager.ensure("grok"), /1\.0\.1/);
  assert.equal(requests, 2);
});

test("a modified cached helper is rejected and replaced from the official source", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-cache-"));
  const binary = Buffer.from("signed-claude-binary");
  const checksum = createHash("sha256").update(binary).digest("hex");
  let binaryDownloads = 0;
  let signatureChecks = 0;
  const manager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    fetch: async url => {
      if (url.endsWith("/latest")) return response("2.1.226");
      if (url.endsWith("/manifest.json")) return response({ platforms: { "darwin-arm64": { checksum } } }, { json: true });
      binaryDownloads += 1;
      return response(binary);
    },
    verifyBinary: async () => { signatureChecks += 1; }
  });

  const path = await manager.ensure("claude");
  await writeFile(path, "tampered-cache");
  assert.equal(await manager.ensure("claude"), path);
  assert.equal((await readFile(path)).toString(), binary.toString());
  assert.equal(binaryDownloads, 2, "tampered cache must be downloaded again");
  assert.equal(signatureChecks, 2, "replacement must pass signature verification again");
});

test("a stalled helper download times out instead of leaving login preparation hanging", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-timeout-"));
  const manager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    timeoutMs: 10,
    fetch: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }),
    verifyBinary: async () => {}
  });
  await assert.rejects(() => manager.ensure("claude"), /abort|timeout|timed out|タイムアウト/i);
});

test("non-OK helper responses and failed streams are cancelled", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-cancel-"));
  let nonOkCancelled = false;
  const nonOkManager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    fetch: async () => ({
      ok: false,
      status: 503,
      body: { cancel: async () => { nonOkCancelled = true; } }
    })
  });
  await assert.rejects(() => nonOkManager.ensure("claude"), /HTTP 503/);
  assert.equal(nonOkCancelled, true);

  let failedStreamCancelled = false;
  let lockReleased = false;
  const streamManager = new ProviderHelperManager({
    root: await mkdtemp(join(tmpdir(), "capacity-atlas-helper-stream-cancel-")),
    platform: "darwin",
    arch: "arm64",
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => ({
        read: async () => { throw new Error("stream failed"); },
        cancel: async () => { failedStreamCancelled = true; },
        releaseLock: () => { lockReleased = true; }
      }) }
    })
  });
  await assert.rejects(() => streamManager.ensure("claude"), /stream failed/);
  assert.equal(failedStreamCancelled, true);
  assert.equal(lockReleased, true);

  let readerInitCancelled = false;
  const readerInitManager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    timeoutMs: 1_000,
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => { throw new Error("reader initialization failed"); },
        cancel: async () => { readerInitCancelled = true; }
      }
    }),
    verifyBinary: async () => {}
  });
  await assert.rejects(() => readerInitManager.ensure("claude"), /reader initialization failed/);
  assert.equal(readerInitCancelled, true);
});

test("a helper response without a readable stream fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-no-stream-"));
  let cancelled = false;
  const manager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { cancel: async () => { cancelled = true; } },
      arrayBuffer: async () => { throw new Error("must not buffer"); },
      text: async () => { throw new Error("must not buffer"); }
    }),
    verifyBinary: async () => {}
  });
  await assert.rejects(() => manager.ensure("claude"), /安全なストリーム/);
  assert.equal(cancelled, true);
});

test("oversized helper metadata is rejected before downloading a binary", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-oversized-"));
  const manager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    fetch: async () => new Response("2.1.226", {
      status: 200,
      headers: { "content-length": "2000000" }
    }),
    verifyBinary: async () => {}
  });
  await assert.rejects(() => manager.ensure("claude"), /大きすぎ/);
});

test("oversized helper manifest is rejected before parsing", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-manifest-"));
  let request = 0;
  const manager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    fetch: async () => ++request === 1
      ? new Response("2.1.226", { status: 200 })
      : new Response("{}", { status: 200, headers: { "content-length": "2000000" } }),
    verifyBinary: async () => {}
  });
  await assert.rejects(() => manager.ensure("claude"), /大きすぎ/);
  assert.equal(request, 2);
});

test("oversized helper binary is rejected before buffering", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-atlas-helper-binary-"));
  const binary = Buffer.from("signed-claude-binary");
  const checksum = createHash("sha256").update(binary).digest("hex");
  let request = 0;
  const manager = new ProviderHelperManager({
    root,
    platform: "darwin",
    arch: "arm64",
    fetch: async () => {
      request += 1;
      if (request === 1) return new Response("2.1.226", { status: 200 });
      if (request === 2) return new Response(JSON.stringify({ platforms: { "darwin-arm64": { checksum } } }), { status: 200 });
      return new Response(binary, { status: 200, headers: { "content-length": "536870913" } });
    },
    verifyBinary: async () => {}
  });
  await assert.rejects(() => manager.ensure("claude"), /大きすぎ/);
  assert.equal(request, 3);
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

import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import * as tar from "tar";

const root = new URL("../", import.meta.url).pathname;
const vendorRoot = join(root, "vendor", "codex");
const manifest = JSON.parse(await readFile(join(vendorRoot, "artifacts.json"), "utf8"));
const releaseBase = `https://github.com/openai/codex/releases/download/${manifest.releaseTag}`;

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

for (const [platform, artifact] of Object.entries(manifest.artifacts)) {
  const destination = join(vendorRoot, artifact.destination);
  const marker = `${destination}.source.json`;
  try {
    const source = JSON.parse(await readFile(marker, "utf8"));
    await readFile(destination);
    if (source.version === manifest.version && source.archiveSha256 === artifact.sha256) {
      console.log(`${platform}: Codex ${manifest.version} already prepared`);
      continue;
    }
  } catch {
    // Download and verify below.
  }

  const work = join(tmpdir(), `capacity-atlas-codex-${platform}-${process.pid}`);
  const archivePath = join(work, basename(artifact.archive));
  const extractRoot = join(work, "extract");
  await mkdir(extractRoot, { recursive: true });
  try {
    console.log(`${platform}: downloading official OpenAI Codex ${manifest.version}`);
    const response = await fetch(`${releaseBase}/${artifact.archive}`, { redirect: "follow" });
    if (!response.ok) throw new Error(`Codex download failed: HTTP ${response.status}`);
    await writeFile(archivePath, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
    const actual = await sha256(archivePath);
    if (actual !== artifact.sha256) throw new Error(`Codex checksum mismatch for ${platform}`);
    await tar.x({ file: archivePath, cwd: extractRoot, strict: true });
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(extractRoot, artifact.binary), destination);
    if (!destination.endsWith(".exe")) await chmod(destination, 0o755);
    await writeFile(marker, JSON.stringify({
      version: manifest.version,
      releaseTag: manifest.releaseTag,
      archive: artifact.archive,
      archiveSha256: artifact.sha256,
      source: `${releaseBase}/${artifact.archive}`
    }, null, 2) + "\n");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

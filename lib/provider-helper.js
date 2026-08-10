import { createHash } from "node:crypto";
import { execFile as nodeExecFile } from "node:child_process";
import { access, chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(nodeExecFile);
const CLAUDE_BASE = "https://downloads.claude.ai/claude-code-releases";
const GROK_BASE = "https://x.ai/cli";
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9._-]+)?$/;

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function platformKey(provider, platform, arch) {
  if (provider === "claude") {
    if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
    if (platform === "win32" && arch === "x64") return "win32-x64";
  }
  if (provider === "grok") {
    if (platform === "darwin" && arch === "arm64") return "macos-aarch64";
    if (platform === "win32" && arch === "x64") return "windows-x86_64";
  }
  throw new Error("このOSはCapacity Atlas Connectorの認証機能に対応していません。");
}

export function providerArtifact(provider, { platform = process.platform, arch = process.arch, version }) {
  const key = platformKey(provider, platform, arch);
  if (provider === "claude") {
    const filename = platform === "win32" ? "claude.exe" : "claude";
    return { platformKey: key, filename, url: `${CLAUDE_BASE}/${version}/${key}/${filename}` };
  }
  if (provider === "grok") {
    const filename = platform === "win32" ? "grok.exe" : "grok";
    const suffix = platform === "win32" ? ".exe" : "";
    return { platformKey: key, filename, url: `${GROK_BASE}/grok-${version}-${key}${suffix}` };
  }
  throw new Error("このAIサービスには管理対象の認証ヘルパーがありません。");
}

async function fetchOk(fetchFn, url) {
  const response = await fetchFn(url, { redirect: "follow" });
  if (!response?.ok) throw new Error(`公式認証機能の取得に失敗しました（HTTP ${response?.status || "?"}）。`);
  return response;
}

async function defaultVerifyBinary({ provider, path, platform }) {
  if (platform === "darwin") {
    await execFile("/usr/bin/codesign", ["--verify", "--strict", path]);
    const { stderr } = await execFile("/usr/bin/codesign", ["-dv", "--verbose=4", path]);
    const expectedTeam = provider === "claude" ? "Q6L2SF6YDW" : "5Y6N3AJ54S";
    if (!String(stderr).includes(`TeamIdentifier=${expectedTeam}`)) {
      throw new Error("公式配布元の署名を確認できませんでした。");
    }
    return;
  }
  if (platform === "win32") {
    const escaped = path.replace(/'/g, "''");
    const script = `$s=Get-AuthenticodeSignature -LiteralPath '${escaped}'; if ($s.Status -ne 'Valid') { exit 1 }; Write-Output $s.SignerCertificate.Subject`;
    const { stdout } = await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
    const expected = provider === "claude" ? /Anthropic/i : /X\.AI|xAI/i;
    if (!expected.test(String(stdout))) throw new Error("公式配布元の署名を確認できませんでした。");
  }
}

export class ProviderHelperManager {
  constructor({
    root = join(homedir(), ".capacity-atlas", "helpers"),
    platform = process.platform,
    arch = process.arch,
    fetch = globalThis.fetch,
    verifyBinary = defaultVerifyBinary
  } = {}) {
    this.root = root;
    this.platform = platform;
    this.arch = arch;
    this.fetch = fetch;
    this.verifyBinary = verifyBinary;
    this.inFlight = new Map();
  }

  async ensure(provider, { onProgress = () => {} } = {}) {
    if (!["claude", "grok"].includes(provider)) throw new Error("管理対象外の認証ヘルパーです。");
    if (!this.inFlight.has(provider)) {
      const task = this.#ensure(provider, onProgress).finally(() => this.inFlight.delete(provider));
      this.inFlight.set(provider, task);
    }
    return this.inFlight.get(provider);
  }

  async #ensure(provider, onProgress) {
    const providerRoot = join(this.root, provider);
    const currentPath = join(providerRoot, "current.json");
    try {
      const current = JSON.parse(await readFile(currentPath, "utf8"));
      const artifact = providerArtifact(provider, {
        platform: this.platform,
        arch: this.arch,
        version: current.version
      });
      const cached = join(providerRoot, current.version, artifact.filename);
      if (current.platformKey === artifact.platformKey && await pathExists(cached)) return cached;
    } catch {
      // No verified cached helper yet.
    }

    onProgress({ stage: "version", message: "公式認証機能の最新版を確認しています…" });
    const versionUrl = provider === "claude" ? `${CLAUDE_BASE}/latest` : `${GROK_BASE}/stable`;
    const version = (await (await fetchOk(this.fetch, versionUrl)).text()).trim();
    if (!VERSION_PATTERN.test(version)) throw new Error("公式配布元から有効なバージョン情報を取得できませんでした。");

    const artifact = providerArtifact(provider, { platform: this.platform, arch: this.arch, version });
    let expectedChecksum = null;
    if (provider === "claude") {
      const manifest = await (await fetchOk(this.fetch, `${CLAUDE_BASE}/${version}/manifest.json`)).json();
      expectedChecksum = manifest?.platforms?.[artifact.platformKey]?.checksum || null;
      if (!/^[a-f0-9]{64}$/i.test(expectedChecksum || "")) {
        throw new Error("Claude公式manifestの整合性情報を確認できませんでした。");
      }
    }

    const versionRoot = join(providerRoot, version);
    const destination = join(versionRoot, artifact.filename);
    const temporary = `${destination}.download`;
    await mkdir(versionRoot, { recursive: true, mode: 0o700 });
    onProgress({ stage: "download", message: `${provider === "claude" ? "Claude" : "Grok"}公式認証機能を準備しています…` });
    try {
      const bytes = Buffer.from(await (await fetchOk(this.fetch, artifact.url)).arrayBuffer());
      if (expectedChecksum) {
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (actual !== expectedChecksum.toLowerCase()) throw new Error("公式認証機能の整合性を確認できませんでした。");
      }
      await writeFile(temporary, bytes, { mode: 0o700 });
      await chmod(temporary, 0o700);
      await this.verifyBinary({ provider, path: temporary, platform: this.platform });
      await rename(temporary, destination);
      await writeFile(currentPath, JSON.stringify({
        version,
        platformKey: artifact.platformKey,
        verifiedAt: new Date().toISOString()
      }, null, 2), { mode: 0o600 });
      return destination;
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}

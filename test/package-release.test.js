import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scriptPath = new URL("../scripts/package-release.mjs", import.meta.url);

test("macOS package uses a native APPL launcher so Finder can launch it", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /<key>CFBundlePackageType<\/key><string>APPL<\/string>/);
  assert.match(source, /xcrun/);
  assert.match(source, /swiftc/);
  assert.doesNotMatch(source, /writeFile\(join\(macBin, "Capacity Atlas Connector"\), `#!\/bin\/zsh/);
});

test("desktop launchers open the local Connector UI without browser network permissions", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /NSWorkspace\.shared\.open\(URL\(string: "http:\/\/127\.0\.0\.1:4174"\)!\)/);
  assert.match(source, /start "" "http:\/\/127\.0\.0\.1:4174"/);
  assert.match(source, /vendor\/codex\/macos-arm64\/codex/);
  assert.match(source, /vendor\/codex\/windows-x64\/codex\.exe/);
  assert.match(source, /公式認証機能を自動で準備/);
  assert.match(source, /Invoke-RestMethod/);
  assert.match(source, /ProcessName -eq 'capacity-atlas-connector'/);
  assert.match(source, /Stop-Process.*-Force/);
  assert.doesNotMatch(source, /Claude・Grokの新規認証には各社公式CLIが必要/);
  assert.doesNotMatch(source, /open https:\/\/capacity-atlas\.vercel\.app/);
});

test("documentation describes Claude browser OAuth without a preinstalled CLI", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /Claude.*ブラウザOAuth/);
  assert.match(readme, /正式な第三者向け安定APIではない/);
  assert.doesNotMatch(readme, /初版の新規認証では各社の公式CLIがPCに入っている必要があります/);
});

import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const release = join(root, "release");
const macApp = join(release, "Capacity Atlas Connector.app");
const macContents = join(macApp, "Contents");
const macResources = join(macContents, "Resources");
const macBin = join(macContents, "MacOS");
const windowsDir = join(release, "Capacity Atlas Connector Windows");

await rm(macApp, { recursive: true, force: true });
await rm(windowsDir, { recursive: true, force: true });
await mkdir(macResources, { recursive: true });
await mkdir(macBin, { recursive: true });
await mkdir(windowsDir, { recursive: true });

await copyFile(join(release, "capacity-atlas-macos-arm64"), join(macResources, "connector"));
await copyFile(join(root, "vendor/codex/macos-arm64/codex"), join(macResources, "codex"));
await copyFile(join(root, "vendor/codex/LICENSE"), join(macResources, "OPENAI_CODEX_LICENSE"));
await chmod(join(macResources, "connector"), 0o755);
await chmod(join(macResources, "codex"), 0o755);
const launcherSource = join(release, "CapacityAtlasLauncher.swift");
await writeFile(launcherSource, `import Foundation
import AppKit

let healthURL = URL(string: "http://127.0.0.1:4174/api/health")!

func connectorIsReady() -> Bool {
    guard let data = try? Data(contentsOf: healthURL),
          let text = String(data: data, encoding: .utf8) else { return false }
    return text.contains("Capacity Atlas Connector")
}

func runAndWait(_ executable: String, _ arguments: [String]) {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    try? process.run()
    process.waitUntilExit()
}

if connectorIsReady() {
    runAndWait("/bin/zsh", ["-c", "/usr/sbin/lsof -tiTCP:4174 -sTCP:LISTEN | /usr/bin/xargs kill 2>/dev/null || true"])
    Thread.sleep(forTimeInterval: 0.5)
}

guard let resources = Bundle.main.resourceURL else { exit(1) }
let logPath = "/tmp/capacity-atlas-connector.log"
FileManager.default.createFile(atPath: logPath, contents: nil)
let log = FileHandle(forWritingAtPath: logPath)
let connector = Process()
connector.executableURL = resources.appendingPathComponent("connector")
connector.currentDirectoryURL = resources
connector.standardOutput = log
connector.standardError = log

do {
    try connector.run()
} catch {
    exit(1)
}

for _ in 0..<40 {
    if connectorIsReady() { break }
    Thread.sleep(forTimeInterval: 0.1)
}

NSWorkspace.shared.open(URL(string: "http://127.0.0.1:4174")!)
connector.waitUntilExit()
`);
execFileSync("xcrun", ["swiftc", "-O", "-framework", "AppKit", launcherSource, "-o", join(macBin, "Capacity Atlas Connector")], { stdio: "inherit" });
await rm(launcherSource, { force: true });
await writeFile(join(macContents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>CFBundleName</key><string>Capacity Atlas Connector</string>\n<key>CFBundleDisplayName</key><string>Capacity Atlas Connector</string>\n<key>CFBundleIdentifier</key><string>jp.meem.capacity-atlas.connector</string>\n<key>CFBundleVersion</key><string>${version}</string>\n<key>CFBundleShortVersionString</key><string>${version}</string>\n<key>CFBundleExecutable</key><string>Capacity Atlas Connector</string>\n<key>CFBundlePackageType</key><string>APPL</string>\n<key>LSUIElement</key><true/>\n<key>LSMinimumSystemVersion</key><string>14.0</string>\n</dict></plist>\n`);
await copyFile(join(root, "THIRD_PARTY_NOTICES.md"), join(macResources, "THIRD_PARTY_NOTICES.md"));

await copyFile(join(release, "capacity-atlas-win-x64.exe"), join(windowsDir, "capacity-atlas-connector.exe"));
await copyFile(join(root, "vendor/codex/windows-x64/codex.exe"), join(windowsDir, "codex.exe"));
await copyFile(join(root, "vendor/codex/LICENSE"), join(windowsDir, "OPENAI_CODEX_LICENSE.txt"));
await copyFile(join(root, "THIRD_PARTY_NOTICES.md"), join(windowsDir, "THIRD_PARTY_NOTICES.md"));
await writeFile(join(windowsDir, "Start Capacity Atlas.cmd"), `@echo off\r\nsetlocal\r\npowershell -NoProfile -Command "$ErrorActionPreference = 'SilentlyContinue'; $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4174/api/health' -TimeoutSec 2; if ($health.name -eq 'Capacity Atlas Connector') { $owner = (Get-NetTCPConnection -LocalPort 4174 -State Listen | Select-Object -First 1).OwningProcess; $process = Get-Process -Id $owner; if ($process.ProcessName -eq 'capacity-atlas-connector') { Stop-Process -Id $owner -Force; Start-Sleep -Milliseconds 500 } }"\r\nstart "Capacity Atlas Connector" /min "%~dp0capacity-atlas-connector.exe"\r\npowershell -NoProfile -Command "$ready = $false; 1..40 | ForEach-Object { try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4174/api/health' -TimeoutSec 1; if ($health.ready) { $ready = $true; break } } catch {}; Start-Sleep -Milliseconds 100 }; if (-not $ready) { exit 1 }"\r\nif errorlevel 1 (\r\n  echo Capacity Atlas Connectorを起動できませんでした。もう一度このファイルをダブルクリックしてください。\r\n  pause\r\n  exit /b 1\r\n)\r\nstart "" "http://127.0.0.1:4174"\r\n`);
await writeFile(join(windowsDir, "README.txt"), `Capacity Atlas Connector ${version}\r\n\r\n1. Start Capacity Atlas.cmd をダブルクリックします。\r\n2. ブラウザでCapacity Atlasが開きます。\r\n3. GPT / Codexの認証機能は同梱されています。Claude・Grokは初回接続時に公式認証機能を自動で準備し、ブラウザOAuthを開始します。事前のCLI導入は不要です。\r\n4. Claudeの個人契約連携は非公式連携で、仕様変更により停止する場合があります。\r\n\r\n認証情報と実利用枠はVercelへ送信されません。\r\n`);

execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", macApp], { stdio: "inherit" });
for (const path of [join(release, "Capacity-Atlas-Connector-macOS-arm64.zip"), join(release, "Capacity-Atlas-Connector-Windows-x64.zip")]) {
  await rm(path, { force: true });
}
execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", macApp, join(release, "Capacity-Atlas-Connector-macOS-arm64.zip")]);
execFileSync("ditto", ["-c", "-k", "--keepParent", windowsDir, join(release, "Capacity-Atlas-Connector-Windows-x64.zip")]);
console.log("Packaged macOS and Windows Connector archives in release/");

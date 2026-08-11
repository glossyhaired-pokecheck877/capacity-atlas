import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../public/", import.meta.url);

async function source(name) {
  return readFile(new URL(name, root), "utf8");
}

test("first view prioritizes account capacity instead of a marketing hero", async () => {
  const html = await source("index.html");
  assert.doesNotMatch(html, /class="hero"/);
  assert.doesNotMatch(html, /AIの残容量を、/);
  assert.ok(html.indexOf('id="accountGrid"') < html.indexOf('class="summary-grid"'));
});

test("first-time users can download the Connector instead of being sent to a dead loopback URL", async () => {
  const html = await source("index.html");
  const client = await source("client.js");
  assert.match(html, /id="connectorInstallActions"/);
  assert.match(html, /Capacity-Atlas-Connector-macOS-arm64\.zip/);
  assert.match(html, /Capacity-Atlas-Connector-Windows-x64\.zip/);
  assert.match(client, /接続を再確認/);
  assert.doesNotMatch(client, /window\.location\.assign\(connector\.url\)/);
});

test("mobile layout keeps primary actions and content inside the viewport", async () => {
  const [html, css] = await Promise.all([source("index.html"), source("styles.css")]);
  assert.match(css, /main \{ min-width: 0; width: 100%; max-width: 100vw; overflow-x: hidden; \}/);
  assert.match(css, /\.topbar-actions \{ min-width: 0; margin-left: auto; flex: 0 0 auto; \}/);
  assert.match(css, /\.refresh-button \{ flex: 0 0 44px; width: 44px; min-height: 44px;/);
  assert.match(css, /\.summary-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.empty p \{ width: 100%;[^}]*overflow-wrap: anywhere;/);
  assert.match(html, /class="refresh-label"/);
  assert.match(html, /aria-label="アカウントを追加"/);
});

test("mobile controls remain labeled, touchable, and connection rows do not require horizontal scrolling", async () => {
  const [css, client] = await Promise.all([source("styles.css"), source("client.js")]);
  assert.match(css, /\.filter\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.disconnect-button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /@media \(max-width: 580px\)[\s\S]*?thead\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css, /@media \(max-width: 580px\)[\s\S]*?table\s*\{\s*min-width:\s*650px/);
  assert.doesNotMatch(css, /\.add-account-button\s*\{\s*font-size:\s*0/);
  assert.match(client, /data-label="サービス"/);
  assert.match(client, /data-label="状態"/);
});

test("keyboard users receive visible focus and an associated arrow-key tab interface", async () => {
  const [html, css, client] = await Promise.all([
    source("index.html"),
    source("styles.css"),
    source("client.js")
  ]);
  assert.match(css, /:focus-visible/);
  assert.match(html, /id="setupTabCodex"[^>]*aria-controls="setupPanel"/);
  assert.match(html, /id="setupPanel"[^>]*role="tabpanel"[^>]*aria-labelledby="setupTabCodex"/);
  assert.match(client, /accountSetupDialog"\)\.addEventListener\("close"/);
  assert.match(client, /disconnectDialog"\)\.addEventListener\("close"/);
  assert.match(client, /setupReturnFocus\?\.focus/);
  assert.match(client, /disconnectReturnFocus\?\.focus/);
  assert.match(client, /if \(!\$\("#accountSetupDialog"\)\.open\) return true/);
  assert.ok((client.match(/if \(!\$\("#accountSetupDialog"\)\.open\) return;/g) || []).length >= 2);
  assert.match(client, /ArrowLeft/);
  assert.match(client, /ArrowRight/);
  assert.match(client, /setupReturnFocus/);
});

test("managed account cards expose a confirmation-based disconnect action", async () => {
  const html = await source("index.html");
  const client = await source("client.js");
  assert.match(html, /id="disconnectDialog"/);
  assert.match(html, /id="confirmDisconnectButton"/);
  assert.match(client, /data-disconnect-account/);
  assert.match(client, /managedConnectionIds/);
  assert.match(client, /disconnectAccount/);
});

test("dashboard includes recognizable provider marks and provider color tokens", async () => {
  const [html, css, client] = await Promise.all([
    source("index.html"),
    source("styles.css"),
    source("client.js")
  ]);
  assert.match(html, /data-provider-mark="codex"/);
  assert.match(html, /data-provider-mark="claude"/);
  assert.match(html, /data-provider-mark="grok"/);
  assert.match(css, /--codex:/);
  assert.match(css, /--claude:/);
  assert.match(css, /--grok:/);
  assert.match(client, /providerLogo/);
  assert.match(client, /provider-card provider-/);
});

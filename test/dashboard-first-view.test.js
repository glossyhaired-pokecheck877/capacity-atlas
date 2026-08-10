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
  const css = await source("styles.css");
  assert.match(css, /main \{ min-width: 0; width: 100%; max-width: 100vw; overflow-x: hidden; \}/);
  assert.match(css, /\.topbar-actions \{ min-width: 0; margin-left: auto; flex: 0 0 auto; \}/);
  assert.match(css, /\.add-account-button, \.refresh-button \{ width: 40px;/);
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

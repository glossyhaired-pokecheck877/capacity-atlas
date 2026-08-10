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

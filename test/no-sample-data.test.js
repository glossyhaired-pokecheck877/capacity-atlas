import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const clientPath = new URL("../public/client.js", import.meta.url);
const htmlPath = new URL("../public/index.html", import.meta.url);
const demoPath = new URL("../public/demo-data.json", import.meta.url);

test("disconnected mode never loads or labels sample accounts", async () => {
  const [client, html] = await Promise.all([readFile(clientPath, "utf8"), readFile(htmlPath, "utf8")]);
  assert.doesNotMatch(client, /demo-data\.json|サンプルデータ|プレビュー表示/);
  assert.match(client, /accounts:\s*\[\]/);
  assert.match(client, /アカウントは0件です/);
  assert.match(client, /Connector接続後に更新/);
  assert.match(html, /接続を確認中/);
  assert.doesNotMatch(html, /primary@example\.com|backup@example\.com|creative@example\.com/);
  await assert.rejects(access(demoPath));
});

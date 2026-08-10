import test from "node:test";
import assert from "node:assert/strict";
import { loginOpenedLabel, setupGuide } from "../public/setup-model.js";

test("setupGuide explains the Connector-managed GPT account flow without requesting credentials", () => {
  const guide = setupGuide("codex");
  assert.equal(guide.title, "GPT / Codex");
  assert.equal(guide.capability, "複数アカウント対応");
  assert.equal(guide.actionLabel, "OpenAIログインを始める");
  assert.equal("command" in guide, false);
  assert.doesNotMatch(JSON.stringify(guide), /CodexBar|tokenを入力|Cookieを入力/);
});

test("setupGuide limits Grok to the currently active CLI account", () => {
  const guide = setupGuide("grok");
  assert.equal(guide.capability, "現在のアカウントを接続");
  assert.equal(guide.actionLabel, "Grokを再接続");
  assert.match(guide.note, /複数アカウント分離は未対応/);
});

test("setupGuide presents Claude subscription browser OAuth without requiring a preinstalled CLI", () => {
  const guide = setupGuide("claude");
  assert.equal(guide.capability, "ブラウザOAuth接続");
  assert.equal(guide.actionLabel, "Claudeへ接続");
  assert.match(guide.steps.join(" "), /公式認証機能を自動で準備/);
  assert.match(guide.steps.join(" "), /Free・Pro・Max/);
  assert.match(guide.steps.join(" "), /コードの入力は必要ありません/);
  assert.doesNotMatch(JSON.stringify(guide), /CLIをインストール|Claudeを再接続/);
  assert.match(guide.note, /非公式連携/);
});

test("setupGuide returns no guide for an unknown provider", () => {
  assert.equal(setupGuide("unknown"), null);
});

test("loginOpenedLabel names the provider whose OAuth page was opened", () => {
  assert.equal(loginOpenedLabel("codex"), "OpenAIのログイン画面を開きました");
  assert.equal(loginOpenedLabel("claude"), "Claudeのログイン画面を開きました");
  assert.equal(loginOpenedLabel("grok"), "Grokのログイン画面を開きました");
});

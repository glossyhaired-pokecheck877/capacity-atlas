import test from "node:test";
import assert from "node:assert/strict";
import { parseBrowserLogin, parseDeviceLogin, stripTerminalFormatting } from "../public/login-output-model.js";

test("browser OAuth output becomes a direct OpenAI login button without a code", () => {
  const raw = "Starting local login server on http://localhost:1455.\nIf your browser did not open, navigate to this URL to authenticate:\nhttps://auth.openai.com/oauth/authorize?response_type=code&client_id=app_test&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback";
  const result = parseBrowserLogin(raw);
  assert.equal(result.ready, true);
  assert.match(result.url, /^https:\/\/auth\.openai\.com\/oauth\/authorize\?/);
  assert.equal("code" in result, false);
});

test("device-login output becomes a beginner-friendly URL and one-time code", () => {
  const raw = "\u001b[94mhttps://auth.openai.com/codex/device\u001b[0m\nEnter this one-time code\n\u001b[94mT0AT-7Q4JK\u001b[0m";
  const result = parseDeviceLogin(raw);
  assert.equal(result.url, "https://auth.openai.com/codex/device");
  assert.equal(result.code, "T0AT-7Q4JK");
  assert.equal(result.ready, true);
  assert.doesNotMatch(result.clean, /\[94m|\u001b/);
});

test("terminal formatting is removed even when the escape byte was dropped", () => {
  assert.equal(stripTerminalFormatting("[94mログインしてください[0m"), "ログインしてください");
});

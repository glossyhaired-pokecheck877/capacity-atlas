import test from "node:test";
import assert from "node:assert/strict";
import { extractJsonPayload, normalizeProviderPayload } from "../lib/normalize.js";

test("extractJsonPayload ignores CLI noise before JSON", () => {
  const output = `[codex notify] status changed\n[{"provider":"codex","usage":{"primary":{"usedPercent":21}}}]\n`;
  assert.deepEqual(extractJsonPayload(output), [{ provider: "codex", usage: { primary: { usedPercent: 21 } } }]);
});

test("normalizeProviderPayload converts used percent to remaining percent", () => {
  const payload = [{
    provider: "codex",
    source: "oauth",
    usage: {
      accountEmail: "owner@example.com",
      loginMethod: "pro",
      updatedAt: "2026-08-08T07:42:44Z",
      secondary: { usedPercent: 88, resetsAt: "2026-08-11T07:45:47Z", windowMinutes: 10080 }
    },
    openaiDashboard: { accountPlan: "Pro 20x" },
    credits: { remaining: 0 }
  }];
  const [account] = normalizeProviderPayload("codex", payload);
  assert.equal(account.email, "owner@example.com");
  assert.equal(account.plan, "Pro 20x");
  assert.equal(account.status, "healthy");
  assert.equal(account.windows[0].remainingPercent, 12);
  assert.equal(account.windows[0].kind, "weekly");
  assert.equal(account.creditsRemaining, 0);
});

test("normalizeProviderPayload keeps multiple accounts separate", () => {
  const payload = [
    { provider: "grok", usage: { accountEmail: "a@example.com", primary: { usedPercent: 2 } } },
    { provider: "grok", usage: { accountEmail: "b@example.com", primary: { usedPercent: 45 } } }
  ];
  const accounts = normalizeProviderPayload("grok", payload);
  assert.equal(accounts.length, 2);
  assert.deepEqual(accounts.map(a => a.windows[0].remainingPercent), [98, 55]);
  assert.notEqual(accounts[0].id, accounts[1].id);
});

test("normalizeProviderPayload exposes auth errors without fabricating quota", () => {
  const payload = [{ provider: "claude", source: "oauth", error: { code: 3, kind: "provider", message: "OAuth token expired" } }];
  const [account] = normalizeProviderPayload("claude", payload);
  assert.equal(account.status, "auth_required");
  assert.deepEqual(account.windows, []);
  assert.match(account.message, /expired/i);
});

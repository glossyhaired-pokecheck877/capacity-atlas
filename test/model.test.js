import test from "node:test";
import assert from "node:assert/strict";
import { accountTone, deriveSummary, primaryQuota } from "../public/model.js";

test("primaryQuota selects the lowest remaining capacity", () => {
  const account = { windows: [{ remainingPercent: 80 }, { remainingPercent: 12 }] };
  assert.equal(primaryQuota(account).remainingPercent, 12);
});

test("deriveSummary counts accounts and attention states", () => {
  const accounts = [
    { provider: "codex", status: "healthy", windows: [{ remainingPercent: 12 }] },
    { provider: "codex", status: "healthy", windows: [{ remainingPercent: 85 }] },
    { provider: "claude", status: "auth_required", windows: [] }
  ];
  assert.deepEqual(deriveSummary(accounts), {
    total: 3,
    providers: 2,
    attention: 2,
    averageRemaining: 49
  });
});

test("an authenticated account awaiting quota is not rendered as a danger state", () => {
  assert.equal(accountTone({ status: "connected", windows: [] }), "neutral");
});

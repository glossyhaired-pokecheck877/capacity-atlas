import test from "node:test";
import assert from "node:assert/strict";
import { buildCodexBarArgs, buildSingleAccountArgs, collectProvider, collectProviders, outputFromCommandFailure } from "../lib/collector.js";

test("buildCodexBarArgs requests every account only for supported providers", () => {
  assert.deepEqual(buildCodexBarArgs("codex"), ["usage", "--provider", "codex", "--all-accounts", "--json"]);
  assert.deepEqual(buildCodexBarArgs("claude"), ["usage", "--provider", "claude", "--all-accounts", "--json"]);
  assert.deepEqual(buildCodexBarArgs("grok"), ["usage", "--provider", "grok", "--json"]);
  assert.deepEqual(buildSingleAccountArgs("grok"), ["usage", "--provider", "grok", "--json"]);
});

test("collectProvider falls back to Claude's active account when no token accounts are configured", async () => {
  const calls = [];
  const runner = async (_command, args) => {
    calls.push(args);
    if (args.includes("--all-accounts")) {
      return '[{"provider":"claude","error":{"message":"No token accounts configured"}}]';
    }
    return '[{"provider":"claude","usage":{"accountEmail":"owner@example.com","primary":{"usedPercent":2}}}]';
  };
  const accounts = await collectProvider("claude", runner);
  assert.equal(calls.length, 2);
  assert.equal(accounts[0].status, "healthy");
  assert.equal(accounts[0].windows[0].remainingPercent, 98);
});

test("outputFromCommandFailure preserves provider JSON emitted with a nonzero exit", () => {
  const error = Object.assign(new Error("exit 3"), {
    stdout: '[{"provider":"claude","error":{"message":"OAuth token expired"}}]'
  });
  assert.match(outputFromCommandFailure(error), /OAuth token expired/);
});

test("collectProviders isolates a provider failure and returns the others", async () => {
  const runner = async (_command, args) => {
    const provider = args[2];
    if (provider === "claude") throw new Error("network timeout");
    return `[{"provider":"${provider}","usage":{"accountEmail":"${provider}@example.com","primary":{"usedPercent":10}}}]`;
  };
  const result = await collectProviders(["codex", "claude", "grok"], runner);
  assert.equal(result.accounts.length, 3);
  assert.equal(result.accounts.filter(a => a.status === "healthy").length, 2);
  assert.equal(result.accounts.find(a => a.provider === "claude").status, "unavailable");
});

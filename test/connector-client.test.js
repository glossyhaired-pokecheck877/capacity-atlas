import test from "node:test";
import assert from "node:assert/strict";
import { connectorBase, connectorIsCompatible, createConnectorClient } from "../public/connector-client.js";

test("hosted Capacity Atlas uses the local Connector loopback", () => {
  assert.equal(connectorBase({ hostname: "capacity-atlas.vercel.app" }), "http://127.0.0.1:4174");
  assert.equal(connectorBase({ hostname: "127.0.0.1" }), "");
  assert.equal(connectorBase({ hostname: "localhost" }), "");
});

test("Claude OAuth requires Connector v0.5.0 or newer", () => {
  assert.equal(connectorIsCompatible({ ready: true, version: "0.4.1" }), false);
  assert.equal(connectorIsCompatible({ ready: true, version: "0.5.0" }), true);
  assert.equal(connectorIsCompatible({ ready: true, version: "0.6.0" }), true);
  assert.equal(connectorIsCompatible({ ready: true }), false);
  assert.equal(connectorIsCompatible({ ready: false, version: "0.5.0" }), false);
});

test("Connector client reads status and starts account login", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).endsWith("/api/health")) return new Response('{"ready":true}', { status: 200, headers: { "content-type": "application/json" } });
    if (String(url).endsWith("/api/accounts")) return new Response('{"id":"login-1","status":"starting"}', { status: 202, headers: { "content-type": "application/json" } });
    return new Response('{"accounts":[]}', { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createConnectorClient({ base: "http://127.0.0.1:4174", fetch });
  assert.equal(client.url, "http://127.0.0.1:4174");
  assert.equal((await client.health()).ready, true);
  assert.equal((await client.startLogin("codex")).id, "login-1");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.body, JSON.stringify({ provider: "codex" }));
});

test("Connector client disconnects an account with an encoded DELETE request", async () => {
  const calls = [];
  const client = createConnectorClient({
    base: "http://127.0.0.1:4174",
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return new Response('{"removed":2}', { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const result = await client.disconnectAccount("codex:owner@example.com");
  assert.equal(result.removed, 2);
  assert.equal(calls[0].url, "http://127.0.0.1:4174/api/accounts/codex%3Aowner%40example.com");
  assert.equal(calls[0].options.method, "DELETE");
});

test("Connector client rejects non-JSON responses", async () => {
  const client = createConnectorClient({
    base: "http://127.0.0.1:4174",
    fetch: async () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } })
  });
  await assert.rejects(client.health(), /Connector/);
});

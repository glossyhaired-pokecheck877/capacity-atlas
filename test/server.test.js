import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "../server.js";

test("GET /api/status returns normalized account data", async (t) => {
  const collect = async () => ({
    collectedAt: "2026-08-08T07:00:00Z",
    accounts: [{ id: "1", provider: "codex", status: "healthy", windows: [] }]
  });
  const server = createServer({ collect, refreshMs: 60_000 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/status`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const body = await response.json();
  assert.equal(body.accounts[0].provider, "codex");
});

test("unknown API routes return JSON 404", async (t) => {
  const server = createServer({ collect: async () => ({ accounts: [] }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/missing`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "Not found");
});

test("Connector accepts only allowlisted web origins and private-network preflight", async (t) => {
  const server = createServer({ collect: async () => ({ accounts: [] }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    method: "OPTIONS",
    headers: {
      origin: "https://capacity-atlas.vercel.app",
      "access-control-request-private-network": "true"
    }
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://capacity-atlas.vercel.app");
  assert.equal(response.headers.get("access-control-allow-private-network"), "true");
});

test("DELETE /api/accounts disconnects only managed connections resolved by the server", async (t) => {
  const disconnected = [];
  let collectCount = 0;
  const accountManager = {
    homes: async () => ({ codex: [], claude: [], grok: [] }),
    disconnect: async ids => { disconnected.push(...ids); return { removed: ids.length }; }
  };
  const collect = async () => {
    collectCount += 1;
    return collectCount === 1
      ? { accounts: [{ id: "codex:owner@example.com", managedConnectionIds: ["managed-one", "managed-two"] }] }
      : { accounts: [] };
  };
  const server = createServer({ collect, accountManager });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/accounts/${encodeURIComponent("codex:owner@example.com")}`, { method: "DELETE" });
  assert.equal(response.status, 200);
  assert.deepEqual(disconnected, ["managed-one", "managed-two"]);
  assert.equal((await response.json()).removed, 2);
});

test("POST /api/accounts starts an isolated provider login", async (t) => {
  const starts = [];
  const accountManager = {
    homes: async () => ({ codex: [], claude: [], grok: [] }),
    start: async provider => { starts.push(provider); return { id: "login-1", provider, status: "starting" }; },
    get: id => ({ id, provider: "codex", status: "waiting", output: "Open login page" })
  };
  const server = createServer({ collect: async () => ({ accounts: [] }), accountManager });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "codex" })
  });
  assert.equal(response.status, 202);
  assert.deepEqual(starts, ["codex"]);
  assert.equal((await response.json()).id, "login-1");
});

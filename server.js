import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectDirectProviders } from "./lib/direct-collector.js";
import { AccountManager } from "./lib/account-manager.js";

const ROOT = fileURLToPath(new URL("./public/", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};
const ALLOWED_ORIGINS = new Set([
  "https://capacity-atlas.vercel.app"
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  if (!origin || !isAllowedOrigin(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-private-network": "true",
    vary: "Origin"
  };
}

function json(request, response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...corsHeaders(request)
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request, maxBytes = 10_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Invalid JSON");
    error.status = 400;
    throw error;
  }
}

function safePublicPath(pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const cleaned = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  return join(ROOT, cleaned);
}

export function createServer({ collect, refreshMs = 60_000, accountManager = new AccountManager() } = {}) {
  const collectAccounts = collect || (async () => collectDirectProviders({ homes: await accountManager.homes() }));
  let snapshot = null;
  let collectedAtMs = 0;
  let inFlight = null;

  async function getSnapshot(force = false) {
    const stale = Date.now() - collectedAtMs >= refreshMs;
    if (!force && snapshot && !stale) return snapshot;
    if (!inFlight) {
      inFlight = Promise.resolve(collectAccounts())
        .then(result => {
          snapshot = result;
          collectedAtMs = Date.now();
          return snapshot;
        })
        .finally(() => { inFlight = null; });
    }
    return inFlight;
  }

  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    try {
      if (url.pathname.startsWith("/api/") && request.headers.origin && !isAllowedOrigin(request.headers.origin)) {
        return json(request, response, 403, { error: "Origin not allowed" });
      }
      if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
        response.writeHead(204, corsHeaders(request));
        return response.end();
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json(request, response, 200, {
          name: "Capacity Atlas Connector",
          version: "0.7.2",
          ready: true,
          codexBar: false
        });
      }
      if (request.method === "GET" && url.pathname === "/api/status") {
        return json(request, response, 200, await getSnapshot(false));
      }
      if (request.method === "POST" && url.pathname === "/api/refresh") {
        return json(request, response, 200, await getSnapshot(true));
      }
      if (request.method === "POST" && url.pathname === "/api/accounts") {
        const body = await readJsonBody(request);
        if (!["codex", "claude", "grok"].includes(body.provider)) {
          return json(request, response, 400, { error: "Unsupported provider" });
        }
        return json(request, response, 202, await accountManager.start(body.provider));
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/api/accounts/")) {
        const accountId = decodeURIComponent(url.pathname.slice("/api/accounts/".length));
        const current = await getSnapshot(false);
        const account = current.accounts?.find(item => item.id === accountId);
        if (!account) return json(request, response, 404, { error: "Account not found" });
        const connectionIds = Array.isArray(account.managedConnectionIds) ? account.managedConnectionIds : [];
        if (!connectionIds.length) {
          return json(request, response, 409, { error: "標準CLI認証はCapacity Atlasから解除できません。" });
        }
        const result = await accountManager.disconnect(connectionIds);
        snapshot = null;
        collectedAtMs = 0;
        return json(request, response, 200, result);
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/login/")) {
        const session = accountManager.get(decodeURIComponent(url.pathname.slice("/api/login/".length)));
        return session
          ? json(request, response, 200, session)
          : json(request, response, 404, { error: "Login session not found" });
      }
      if (url.pathname.startsWith("/api/")) {
        return json(request, response, 404, { error: "Not found" });
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        return json(request, response, 405, { error: "Method not allowed" });
      }

      const file = safePublicPath(url.pathname);
      const fileStat = await stat(file);
      if (!fileStat.isFile()) throw Object.assign(new Error("Not found"), { code: "ENOENT" });
      const content = await readFile(file);
      response.writeHead(200, {
        "content-type": TYPES[extname(file)] || "application/octet-stream",
        "cache-control": extname(file) === ".html" ? "no-cache" : "public, max-age=300",
        "x-content-type-options": "nosniff"
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (error.code === "ENOENT") return json(request, response, 404, { error: "Not found" });
      return json(request, response, error.status || 500, {
        error: error.status ? error.message : "Connector failed",
        message: error.status ? undefined : error.message
      });
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT || 4174);
  const host = process.env.HOST || "127.0.0.1";
  createServer().listen(port, host, () => {
    console.log(`Capacity Atlas Connector listening on http://${host}:${port}`);
  });
}

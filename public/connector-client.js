export function connectorBase(location = globalThis.location) {
  return ["127.0.0.1", "localhost"].includes(location?.hostname) ? "" : "http://127.0.0.1:4174";
}

export function connectorIsCompatible(health, minimum = "0.5.0") {
  if (!health?.ready || !/^\d+\.\d+\.\d+$/.test(health.version || "")) return false;
  const current = health.version.split(".").map(Number);
  const required = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > required[index]) return true;
    if (current[index] < required[index]) return false;
  }
  return true;
}

export function createConnectorClient({ base = connectorBase(), fetch = globalThis.fetch } = {}) {
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        cache: "no-store",
        mode: base ? "cors" : "same-origin",
        ...options,
        headers: {
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(options.headers || {})
        }
      });
    } catch {
      throw new Error("Capacity Atlas Connectorへ接続できません。");
    }
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/json")) {
      throw new Error("Capacity Atlas Connectorから有効な応答を取得できません。");
    }
    return response.json();
  }

  return {
    url: base || globalThis.location?.origin || "http://127.0.0.1:4174",
    health: () => request("/api/health"),
    status: () => request("/api/status"),
    refresh: () => request("/api/refresh", { method: "POST" }),
    startLogin: provider => request("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ provider })
    }),
    disconnectAccount: id => request(`/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    loginStatus: id => request(`/api/login/${encodeURIComponent(id)}`)
  };
}

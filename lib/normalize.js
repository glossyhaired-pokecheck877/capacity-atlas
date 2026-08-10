import { createHash } from "node:crypto";

const PROVIDER_NAMES = {
  codex: "GPT / Codex",
  claude: "Claude",
  grok: "Grok"
};

export function extractJsonPayload(output) {
  const lines = String(output).trim().split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines.slice(index).join("\n").trim();
    if (!candidate.startsWith("[") && !candidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(candidate);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Keep scanning past non-JSON CLI notices such as "[codex notify]".
    }
  }
  throw new Error("CodexBar did not return a JSON payload");
}

function classifyWindow(window = {}) {
  if (window.windowMinutes >= 10080) return "weekly";
  if (window.windowMinutes >= 1440) return "daily";
  if (window.windowMinutes) return "session";
  return "primary";
}

function normalizeWindow(window, title) {
  if (!window || typeof window.usedPercent !== "number") return null;
  return {
    title: title || classifyWindow(window),
    kind: classifyWindow(window),
    usedPercent: window.usedPercent,
    remainingPercent: Math.max(0, Math.min(100, 100 - window.usedPercent)),
    resetsAt: window.resetsAt || null,
    resetDescription: window.resetDescription || null,
    windowMinutes: window.windowMinutes || null
  };
}

function accountId(provider, identity) {
  return createHash("sha256").update(`${provider}:${identity}`).digest("hex").slice(0, 16);
}

function errorStatus(message = "") {
  return /auth|oauth|token|login|logged in|expired|credential/i.test(message)
    ? "auth_required"
    : "unavailable";
}

export function normalizeProviderPayload(provider, payload) {
  const entries = Array.isArray(payload) ? payload : [payload];
  return entries.map((entry, index) => {
    if (entry.error) {
      const message = entry.error.message || "Provider unavailable";
      return {
        id: accountId(provider, `error-${index}`),
        provider,
        providerName: PROVIDER_NAMES[provider] || provider,
        email: null,
        label: `${PROVIDER_NAMES[provider] || provider} account`,
        plan: null,
        status: errorStatus(message),
        message,
        source: entry.source || null,
        updatedAt: null,
        creditsRemaining: null,
        windows: []
      };
    }

    const usage = entry.usage || {};
    const identity = usage.identity || {};
    const email = usage.accountEmail || identity.accountEmail || null;
    const loginMethod = usage.loginMethod || identity.loginMethod || null;
    const windows = [
      normalizeWindow(usage.primary, "Primary"),
      normalizeWindow(usage.secondary, "Weekly"),
      normalizeWindow(usage.tertiary, "Tertiary"),
      ...(usage.extraRateWindows || []).map(item => normalizeWindow(item.window, item.title))
    ].filter(Boolean);
    const plan = entry.openaiDashboard?.accountPlan || loginMethod || null;
    const identityKey = email || identity.accountOrganization || `${provider}-${index}`;

    return {
      id: accountId(provider, identityKey),
      provider,
      providerName: PROVIDER_NAMES[provider] || provider,
      email,
      label: email || `${PROVIDER_NAMES[provider] || provider} account ${index + 1}`,
      plan,
      status: "healthy",
      message: entry.pace?.secondary?.summary || null,
      source: entry.source || null,
      updatedAt: usage.updatedAt || entry.openaiDashboard?.updatedAt || null,
      creditsRemaining: entry.credits?.remaining ?? entry.openaiDashboard?.creditsRemaining ?? null,
      windows
    };
  });
}

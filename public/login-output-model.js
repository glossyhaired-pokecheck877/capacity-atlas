export function stripTerminalFormatting(value) {
  return String(value || "")
    .replace(/\u001b?\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "")
    .trim();
}

export function parseBrowserLogin(value) {
  const clean = stripTerminalFormatting(value);
  const urls = clean.match(/https:\/\/[^\s]+/g) || [];
  const url = urls.find(item => item.includes("auth.openai.com/oauth/authorize")) || urls[0] || null;
  return { clean, url, ready: Boolean(url) };
}

export function parseDeviceLogin(value) {
  const clean = stripTerminalFormatting(value);
  const url = clean.match(/https:\/\/[^\s]+/)?.[0]?.replace(/[),.;]+$/, "") || null;
  const codes = clean.match(/\b[A-Z0-9]{3,8}-[A-Z0-9]{3,8}\b/g) || [];
  return {
    clean,
    url,
    code: codes.at(-1) || null,
    ready: Boolean(url && codes.length)
  };
}

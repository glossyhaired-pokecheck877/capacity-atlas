import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expectedCsp = "default-src 'self'; connect-src 'self' http://127.0.0.1:4174; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

async function config(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

function headerValue(document, key) {
  return document.headers?.flatMap(rule => rule.headers || []).find(header => header.key === key)?.value;
}

test("root and static Vercel configs preserve the same strict Content Security Policy", async () => {
  const [rootConfig, staticConfig] = await Promise.all([
    config("../vercel.json"),
    config("../public/vercel.json")
  ]);
  assert.equal(headerValue(rootConfig, "Content-Security-Policy"), expectedCsp);
  assert.equal(headerValue(staticConfig, "Content-Security-Policy"), expectedCsp);
});

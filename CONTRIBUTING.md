# Contributing to Capacity Atlas

Thank you for helping improve Capacity Atlas.

## Development

Requirements: Node.js 20 or newer.

```bash
npm ci
npm run check
npm test
npm run build
npm start
```

The local Connector binds only to `127.0.0.1:4174`.

## Pull requests

1. Open an issue for security-sensitive or protocol-level changes before implementation.
2. Add or update regression tests for every behavior change.
3. Run `npm run check && npm test && npm run build`.
4. Never commit OAuth tokens, cookies, provider credential files, `.env` files, local account metadata, or generated release binaries.
5. Keep authentication and quota-retrieval states separate. A quota API failure must not automatically be treated as a lost login.

## Provider integrations

Provider quota endpoints may be undocumented or unstable. Keep provider-specific logic isolated, label best-effort behavior accurately, and preserve upstream license notices.

## Design scope

Capacity Atlas observes and manages account capacity. It does not automatically switch accounts, route prompts, or relay model traffic.

# Capacity Atlas

[日本語](README.md) | **English**

**All your AI capacity in one dashboard.**

Capacity Atlas is a local-first, open-source dashboard for monitoring remaining capacity, reset times, and authentication status across multiple OpenAI Codex, Claude, and Grok accounts.

It does not switch accounts automatically, proxy prompts, or relay model traffic.

![Capacity Atlas dashboard](docs/assets/dashboard.png)

## Download

No preinstalled Node.js runtime or provider CLI is required.

- [Download for macOS Apple Silicon](https://github.com/meem0601/capacity-atlas/releases/latest/download/Capacity-Atlas-Connector-macOS-arm64.zip)
- [Download for Windows x64](https://github.com/meem0601/capacity-atlas/releases/latest/download/Capacity-Atlas-Connector-Windows-x64.zip)
- [View all releases](https://github.com/meem0601/capacity-atlas/releases)

Launch the Connector, click **Add account**, and complete OAuth in your browser.

## Highlights

- Dashboard-first interface with no marketing landing screen
- Multiple accounts across OpenAI Codex, Claude, and Grok
- Remaining capacity, reset time, plan, and authentication state
- Automatic merging of duplicate connections for the same account
- Safe removal of Capacity Atlas-managed profiles only
- No fabricated account cards on a new machine
- Local Connector with a hosted static UI
- Provider credentials remain on the local machine

## Privacy and security

The hosted page is a static UI. The local Connector reads credentials from provider-owned stores and requests quota information directly from provider endpoints.

Capacity Atlas does **not** send access tokens, refresh tokens, cookies, or raw quota responses to the hosted UI or to a Capacity Atlas backend.

The Connector listens on `127.0.0.1:4174` and restricts browser origins. Do not expose it to a LAN or the public internet.

Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## Supported platforms

| Platform | Connector release | Source development |
| --- | --- | --- |
| macOS Apple Silicon | Yes | Yes |
| Windows x64 | Yes | Yes |
| Linux | Not yet packaged | Yes |

## Supported providers

| Provider | Authentication | Quota source |
| --- | --- | --- |
| OpenAI Codex | Browser OAuth | OpenAI usage endpoint |
| Claude | Browser OAuth through the official Claude helper | Claude usage endpoint |
| Grok | Browser OAuth through the official Grok helper | xAI billing endpoint |

Provider quota endpoints are not guaranteed stable third-party APIs. Provider-side changes may temporarily break collection.

## Run from source

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/meem0601/capacity-atlas.git
cd capacity-atlas
npm ci
npm run check
npm test
npm run build
npm start
```

Open [http://127.0.0.1:4174](http://127.0.0.1:4174).

## Build release packages

Official Codex archives are downloaded from GitHub Releases and verified against pinned SHA-256 checksums before packaging. Provider executables are not committed to this repository.

```bash
npm run prepare:codex
npm run build:release
```

Output is written to `release/`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and pull requests are welcome. Never include real credentials, local state, or account data in an issue or fixture.

## License

[MIT License](LICENSE). Third-party notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Capacity Atlas is an independent project and is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, or xAI. Their names and marks belong to their respective owners.

# Security Policy

## Reporting a vulnerability

Please do not disclose credential exposure, authentication bypasses, arbitrary file access, or loopback API vulnerabilities in a public issue. Contact the repository maintainer privately through GitHub Security Advisories.

Do not include real OAuth tokens, cookies, API keys, account exports, or credential files in reports. Use redacted logs and minimal synthetic reproductions.

## Security model

- The Connector binds to `127.0.0.1` only.
- Browser origins are allowlisted.
- Provider credentials remain in provider-managed local credential storage.
- The hosted UI does not receive or persist provider credentials or real quota data.
- Capacity Atlas never asks users to paste tokens into the browser UI.

## Supported versions

Security fixes are applied to the latest release line.

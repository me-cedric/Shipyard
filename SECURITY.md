# Security Policy

## Supported versions

Shipyard 0.1.x gets security fixes.

## Report a vulnerability

Do not post details in a public issue.

- Open a private security advisory: https://github.com/me-cedric/Shipyard/security/advisories/new

Include:

- the affected Shipyard version
- clear steps to reproduce
- the security impact

Do not include real tokens, passwords, private keys, private host names or unredacted logs.

## In scope

- Secret handling
- The IPC between the interface and the Rust core
- The MCP server
- Agent sandboxing
- The Content Security Policy (CSP)

## Automated scan

The scheduled security scan is in `.github/workflows/security.yml`.

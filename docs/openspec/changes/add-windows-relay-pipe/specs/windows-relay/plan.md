# Plan: windows-relay

Spec: [spec.md](./spec.md)
Date: 2026-11-05

## Summary

Give `relay.rs` a Windows transport next to the Unix socket. This covers REQ-001 and REQ-002.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace. No new runtime. |
| Dependencies | Prefer the named pipe types of `tokio` (already in the tree) or the standard library; no new crate if one of them fits. |
| Data/storage | None. |
| APIs/contracts | Pipe name from the data folder of the app, like `socket_path`. |
| Risks | Not testable on a Mac (Q-096): it needs a Windows CI job or a Windows machine. The pipe must refuse other users. |

## Affected Surfaces

- Code: `crates/shipyard-mcp/src/relay.rs`, `crates/shipyard-app/src/lib.rs`.
- Tests: `crates/shipyard-mcp/tests/` (Windows only), `.github/workflows/ci.yml`.
- Docs/specs: `docs/models/architecture.c4` if the transport shows there, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Approach

1. Add a Windows job to CI for the relay tests.
2. Write the tests, then the named pipe transport.

## Validation

```bash
cargo test -p shipyard-mcp
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-windows-relay-pipe --strict
```

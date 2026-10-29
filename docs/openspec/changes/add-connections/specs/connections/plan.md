# Plan: connections

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

The `Tracker` trait and its six adapters live in `shipyard-trackers`. The `Forge` trait lives in `shipyard-forges`. Runners, providers and MCP server control live in `shipyard-agents`. Secrets go through one keychain module. The UI is `src/features/settings/connections/`. This covers REQ-001 to REQ-016.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). |
| Dependencies | No new dependency decided here. Use the `keyring` crate if the workspace has none for the OS keychain. Confirm in W2. |
| Data/storage | Secrets in the OS keychain. Non-secret settings in the app data folder (Q-018 assumption). `.shipyard/project.yaml` names the connection id. |
| APIs/contracts | `Tracker` trait with six capability flags and one work item type in `shipyard-core`. `Forge` trait. IPC commands `connections_list`, `connections_add`, `connections_test`, `connections_remove`, `mcp_start`, `mcp_stop`, `runners_detect`. Bindings are generated. |
| Tracker isolation | Each adapter maps its API shape to the work item type. Custom fields stay inside the adapter. |
| Capability flags | The trait returns a flag set. Callers check a flag before a call. A call without the flag returns a typed unsupported error. |
| Secrets | One keychain module. A secret never enters an argument, a URL or a log. Log lines pass through a redaction step. |
| Credential sources | Keychain only (Q-017 assumption). A helper source is a later option. |
| Connection test | Each adapter has a read-only `test` method that returns the missing scope or permission. |
| MCP control | `shipyard-agents` spawns the process, tracks its state and stops it at app quit. A dependency check runs before spawn. |
| MCP relay | A unix socket in an owner-only folder (macOS, Linux). The Windows named pipe is open: until then the relay starts the server itself. |
| Risks | Tracker APIs drift. Contract tests with recorded fakes cover each adapter. Q-017 and Q-018 stay open. |

## Affected Surfaces

- Code: `crates/shipyard-core` (work item type, flags), `crates/shipyard-trackers`, `crates/shipyard-forges`, `crates/shipyard-agents`, `crates/shipyard-mcp` (proxy and relay of third-party MCP servers, REQ-017, REQ-018), `crates/shipyard-app` (commands), `src/features/settings/connections/`.
- Tests: `crates/*/tests`, `src/features/settings/connections/*.test.tsx`, `e2e/connections.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-connections/`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-017, Q-018.

## Approach

1. Define the work item type and the flag set in `shipyard-core`.
2. Write the `Tracker` trait, the contract test suite and a fake. Add the six adapters one by one against the suite.
3. Write the `Forge` trait and three adapters.
4. Add the keychain module and the log redaction.
5. Add runner detection, the HTTP provider client and MCP server control with the dependency check.
6. Add the connection test for each kind.
7. Add the IPC commands and the `conn:` entity.
8. Build Settings / Connections. Add French and English keys.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-trackers
cargo test -p shipyard-forges
cargo test -p shipyard-agents
pnpm vitest run src/features/settings/connections
pnpm playwright test e2e/connections.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-connections --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

# Tasks: connections

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write flag and work item shape tests in `crates/shipyard-core/tests/work_item.rs`. Covers REQ-003, REQ-004.
- [x] T002 Implement the work item type and the flag set in `crates/shipyard-core/src/work_item.rs`. Covers REQ-003, REQ-004. `shipyard-trackers` re-exports them.
- [x] T003 Write the tracker contract suite and a fake in `crates/shipyard-trackers/tests/contract.rs`. Covers REQ-002, REQ-003, REQ-004, REQ-012.
- [x] T004 Implement the `Tracker` trait and the six adapters in `crates/shipyard-trackers/src/`. Covers REQ-002, REQ-003, REQ-004, REQ-012.
- [x] T005 Write forge contract tests in `crates/shipyard-forges/tests/contract.rs`. Covers REQ-005, REQ-012, REQ-019.
- [ ] T006 Implement the `Forge` trait and three adapters in `crates/shipyard-forges/src/`. Covers REQ-005, REQ-012, REQ-019. Done except: create a remote repository (a write), and the Azure DevOps push marker.
- [x] T007 Write keychain and redaction tests with a fake keychain in `crates/shipyard-secrets/tests/secrets.rs`. Covers REQ-011, REQ-014.
- [x] T008 Implement the keychain module and log redaction in `crates/shipyard-secrets/src/lib.rs`. The one HTTP client is in `crates/shipyard-http/`. Covers REQ-011, REQ-014.
- [x] T009 Write runner detection and provider tests in `crates/shipyard-agents/tests/runners.rs`. Covers REQ-009, REQ-010.
- [x] T010 Implement runner detection and the HTTP provider client in `crates/shipyard-agents/src/runners.rs`. Covers REQ-009, REQ-010.
- [x] T011 Write MCP start, stop and dependency tests in `crates/shipyard-agents/tests/mcp_control.rs`. Covers REQ-006, REQ-007, REQ-008.
- [x] T012 Implement the MCP catalogue, custom servers, control and dependency install in `crates/shipyard-agents/src/mcp_control.rs`. Covers REQ-006, REQ-007, REQ-008.
- [x] T012b Write MCP proxy and relay tests in `crates/shipyard-mcp/tests/proxy.rs`. Covers REQ-017, REQ-018.
- [ ] T012c Implement the MCP proxy and the relay in `crates/shipyard-mcp/src/proxy.rs` and `crates/shipyard-mcp/src/relay.rs`. Covers REQ-017, REQ-018. Done except: the Windows named pipe. On Windows the relay starts the server itself.
- [x] T012a Write settings store and `conn:` entity tests in `crates/shipyard-app/tests/connections.rs`. Covers REQ-013, REQ-015. The `conn:` resolve test is in `crates/shipyard-app/src/commands/refs.rs`.
- [x] T013 Add the connection settings store and the `conn:` entity in `crates/shipyard-app/src/connections.rs`, the commands in `crates/shipyard-app/src/commands/connections.rs`, then regenerate the bindings with the project command. Covers REQ-013, REQ-014, REQ-015. `.shipyard/project.yaml` names the connection ids in `connections.tracker` and `connections.forge` (Q-018 working assumption, owned by `projects`).
- [x] T014 Write view tests in `src/features/settings/connections/connections.test.tsx`. Covers REQ-001, REQ-003, REQ-012, REQ-014, REQ-016.
- [ ] T015 Implement Settings / Connections in `src/features/settings/connections/`. Covers REQ-001, REQ-003, REQ-006, REQ-007, REQ-009, REQ-012, REQ-014, REQ-016, REQ-019. The MCP servers, runners and model providers groups are done, with live state, start, stop, Start all and the dependency install (REQ-006, REQ-007, REQ-009, REQ-010), the commands in `crates/shipyard-app/src/agents.rs` and the relay entry `shipyard --mcp-relay <id>` in `shipyard-cli`. Open: the create-remote action (REQ-019), and a `conn:` entity for an MCP server, a runner and a provider (REQ-015: only trackers and forges resolve).
- [x] T016 [P] Add French and English keys in `src/lib/i18n/` for `connections`. Covers REQ-016.
- [x] T017 Write the end-to-end test in `e2e/connections.spec.ts`. Covers REQ-001, REQ-011, REQ-012, REQ-014.
- [x] T018 Add one entry to `CHANGELOG.md` and `CHANGELOG.fr.md`.
- [ ] T019 Run the validation commands from `plan.md`.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

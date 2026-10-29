# Tasks: connections

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [ ] T001 Write flag and work item shape tests in `crates/shipyard-core/tests/work_item.rs`. Covers REQ-003, REQ-004.
- [ ] T002 Implement the work item type and the flag set in `crates/shipyard-core/src/work_item.rs`. Covers REQ-003, REQ-004.
- [x] T003 Write the tracker contract suite and a fake in `crates/shipyard-trackers/tests/contract.rs`. Covers REQ-002, REQ-003, REQ-004, REQ-012.
- [x] T004 Implement the `Tracker` trait and the six adapters in `crates/shipyard-trackers/src/`. Covers REQ-002, REQ-003, REQ-004, REQ-012. The work item type lives in `crates/shipyard-trackers/src/model.rs` until T002 moves it to core.
- [x] T005 Write forge contract tests in `crates/shipyard-forges/tests/contract.rs`. Covers REQ-005, REQ-012, REQ-019.
- [ ] T006 Implement the `Forge` trait and three adapters in `crates/shipyard-forges/src/`. Covers REQ-005, REQ-012, REQ-019. Done except: create a remote repository (a write), and the Azure DevOps push marker.
- [x] T007 Write keychain and redaction tests with a fake keychain in `crates/shipyard-secrets/tests/secrets.rs`. Covers REQ-011, REQ-014.
- [x] T008 Implement the keychain module and log redaction in `crates/shipyard-secrets/src/lib.rs`. The one HTTP client is in `crates/shipyard-http/`. Covers REQ-011, REQ-014.
- [ ] T009 Write runner detection and provider tests in `crates/shipyard-agents/tests/runners.rs`. Covers REQ-009, REQ-010.
- [ ] T010 Implement runner detection and the HTTP provider client in `crates/shipyard-agents/src/runners.rs`. Covers REQ-009, REQ-010.
- [ ] T011 Write MCP start, stop and dependency tests in `crates/shipyard-agents/tests/mcp_control.rs`. Covers REQ-006, REQ-007, REQ-008.
- [ ] T012 Implement the MCP catalogue, custom servers and control in `crates/shipyard-agents/src/mcp_control.rs`. Covers REQ-006, REQ-007, REQ-008.
- [ ] T012b Write MCP proxy and relay tests in `crates/shipyard-mcp/tests/proxy.rs`. Covers REQ-017, REQ-018.
- [ ] T012c Implement the MCP proxy and the relay in `crates/shipyard-mcp/src/proxy.rs` and `crates/shipyard-mcp/src/relay.rs`. Covers REQ-017, REQ-018.
- [ ] T012a Write settings store and `conn:` entity tests in `crates/shipyard-app/tests/connections.rs`. Covers REQ-013, REQ-015.
- [ ] T013 Add the connection settings store and the `conn:` entity in `crates/shipyard-app/src/connections.rs`, then regenerate the bindings with the project command. Covers REQ-013, REQ-014, REQ-015.
- [ ] T014 Write view tests in `src/features/settings/connections/connections.test.tsx`. Covers REQ-001, REQ-003, REQ-012, REQ-014, REQ-016.
- [ ] T015 Implement Settings / Connections in `src/features/settings/connections/`. Covers REQ-001, REQ-003, REQ-006, REQ-007, REQ-009, REQ-012, REQ-014, REQ-016.
- [ ] T016 [P] Add French and English keys in `src/i18n/` for `connections`. Covers REQ-016.
- [ ] T017 Write the end-to-end test in `e2e/connections.spec.ts`. Covers REQ-001, REQ-011, REQ-012, REQ-014.
- [ ] T018 Add one entry to `CHANGELOG.md` and `CHANGELOG.fr.md`.
- [ ] T019 Run the validation commands from `plan.md`.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

# Tasks: factory

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write transition table tests in `crates/shipyard-core/tests/run_state.rs`. Covers REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-007.
- [x] T002 Implement the run states, the transition table and the backoff in `crates/shipyard-core/src/run.rs`. Covers REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-007.
- [x] T003 Write workflow model and schema tests in `crates/shipyard-core/tests/workflow.rs`. Covers REQ-010, REQ-012, REQ-014, REQ-035.
- [x] T004 Implement the workflow model, `crates/shipyard-core/schema/workflow.schema.json` and the `needs` cycle check in `crates/shipyard-core/src/workflow.rs`. Covers REQ-010, REQ-012, REQ-014, REQ-035.
- [x] T005 Add the five default workflows and the seven default roles in `crates/shipyard-store/templates/factory/`, and validate them in `crates/shipyard-store/tests/factory_files.rs` (the store owns the templates). Covers REQ-011, REQ-014.
- [x] T006 Write run log and codec tests in `crates/shipyard-store/tests/run_log.rs`. Covers REQ-008, REQ-021, REQ-025, REQ-034.
- [x] T007 Implement the append-only run log, the automation file codec with the state mapping, and the workflow reload with last valid version in `crates/shipyard-store/src/run_log.rs` and `crates/shipyard-store/src/factory_files.rs`. Covers REQ-008, REQ-010, REQ-021, REQ-025.
- [x] T008 Write engine tests with a fake tracker, fake runner and fake clock in `crates/shipyard-engine/tests/engine.rs`. Covers REQ-006, REQ-007, REQ-009, REQ-013, REQ-022, REQ-023, REQ-024, REQ-035, REQ-036.
- [x] T009 Implement dispatch, retry, clocks, budgets, stall, max turns, fan-out and kill switches in `crates/shipyard-engine/src/run_engine.rs`. Covers REQ-006, REQ-007, REQ-009, REQ-013, REQ-022, REQ-023, REQ-024, REQ-035, REQ-036.
- [x] T010 Write approval tests in `crates/shipyard-engine/tests/approvals.rs`. Covers REQ-025, REQ-026.
- [x] T011 Implement the write switches and approvals in `crates/shipyard-engine/src/approvals.rs`. Covers REQ-025, REQ-026.
- [x] T012 Write runner tests with a fake CLI in `crates/shipyard-agents/tests/runner.rs`. Covers REQ-015.
- [x] T013 Implement the runner trait, the streamed JSON reader and the first adapters in `crates/shipyard-agents/src/runner.rs`. Covers REQ-015.
- [x] T014 Write worktree tests in `crates/shipyard-git/tests/worktree.rs`. Covers REQ-013.
- [x] T015 Implement one worktree per child in `crates/shipyard-git/src/worktree.rs`. Covers REQ-013.
- [x] T016 Write tool tests in `crates/shipyard-mcp/tests/tools.rs` and `crates/shipyard-mcp/tests/transport.rs`. Covers REQ-016, REQ-017, REQ-018, REQ-019, REQ-020, REQ-037.
- [x] T017 Implement the eight tools in `crates/shipyard-mcp/src/tools/agent.rs`, the server in `src/server.rs` and the transports in `src/transport.rs`. Covers REQ-016, REQ-017, REQ-018, REQ-019, REQ-020, REQ-037.
- [x] T017b Write bridge and entry tests in `crates/shipyard-cli/tests/bridge.rs`, `crates/shipyard-cli/src/bridge.rs` and `crates/shipyard-agents/tests/runner.rs`. Covers REQ-037.
- [x] T017c Implement `shipyard --mcp-bridge` in `crates/shipyard-cli/src/bridge.rs` and the `shipyard` MCP entry of a run in `crates/shipyard-agents/src/runner/shipyard.rs`. Covers REQ-037.
- [x] T017d Write join tests in `crates/shipyard-engine/tests/children.rs` and join the child worktrees at fan-in in `crates/shipyard-engine/src/children.rs`. Covers REQ-013.
- [x] T017e Write restart tests in `crates/shipyard-engine/tests/restart.rs` and keep runs, approvals, questions and the kill switch across a restart in `crates/shipyard-engine/src/persist.rs` and `crates/shipyard-store/src/run_log.rs`. Covers REQ-021, REQ-039.
- [x] T017f Write tool tests in `crates/shipyard-engine/tests/tools.rs` and build `handoff`, `message`, `spawn_subtask` and `read_ref` in `crates/shipyard-engine/src/tools.rs`. Covers REQ-019, REQ-020.
- [x] T017g Write a squash and port contract test in `crates/shipyard-git/tests/squash.rs` and `crates/shipyard-git/tests/merge_child_port.rs`, and join a child as one commit in `crates/shipyard-git/src/delivery.rs`. Covers REQ-013.
- [x] T017h Move a run to `Merged` when its pull request merges during a fix round, in `crates/shipyard-core/src/run.rs` and `crates/shipyard-engine/tests/feedback.rs`. Covers REQ-002.
- [x] T018 Add the IPC commands and events in `crates/shipyard-app/src/factory.rs`, then regenerate the bindings with the project command. Covers REQ-001 to REQ-039. Wire `Factory::set_refs`, the `Git` adapter, and the Inbox items of `Factory::messages`.
- [x] T019 Write view and Settings control tests in `src/features/factory/factory.test.tsx`. Covers the Settings controls of REQ-008 and REQ-025, and REQ-027, REQ-038, REQ-028, REQ-029, REQ-030, REQ-031, REQ-032, REQ-033.
- [x] T020 Implement the six views in `src/features/factory/`. Covers the Settings controls of REQ-008 and REQ-025, and REQ-027, REQ-038, REQ-028, REQ-029, REQ-030, REQ-031, REQ-032, REQ-033, REQ-034.
- [x] T021 [P] Add French and English keys in `src/i18n/` for `factory`. Covers REQ-033.
- [x] T022 Write the end-to-end test in `e2e/factory.spec.ts`. Covers REQ-003, REQ-024, REQ-026, REQ-027, REQ-028.
- [x] T023 [P] Add one entry to `CHANGELOG.md` and `CHANGELOG.fr.md`.
- [x] T024 Run the validation commands from `plan.md`.
- [ ] T025 Compare the code with `spec.md` and update stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

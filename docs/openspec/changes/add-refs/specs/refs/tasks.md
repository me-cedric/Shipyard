# Tasks: refs

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write grammar tests for every kind in `crates/shipyard-core/tests/refs_grammar.rs`. Covers REQ-001, REQ-002.
- [x] T002 Implement the ref types and the parser in `crates/shipyard-core/src/refs.rs`. Covers REQ-001, REQ-002.
- [x] T003 Write detection tests in `crates/shipyard-core/tests/refs_detect.rs`. Covers REQ-005.
- [x] T004 Implement text detection in `crates/shipyard-core/src/refs.rs`. Covers REQ-005.
- [x] T005 Write index tests with fixture files, mirror rows and run log rows in `crates/shipyard-store/tests/ref_index.rs`. Covers REQ-003, REQ-004, REQ-006.
- [x] T006 Implement the index and its writers in `crates/shipyard-store/src/ref_index.rs`. Covers REQ-003, REQ-004, REQ-006.
- [x] T007 Write backlinks, search and check tests in `crates/shipyard-store/tests/ref_query.rs`. Covers REQ-007, REQ-008, REQ-009, REQ-010.
- [x] T008 Implement backlinks, search and check in `crates/shipyard-store/src/ref_query.rs`. Covers REQ-007, REQ-008, REQ-009, REQ-010.
- [x] T009 Write a `read_ref` test with a fake index in `crates/shipyard-mcp/tests/read_ref.rs`. Covers REQ-014.
- [x] T010 Implement `read_ref` in `crates/shipyard-mcp/src/tools/read_ref.rs`. Covers REQ-014.
- [ ] T011 Add the IPC commands in `crates/shipyard-app/src/refs.rs`, then regenerate the bindings with the project command. Covers REQ-006 to REQ-010.
- [ ] T012 Write RefChip and BacklinkList tests in `src/features/refs/refs.test.tsx`. Covers REQ-007, REQ-011, REQ-012, REQ-013.
- [ ] T013 Implement RefChip behaviour and BacklinkList in `src/features/refs/`. Covers REQ-007, REQ-011, REQ-012, REQ-013.
- [ ] T014 [P] Add French and English keys in `src/i18n/` for `refs`. Covers REQ-013.
- [ ] T015 Write the end-to-end test in `e2e/refs.spec.ts`. Covers REQ-007, REQ-008, REQ-011.
- [ ] T016 Add one entry to `CHANGELOG.md` and `CHANGELOG.fr.md`.
- [ ] T017 Run the validation commands from `plan.md`.
- [ ] T018 Compare the code with `spec.md` and update stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

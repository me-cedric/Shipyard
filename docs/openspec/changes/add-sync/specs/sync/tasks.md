# Tasks: sync

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write reconcile and pickup rule tests in `crates/shipyard-core/tests/pickup.rs`. Covers REQ-003, REQ-004, REQ-006, REQ-007.
- [x] T002 Implement the reconcile and pickup rules in `crates/shipyard-core/src/pickup.rs`. Covers REQ-003, REQ-004, REQ-006, REQ-007.
- [x] T003 Write mirror and atomic claim tests in `crates/shipyard-store/tests/mirror.rs`. Covers REQ-005, REQ-008, REQ-010.
- [x] T004 Implement the mirror and the claim table in `crates/shipyard-store/src/mirror.rs`. Covers REQ-005, REQ-008, REQ-010, REQ-016.
- [x] T005 Write `automation.yaml` codec tests in `crates/shipyard-store/tests/automation_file.rs`. Covers REQ-004, REQ-006, REQ-007.
- [x] T006 Implement the `automation.yaml` codec in `crates/shipyard-store/src/automation_file.rs`. Covers REQ-004, REQ-006, REQ-007.
- [x] T007 Write tick tests with a fake clock and fake trackers in `crates/shipyard-engine/tests/tick.rs`. Covers REQ-001, REQ-002, REQ-003, REQ-014.
- [x] T008 Implement the tick loop in `crates/shipyard-engine/src/tick.rs`. Covers REQ-001, REQ-002, REQ-003, REQ-014.
- [x] T009 Write claim, stamp and stale takeover tests with two fake machines in `crates/shipyard-engine/tests/claims.rs`. Covers REQ-008, REQ-009, REQ-010.
- [x] T010 Implement claims and stamps in `crates/shipyard-engine/src/claims.rs`. Covers REQ-008, REQ-009, REQ-010.
- [x] T011 Write hand-off tests in `crates/shipyard-engine/tests/handoff.rs`. Covers REQ-011, REQ-012.
- [x] T012 Implement the comment and pull request event hand-off in `crates/shipyard-engine/src/handoff.rs`. Covers REQ-011, REQ-012.
- [x] T013 Write adopt, link and import tests in `crates/shipyard-engine/tests/import.rs`. Covers REQ-015.
- [x] T014 Implement adopt, link and import in `crates/shipyard-engine/src/import.rs`. Covers REQ-015.
- [ ] T014a Write IPC and entity tests in `crates/shipyard-app/tests/sync.rs`. Covers REQ-016.
- [ ] T015 Add the IPC commands and entities in `crates/shipyard-app/src/sync.rs`, then regenerate the bindings with the project command. Covers REQ-013, REQ-016.
- [ ] T016 Write view tests in `src/features/sync/sync.test.tsx`. Covers REQ-013, REQ-017.
- [ ] T017 Implement the connection state rows and the status bar sync action in `src/features/sync/`. Covers REQ-013, REQ-017.
- [ ] T018 [P] Add French and English keys in `src/i18n/` for `sync`. Covers REQ-017.
- [ ] T019 Write the end-to-end test in `e2e/sync.spec.ts`. Covers REQ-003, REQ-004, REQ-013.
- [ ] T020 Add one entry to `CHANGELOG.md` and `CHANGELOG.fr.md`.
- [ ] T021 Run the validation commands from `plan.md`.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

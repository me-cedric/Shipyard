# Tasks: design

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write listing and slug tests in `crates/shipyard-store/tests/design_list.rs`. Covers REQ-001, REQ-003, REQ-008, REQ-011.
- [x] T002 Implement listing and slugs in `crates/shipyard-store/src/design.rs`. Covers REQ-001, REQ-003, REQ-008, REQ-011.
- [x] T003 Write MADR codec tests in `crates/shipyard-store/tests/madr.rs`. Covers REQ-009, REQ-010.
- [x] T004 Implement the MADR codec in `crates/shipyard-store/src/madr.rs`. Covers REQ-009, REQ-010.
- [x] T005 [P] Write flow row tests in `crates/shipyard-core/tests/flows.rs`. Covers REQ-016, REQ-017, REQ-018.
- [x] T006 Implement flow rules and filters in `crates/shipyard-core/src/flows.rs`. Covers REQ-016, REQ-017, REQ-018.
- [x] T007 Write safe write tests in `crates/shipyard-store/tests/safe_write.rs`. Covers REQ-005, REQ-023.
- [x] T008 Implement safe write in `crates/shipyard-store/src/safe_write.rs`. Covers REQ-005, REQ-023.
- [x] T009 Write IPC command tests in `crates/shipyard-app/src/design/tests.rs`. Covers REQ-001, REQ-002, REQ-003, REQ-008, REQ-009, REQ-010, REQ-011.
- [x] T010 Add the IPC commands in `crates/shipyard-app/src/design.rs`, then regenerate the bindings with the project command. Covers REQ-001 to REQ-021.
- [x] T011 Write the end-to-end test in `e2e/design.spec.ts`. Covers REQ-006, REQ-010, REQ-017.
- [x] T012 Write view tests for diagrams, architecture and data in `src/features/design/render.test.tsx`. Covers REQ-003, REQ-004, REQ-006, REQ-007, REQ-014, REQ-015.
- [x] T013 Implement the Diagrams, Architecture and Data views in `src/features/design/`. Covers REQ-003, REQ-004, REQ-006, REQ-007, REQ-014, REQ-015.
- [x] T014 Write view tests for decisions, API and flows in `src/features/design/read.test.tsx`. Covers REQ-008, REQ-010, REQ-011, REQ-012, REQ-013, REQ-016, REQ-017, REQ-018.
- [x] T015 Implement the Decisions, API and Flows views in `src/features/design/`. Covers REQ-008, REQ-010, REQ-011, REQ-012, REQ-013, REQ-016, REQ-017, REQ-018.
- [x] T016 Write Screens, design doc and token tests in `src/features/design/screens.test.tsx`. Covers REQ-019, REQ-021, REQ-024.
- [x] T017 Implement the Screens view, the design doc and the token view in `src/features/design/`. Covers REQ-019, REQ-021, REQ-024. The token view reads `src/ui/tokens` (Q-101).
- [x] T018 Write backlink and ref action tests in `src/features/design/refs.test.tsx`. Covers REQ-001, REQ-002.
- [x] T019 Implement the copy ref action and the inspector backlinks in `src/features/design/`. Covers REQ-001, REQ-002.
- [x] T020 Write design to code tests in `src/features/design/design_to_code.test.tsx` after Q-038 is answered. Covers REQ-020.
- [x] T021 Implement the design to code action in `src/features/design/` after Q-038 is answered. Covers REQ-020.
- [x] T022 [P] Add French and English keys in `src/lib/i18n/design.ts` for `design`. Covers REQ-022.
- [x] T023 Add one entry to `CHANGELOG.md` and `CHANGELOG.fr.md`. Covers REQ-001 to REQ-024.
- [x] T024 Run the validation commands from `plan.md`. Covers REQ-001 to REQ-024.
- [x] T025 Compare the code with `spec.md` and update stale artifacts. Covers REQ-001 to REQ-024.

## Completion Check

- [ ] All acceptance criteria are met.
- [x] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

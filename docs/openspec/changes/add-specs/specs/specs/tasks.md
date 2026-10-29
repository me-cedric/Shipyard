# Tasks: specs

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write status and marker tests in `crates/shipyard-core/tests/specs_status.rs`. Covers REQ-002, REQ-007.
- [x] T002 Implement status and marker count in `crates/shipyard-core/src/specs.rs`. Covers REQ-002, REQ-007.
- [x] T003 Write RAID codec tests in `crates/shipyard-store/tests/raid_codec.rs`. Covers REQ-008, REQ-009, REQ-010.
- [x] T004 Implement the RAID codec in `crates/shipyard-store/src/raid.rs`. Covers REQ-008, REQ-009, REQ-010.
- [x] T005 Write validation mapper tests with CLI output fixtures in `crates/shipyard-store/tests/openspec_validate.rs`. Covers REQ-004.
- [x] T006 Implement the validation runner in `crates/shipyard-store/src/openspec_validate.rs`. Covers REQ-004.
- [x] T007 [P] Write Gherkin and coverage tests in `crates/shipyard-core/tests/gherkin.rs`. Covers REQ-012, REQ-013.
- [x] T008 Implement the Gherkin parser and coverage in `crates/shipyard-core/src/gherkin.rs`. Covers REQ-012, REQ-013.
- [x] T009 Write fold tests in `crates/shipyard-store/tests/fold.rs`. Covers REQ-015.
- [x] T010 Implement the fold in `crates/shipyard-store/src/fold.rs`. Covers REQ-015.
- [x] T011 Write split model tests in `crates/shipyard-core/tests/split.rs`. Covers REQ-016, REQ-017.
- [x] T012 Implement the split model in `crates/shipyard-core/src/split.rs`. It does no I/O. Covers REQ-016, REQ-017.
- [ ] T013 Write hand-off tests with a fake tracker in `crates/shipyard-app/tests/split_apply.rs`: no write before the click, one row ref, no duplicate on a second apply. Depends on `add-work` T010. Covers REQ-018, REQ-019.
- [ ] T014 Implement the hand-off to the `add-work` apply in `crates/shipyard-app/src/split_apply.rs`. It calls the apply of `add-work` T010 and adds no tracker code. Covers REQ-018, REQ-019.
- [x] T015 Write archive and safe write tests in `crates/shipyard-store/tests/archive.rs`. Covers REQ-020, REQ-023.
- [x] T016 Implement archive and safe write in `crates/shipyard-store/src/archive.rs`. Covers REQ-020, REQ-023.
- [ ] T017 Write IPC command tests in `crates/shipyard-app/tests/specs_ipc.rs`. Covers REQ-001, REQ-003, REQ-021.
- [ ] T018 Add the IPC commands in `crates/shipyard-app/src/specs.rs`, then regenerate the bindings with the project command. Covers REQ-001 to REQ-021.
- [ ] T019 Write the end-to-end test in `e2e/specs.spec.ts`. Covers REQ-004, REQ-015, REQ-018.
- [ ] T020 Write view tests in `src/features/specs/specs.test.tsx`. Covers REQ-001, REQ-003, REQ-005, REQ-006, REQ-008, REQ-011, REQ-014, REQ-017, REQ-021, REQ-022.
- [ ] T021 Implement the five views in `src/features/specs/`. Covers REQ-001, REQ-003, REQ-005, REQ-006, REQ-008, REQ-011, REQ-014, REQ-017, REQ-021, REQ-022.
- [ ] T022 [P] Add French and English keys in `src/i18n/` for `specs`. Covers REQ-022.
- [ ] T023 Add one entry to `CHANGELOG.md` and `CHANGELOG.fr.md`. Covers REQ-001 to REQ-023.
- [ ] T024 Run the validation commands from `plan.md`. Covers REQ-001 to REQ-023.
- [ ] T025 Compare the code with `spec.md` and update stale artifacts. Covers REQ-001 to REQ-023.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

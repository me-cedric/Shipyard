# Tasks: work

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write unit tests in `crates/shipyard-core/tests/work.rs` for the suggestion, the effort maths, the Gantt and the plan diff. Covers REQ-007, REQ-010, REQ-011, REQ-016, REQ-017, REQ-025.
- [x] T002 Implement those rules in `crates/shipyard-core/src/work.rs`. Covers REQ-007, REQ-010, REQ-011, REQ-016, REQ-017, REQ-025.
- [x] T003 Write codec tests in `crates/shipyard-store/tests/work.rs`: duplicate handle, no computed total, no computed date, time file per member and month. Covers REQ-003, REQ-009, REQ-010, REQ-017, REQ-021.
- [x] T004 Implement the codecs in `crates/shipyard-store/src/work.rs`. Covers REQ-003, REQ-009, REQ-010, REQ-017, REQ-021.
- [x] T005 [P] Write seal tests in `crates/shipyard-store/tests/seal.rs`: seal, wrong passphrase, locked, day rate. Covers REQ-005, REQ-014.
- [x] T006 Implement the seal in `crates/shipyard-store/src/seal.rs`. Covers REQ-005, REQ-014.
- [x] T007 [P] Write Excel tests in `crates/shipyard-store/tests/excel.rs`: preview with a bad row, no replace before confirm, round trip. Covers REQ-012, REQ-013.
- [x] T008 Implement the Excel import and export in `crates/shipyard-store/src/excel.rs`. Covers REQ-012, REQ-013.
- [x] T009 Write tracker contract tests with a fake in `crates/shipyard-trackers/tests/work.rs`: assign, label, transition refusal, worklog, mark lookup, apply, one item from a ref. Covers REQ-002, REQ-006, REQ-008, REQ-022, REQ-023, REQ-026, REQ-029.
- [x] T010 Implement those calls in `crates/shipyard-trackers/src/work.rs`. Covers REQ-002, REQ-006, REQ-008, REQ-022, REQ-023, REQ-026, REQ-029. This is the one owner of the apply code; `add-specs` depends on it. Built for Jira (Cloud and Data Center) and GitHub Issues. GitLab, Azure DevOps and Linear answer that writes are not built.
- [ ] T011 [P] Write IPC tests for `member:` and `est:` entities in `crates/shipyard-app/tests/work.rs`. Covers REQ-027.
- [ ] T012 Implement the commands in `crates/shipyard-app/src/work.rs`. Covers REQ-027.
- [ ] T013 [P] Write component tests for Backlog and Board in `src/features/work/backlog.test.tsx`. Covers REQ-001, REQ-002.
- [ ] T014 Build Backlog and Board in `src/features/work/`. Covers REQ-001, REQ-002.
- [ ] T015 [P] Write component tests for Team and assignment in `src/features/work/team.test.tsx`. Covers REQ-004, REQ-005, REQ-006, REQ-007, REQ-008.
- [ ] T016 Build Team and assignment in `src/features/work/`. Covers REQ-004 to REQ-008.
- [ ] T017 [P] Write component tests for Estimates in `src/features/work/estimates.test.tsx`. Covers REQ-009 to REQ-015.
- [ ] T018 Build Estimates in `src/features/work/`. Covers REQ-009 to REQ-015.
- [ ] T019 [P] Write component tests for Plan and Time in `src/features/work/plan.test.tsx` and `time.test.tsx`. Covers REQ-016 to REQ-024.
- [ ] T020 Build Plan and Time in `src/features/work/`. Covers REQ-016 to REQ-024.
- [ ] T021 [P] Write component tests for the apply flow in `src/features/work/apply.test.tsx`. Covers REQ-019, REQ-025, REQ-026, REQ-029.
- [ ] T022 Build the apply preview and apply in `src/features/work/`. Covers REQ-019, REQ-025, REQ-026, REQ-029.
- [ ] T023 Write the e2e test `e2e/work.spec.ts` with a fake tracker: assign, estimate, plan, time, apply. Covers REQ-001 to REQ-029.
- [ ] T024 Add French and English keys and one entry each to `CHANGELOG.md` and `CHANGELOG.fr.md`. Covers REQ-028.
- [ ] T025 Run the validation commands of `plan.md`. Covers REQ-001 to REQ-029.
- [ ] T026 Compare the code with `spec.md`, update stale artifacts, then close Q-032, Q-033, Q-034 and Q-060. Covers REQ-005, REQ-010, REQ-021, REQ-026.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

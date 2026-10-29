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
- [x] T010 Implement those calls in `crates/shipyard-trackers/src/work.rs`. Covers REQ-002, REQ-006, REQ-008, REQ-022, REQ-023, REQ-026, REQ-029. This is the one owner of the apply code; `add-specs` depends on it. Built for Jira (Cloud and Data Center) and GitHub Issues. T010b adds the other kinds.
- [x] T010a Write contract tests in `crates/shipyard-trackers/tests/comments.rs` and `crates/shipyard-trackers/src/marker.rs`, then add the comment calls (`comments_page`, `add_comment`, `edit_comment`, `delete_comment`, `all_comments`) and the hidden marker (`marker::make`, `find`) for the six trackers. The claim stamp of `add-sync` REQ-009 and the question comment of `add-questions-loop` REQ-006 call them. The marker survives the conversion of each tracker.
- [x] T010b Write tests in `crates/shipyard-trackers/tests/writes.rs`, then implement the writes for GitLab Issues, Azure DevOps and Linear in `crates/shipyard-trackers/src/write_{gitlab,azure,linear}.rs`: assign, label, transition with refusal, comments, create, update, apply. Worklog for GitLab only (GraphQL timelogs). Azure DevOps and Linear answer `Unsupported` for a worklog. Jira Data Center sets the parent of a story through the `Epic Link` field and names an epic through `Epic Name` (tests in `crates/shipyard-trackers/tests/work.rs`).
- [x] T011 [P] Write IPC tests for the Work commands and for the `member:` and `est:` entities in `crates/shipyard-app/src/work/tests.rs` (they need the app state, which is private to the crate), and the entity scan tests in `crates/shipyard-store/tests/work_refs.rs`. Covers REQ-003 to REQ-008, REQ-010, REQ-012 to REQ-014, REQ-016, REQ-017, REQ-020 to REQ-027, REQ-029.
- [x] T012 Implement the commands in `crates/shipyard-app/src/work.rs`: team, suggestion, assign, mark, transition, seal, estimates, Excel, plan, time, apply preview and apply, one item from a ref. The `member:` and `est:` entities come from the scan of `crates/shipyard-store/src/repo_scan.rs`. This is the backend of T014, T016, T018, T020 and T022. Covers REQ-002, REQ-003 to REQ-008, REQ-010, REQ-012 to REQ-014, REQ-016, REQ-017, REQ-020 to REQ-027, REQ-029.
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

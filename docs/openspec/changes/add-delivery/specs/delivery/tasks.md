# Tasks: delivery

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write unit tests for branch name, base choice, labels, body and lane data in `crates/shipyard-core/tests/delivery.rs`. Covers REQ-007, REQ-009, REQ-010, REQ-011, REQ-021.
- [x] T002 Implement those rules in `crates/shipyard-core/src/delivery.rs`. Covers REQ-007, REQ-009, REQ-010, REQ-011, REQ-021.
- [x] T003 Write engine tests with a fake forge and a fake reviewer in `crates/shipyard-engine/tests/review.rs`: fresh context, finding check, two rounds, gate. Covers REQ-001 to REQ-006.
- [x] T004 Implement the review step and the finding check in `crates/shipyard-engine/src/review.rs`. Covers REQ-001 to REQ-006.
- [x] T005 [P] Write git tests in `crates/shipyard-git/tests/delivery.rs`: tool branch rename, rebase, commit scope, force with lease, clean and dirty worktree removal. Covers REQ-007, REQ-008, REQ-015, REQ-025.
- [x] T006 Implement those git operations in `crates/shipyard-git/src/delivery.rs`. Covers REQ-007, REQ-008, REQ-015, REQ-025.
- [x] T007 [P] Write forge contract tests in `crates/shipyard-forges/tests/pull_request.rs`: draft, labels, reviewers, thread reply, existing pull request lookup. Covers REQ-011 to REQ-013, REQ-016, REQ-019.
- [x] T008 Implement those calls in `crates/shipyard-forges/src/pull_request.rs`. Covers REQ-011 to REQ-013, REQ-016, REQ-019.
- [x] T009 Write engine tests in `crates/shipyard-engine/tests/pull_request.rs`: switches off and on, approvals, rejection, force approval, retry after a crash. Covers REQ-014 to REQ-017.
- [x] T010 Implement the pull request step in `crates/shipyard-engine/src/pull_request.rs`. Covers REQ-014 to REQ-017.
- [x] T011 Write engine tests in `crates/shipyard-engine/tests/feedback.rs`: CI failure, review comment, limits, closed without merge. Covers REQ-018 to REQ-020, REQ-026.
- [x] T012 Implement the feedback loop in `crates/shipyard-engine/src/feedback.rs`. Covers REQ-018 to REQ-020, REQ-026.
- [x] T013 Write engine tests in `crates/shipyard-engine/tests/merge.rs`: merge before terminal stop, ticket move, already closed, summary, worktree removal. Covers REQ-022 to REQ-025.
- [x] T014 Implement the merge close in `crates/shipyard-engine/src/merge.rs`. Covers REQ-022 to REQ-025.
- [x] T015 Write a test for the impacts digest section in `crates/shipyard-core/tests/delivery.rs`. Covers REQ-027.
- [x] T016 Implement the digest section in `crates/shipyard-core/src/delivery.rs`. Covers REQ-027.
- [x] T017 [P] Write store tests for `pr:` entities in `crates/shipyard-store/tests/pr.rs`. Covers REQ-028.
- [x] T006b Join a child branch as one squash commit: `squash_child` in `crates/shipyard-git/src/delivery.rs`, tests in `crates/shipyard-git/tests/squash.rs` and the `Git::merge_child` contract test in `crates/shipyard-git/tests/merge_child_port.rs`. Covers REQ-008, REQ-025.
- [x] T014b Close a run whose pull request merges during a fix round, in `crates/shipyard-engine/src/merge.rs` and `crates/shipyard-engine/tests/feedback.rs`. Covers REQ-022.
- [x] T010b Read the `reviewers` of `automation.yaml` when the project names none, in `crates/shipyard-engine/src/pull_request.rs`. Covers REQ-012.
- [x] T018 Add the IPC commands and their tests in `crates/shipyard-app/src/delivery.rs`, and wrap `shipyard-git`, `shipyard-forges` and the gate commands in the engine ports `Git`, `Pulls` and `Writer` (`crates/shipyard-engine/src/ports.rs`). The `pr:` rows are done in `crates/shipyard-store/src/pr.rs`. Covers REQ-028.
- [x] T019 Write component tests for the run cards and approvals in `src/features/factory/delivery.test.tsx`. Covers REQ-014, REQ-021, REQ-029.
- [x] T020 Build the cards and approvals in `src/features/factory/`. Add French and English keys. Covers REQ-014, REQ-021, REQ-029.
- [x] T021 Write the e2e test `e2e/delivery.spec.ts` with a fake tracker and forge: review, pull request, CI failure, merge, close. Covers REQ-001 to REQ-029.
- [x] T022 [P] Add one entry each to `CHANGELOG.md` and `CHANGELOG.fr.md`. Covers REQ-029.
- [x] T023 Run the validation commands of `plan.md`. Covers REQ-001 to REQ-029.
- [ ] T024 Compare the code with `spec.md` and update stale artifacts, then close Q-029, Q-030 and Q-031. Covers REQ-006, REQ-012, REQ-026.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

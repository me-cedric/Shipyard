# Tasks: code

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [ ] T001 Write unit tests in `crates/shipyard-core/tests/code.rs`: summary type, branch name, work item key, ref list, digest check. Covers REQ-008, REQ-009, REQ-012, REQ-031.
- [ ] T002 Implement those rules in `crates/shipyard-core/src/code.rs`. Covers REQ-008, REQ-009, REQ-012, REQ-031.
- [ ] T003 Write git tests on temporary repositories in `crates/shipyard-git/tests/code.rs`: status, two diffs, stage, discard, stash, conflict, commit, log, branches, fetch of heads. Covers REQ-001 to REQ-007, REQ-010 to REQ-016. Done: status, two diffs, stage, unstage, commit, log, branches, fetch, pull --rebase, push, worktrees. Open: discard, stash, conflict blocks, delete branch, remote head watch.
- [ ] T004 Implement the operations in `crates/shipyard-git/src/code.rs`. Covers REQ-001 to REQ-007, REQ-010 to REQ-016. Done: the same list, in `crates/shipyard-git/src/code/`, with credentials and proxy in `src/auth.rs` and worktrees in `src/worktree.rs`. Open: discard, stash, conflict blocks, delete branch, remote head watch.
- [ ] T005 [P] Write forge contract tests with a fake in `crates/shipyard-forges/tests/code.rs`: list, detail, open, comment, verdict, merge, mark ready, refused write. Covers REQ-018 to REQ-023, REQ-025.
- [ ] T006 Implement those calls in `crates/shipyard-forges/src/code.rs`. Covers REQ-018 to REQ-023, REQ-025.
- [ ] T007 [P] Write store tests in `crates/shipyard-store/tests/code.rs`: report codecs, no secret in a report, dated impact files, commit link index. Covers REQ-009, REQ-024, REQ-028, REQ-033.
- [ ] T008 Implement the codecs and the index in `crates/shipyard-store/src/code.rs`. Covers REQ-009, REQ-024, REQ-028, REQ-033.
- [ ] T009 [P] Write Analyze tests with a fake runner in `crates/shipyard-agents/tests/impacts.rs`: seven axes, stale refs, two separate outputs, clean digest. Covers REQ-029 to REQ-032.
- [ ] T010 Implement Analyze in `crates/shipyard-agents/src/impacts.rs`. Covers REQ-029 to REQ-032.
- [ ] T011 [P] Write app tests in `crates/shipyard-app/tests/code.rs`: watch interval, notice on a head change only, no working copy write, terminal environment, scanner redaction. Covers REQ-015, REQ-016, REQ-017, REQ-027, REQ-035.
- [ ] T012 Implement the commands, the watch task and the terminal in `crates/shipyard-app/src/code.rs`. Covers REQ-015 to REQ-017, REQ-026, REQ-027, REQ-034, REQ-035.
- [ ] T013 [P] Write component tests for Changes and the commit form in `src/features/code/changes.test.tsx`. Covers REQ-001 to REQ-008.
- [ ] T014 Build `DiffView` in `src/ui/diff-view.tsx` and Changes in `src/features/code/`. Covers REQ-001 to REQ-008.
- [ ] T015 [P] Write component tests for History and Branches in `src/features/code/branches.test.tsx`. Covers REQ-010 to REQ-014.
- [ ] T016 Build History, Branches and the selector in `src/features/code/`. Covers REQ-009 to REQ-014.
- [ ] T017 [P] Write component tests for Pull requests in `src/features/code/pull-requests.test.tsx`. Covers REQ-018 to REQ-025.
- [ ] T018 Build Pull requests in `src/features/code/`. Covers REQ-018 to REQ-025.
- [ ] T019 [P] Write component tests for Quality and Impacts in `src/features/code/quality.test.tsx` and `impacts.test.tsx`. Covers REQ-026 to REQ-033.
- [ ] T020 Build Quality and Impacts in `src/features/code/`. Covers REQ-026 to REQ-033.
- [ ] T021 [P] Write component tests for the terminal panel and the file viewer in `src/features/code/terminal.test.tsx` and `viewer.test.tsx`. Covers REQ-034 to REQ-036.
- [ ] T022 Build the terminal panel and the file viewer in `src/features/code/`. Covers REQ-034 to REQ-036.
- [ ] T023 Write the e2e test `e2e/code.spec.ts` with a fake forge: stage, commit, branch, pull request, mark ready, Analyze. Covers REQ-001 to REQ-037.
- [ ] T024 Add French and English keys and one entry each to `CHANGELOG.md` and `CHANGELOG.fr.md`. Covers REQ-037.
- [ ] T025 Run the validation commands of `plan.md`. Covers REQ-001 to REQ-037.
- [ ] T026 Compare the code with `spec.md`, update stale artifacts, then close Q-041, Q-042 and Q-043. Covers REQ-014, REQ-015, REQ-027.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

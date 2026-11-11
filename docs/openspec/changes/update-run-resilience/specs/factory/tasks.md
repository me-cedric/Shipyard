# Tasks: run resilience

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Owner decision on `adr:0022`, Q-166 and Q-167.
- [x] T002 New rows of the transition table, `ATTEMPT_BREAKER`, the caps, the fingerprint and the progress rule in `crates/shipyard-core/src/run.rs`, with `crates/shipyard-core/tests/run_state.rs`. Covers `factory` REQ-002, REQ-004, REQ-005, REQ-052, REQ-054, REQ-055.
- [x] T003 The caps `review_rounds`, `feedback_rounds` and `fix_rounds` in `crates/shipyard-core/src/workflow.rs` and the workflow schema, with `crates/shipyard-core/tests/workflow.rs`. Covers `factory` REQ-035.
- [x] T004 The run counts, the escalation record and `escalate()` in `crates/shipyard-engine/src/run_engine.rs` and `persist.rs`. Replace each `Block` and `Fail` call. Tests in `crates/shipyard-engine/tests/engine.rs` and `restart.rs`. Covers `factory` REQ-004, REQ-007, REQ-052, REQ-053, REQ-054.
- [x] T005 The stop report: comment, marker, key in the log, notice, no approval with the switch off, in `crates/shipyard-engine/src/run_engine.rs`, with tests. Covers `factory` REQ-058.
- [x] T006 Review and gate rounds: run-wide count, batched brief, progress rule, top model tier on the last round, in `crates/shipyard-engine/src/review.rs` and `crates/shipyard-agents/src/`, with `crates/shipyard-engine/tests/review.rs`. Covers `factory` REQ-036, `delivery` REQ-004.
- [x] T007 Feedback rounds: run-wide count and one round for each tick, in `crates/shipyard-engine/src/feedback.rs`, with `crates/shipyard-engine/tests/feedback.rs`. Covers `delivery` REQ-020.
- [x] T008 Fixer rounds for a child conflict, a rebase conflict and an empty branch, in `crates/shipyard-engine/src/children.rs` and `pull_request.rs`, with `children.rs` and `pull_request.rs` tests. Covers `factory` REQ-013, REQ-057, `delivery` REQ-035, REQ-036.
- [x] T009 Guards before each attempt and attempt fencing, in `crates/shipyard-engine/src/run_engine.rs`, `tools.rs` and `crates/shipyard-mcp/src/`, with tests. Covers `factory` REQ-056, REQ-059.
- [x] T010 Merge and close in each state that is not final, rejected writes, `Closes #N`, in `crates/shipyard-engine/src/merge.rs`, `approvals.rs` and `pull_request.rs`, with tests. Covers `factory` REQ-002, REQ-026, `delivery` REQ-010, REQ-014, REQ-022, REQ-026.
- [x] T011 Budgets: day pause resumes the next day, run and member pauses escalate, max turns escalates, in `crates/shipyard-engine/src/budget.rs`, with `engine.rs` tests. Covers `factory` REQ-022, REQ-023.
- [x] T012 No restart after an end, label removal at `Done`, claim of a project that is not open, in `crates/shipyard-core/src/pickup.rs`, `crates/shipyard-engine/src/tick.rs` and `claims.rs`, with `crates/shipyard-core/tests/pickup.rs`, `crates/shipyard-engine/tests/tick.rs` and `claims.rs`. Covers `sync` REQ-018 to REQ-020.
- [x] T013 Question reminder and escalation, reply to a stop report, the `questions` block of `crates/shipyard-store/src/automation_file.rs`, in `crates/shipyard-engine/src/questions.rs`, with `crates/shipyard-engine/tests/questions.rs`. Covers `questions-loop` REQ-019, REQ-022.
- [x] T014 [P] The escalation notice and Unblock in `src/features/factory/`, the IPC with `pnpm ipc:gen`, `src/lib/ipc/mock.ts`, `src/lib/ipc/mock-factory.ts`, EN and FR text, with tests.
- [x] T015 [P] `docs/diagrams/delivery-loop.mmd`, `docs/diagrams/sync-tick.mmd`, `docs/guide/` (EN, FR), `CHANGELOG.md`, `CHANGELOG.fr.md`. The run state diagram and the test plans changed with this spec.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

# Run resilience

## Why

The owner (2026-11-06): "A run must never stay stuck in a blocked state, and workflows must not loop. If issues are found, they are fixed. If a run is blocked, it writes why to the ticket and ends the step."

An audit of the engine found these problems:

- Many causes move a run to `Blocked` and only a person can move it on: a start error, a second child conflict, spent review rounds, a release base, a git error, an empty branch, no reviewer, a rebase conflict, a closed pull request and a rejected approval.
- `Blocked`, `Paused` and `Failed` post no reason on the ticket.
- The cap of 2 review rounds starts again at each feedback round. Feedback rounds (CI, threads) have no cap. The retry counters start again at each round. The engine does not see that the same failure comes again.
- The sync starts a new run on a GitHub or GitLab issue after each end, `Done` included: an open issue counts as Todo, the pickup label stays, and the pull request body has no `Closes #N`.
- Some runs wait with no end: a question with no answer, a merge or a close that arrives in a side state, a pause on a shared budget, and a run of a project that is not open, which also keeps its claim.

## What Changes

- Fix first. A P0 or P1 finding and a red gate start a fix round with no click. The rounds go on while the blocking findings get fewer, up to 4 review rounds for the run. The last round uses the top model tier. A second child conflict, a rebase conflict and an empty branch start one fixer round in the run worktree with no click. A workspace error, an AI tool error and a project that is not open go to `RetryQueued` with backoff.
- Caps in the code that no round resets: 3 failed attempts for each step, 3 feedback rounds and 8 fix rounds for each run. The same failure twice in a row escalates at once.
- Escalation. `Blocked` means that a person must act. The agents stop, the run spends nothing, and it posts one ticket comment with the cause, the last lines, what it tried and the action. The ticket gets the label `shipyard:blocked`. A reply on the ticket or Unblock with a message gives one more round.
- A person's decision ends the run plainly. A pull request closed without a merge cancels the run with a ticket comment. A rejected tracker write is skipped. A rejected push or pull request escalates.
- No restart loop. The pickup does not start a new run on a ticket whose last run ended, until the ticket changes or a person clicks Run. At `Done`, the pickup label goes and the pull request body has `Closes #N`.
- Nothing waits forever. A merge or a close in a side state applies. A question gets one reminder after 24 h and escalates after 72 h. A day budget pause resumes the next day. A run of a project that is not open releases its claim after 10 min.
- Each attempt has an id: a late result of an old attempt is ignored. Each stop is reported once.

## Impact

- Affected capabilities. Modified: `factory` (REQ-002, REQ-004, REQ-005, REQ-007, REQ-013, REQ-022, REQ-023, REQ-026, REQ-035, REQ-036; new REQ-052 to REQ-059), `delivery` (REQ-004, REQ-010, REQ-014, REQ-020, REQ-022, REQ-026, REQ-035, REQ-036), `sync` (new REQ-018 to REQ-020), `questions-loop` (REQ-019; new REQ-022).
- Loop: factory, code and work. The run states stay sixteen. The state mapping and the lanes do not change.
- Constitution: rule 5.5 stays (budget, stall timeout, kill switch). No rule changes.
- Affected code/docs: `crates/shipyard-core/src/run.rs`, `crates/shipyard-core/src/pickup.rs`, `crates/shipyard-engine/src/` (`run_engine.rs`, `review.rs`, `feedback.rs`, `pull_request.rs`, `children.rs`, `questions.rs`, `budget.rs`, `tick.rs`, `claims.rs`, `merge.rs`, `approvals.rs`, `tools.rs`), `crates/shipyard-mcp/src/`, `crates/shipyard-store/src/automation_file.rs`, `crates/shipyard-core/src/workflow.rs`, `src/features/factory/`, `src/lib/ipc/mock*.ts`, `src/lib/i18n/`, `docs/diagrams/run-state-machine.mmd`, `docs/delivery/test-plans/{factory,delivery,sync,questions-loop}.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.
- Decision: `adr:0022`. Questions: Q-166, Q-167. Earlier answers that this change replaces: Q-025 (in part), Q-028, Q-031.

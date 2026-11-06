# Plan: run resilience

Spec: [spec.md](./spec.md)
Date: 2026-11-06

## Summary

The core keeps the rules that stop a loop: the run caps, the attempt breaker, the fingerprint, the progress rule and the escalation record. The engine keeps the counts on the run record, so that no round, retry or restart resets them. Each place that sends `Block` today sends one escalation with a cause. The escalation stops the agents, writes one record, posts one stop report and shows one notice. Guards run before each attempt and do not use a retry. Each attempt gets an id that fences a late result. The sync keeps the end of the last run of each ticket and does not start a run again before the ticket changes. This covers `factory` REQ-002 to REQ-059 of the delta, `delivery`, `sync` REQ-018 to REQ-020 and `questions-loop` REQ-019 and REQ-022.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. The fingerprint is a 64-bit FNV-1a hash in `shipyard-core`, a few lines with a unit test. |
| State table | `crates/shipyard-core/src/run.rs`. New rows: `(WaitingForAnswer \| RetryQueued, Block)` goes to `Blocked` and keeps `return_to`; `(WaitingForAnswer \| Blocked \| RetryQueued \| Paused, PrMerged)` goes to `Merged`. The engine sends `Fail` no more (Q-166). `MAX_ROUNDS = 2` goes; the caps come from `limits`. `ATTEMPT_BREAKER = 3` is a constant. |
| Escalation | One record on the run: `Escalation { cause, lines, tried, action, attempt }`. `cause` is a closed list: `review_rounds`, `feedback_rounds`, `fix_rounds`, `attempts`, `retries`, `same_failure`, `no_progress`, `child_conflict`, `rebase_conflict`, `nothing_to_deliver`, `release_base`, `no_reviewer`, `push_rejected`, `pull_request_rejected`, `guard`, `no_answer`, `budget`, `max_turns`, `pull_request_closed`. One function `escalate(run, cause, lines)` in `crates/shipyard-engine/src/run_engine.rs` takes the place of each `Block` call. |
| Counts | On the run record, saved in the run log: `attempts` per step id, `review_rounds`, `feedback_rounds`, `fix_rounds`, `last_fingerprint`, `last_blocking`, `extra` (the rounds and attempts that unblocks gave), `reported` (the stop report keys). A restart reads them back (REQ-039). |
| Fingerprint | Findings: severity, file path and title, lower case, digits removed, sorted. Gate errors: the command and its first 20 error lines, with digits, hex ids and temporary paths removed, sorted. Runner error: the error kind and its message, normalised the same way. |
| Top model tier | The last allowed review round uses the top model of the runner of the builder step, with effort `high`: Claude Code `opus`, Codex its highest model. The map is one constant in `crates/shipyard-agents`. |
| Guards | Project open, workspace folder present, runner binary found on the path, connections of the step present. A start error of the workspace or the runner maps to a guard failure. 30 min of guard failures with one cause escalate. |
| Fencing | An attempt id (ULID) for each unit start. The bearer token of the step names it (REQ-037). `crates/shipyard-mcp` checks it on each call; the engine checks it on each runner result. |
| Stop report | One comment through the outgoing text filter (`delivery` REQ-031), with the marker `<!-- shipyard:stop <run> -->`, at most 10 last lines in a code block, the rounds and attempts tried, and the action. The key `run + cause + attempt` goes in the log before the send, as the question comments do (REQ-039). |
| Pickup | `crates/shipyard-core/src/pickup.rs` gets the rule of `sync` REQ-018: a ticket with a last end is picked only when the mirror shows a new comment with an id that Shipyard did not store, a pickup label that the end snapshot did not hold, or a status that left the filter at the end and is back in it. The snapshot sits in the claims store, keyed like the claims. |
| Automation file | `.shipyard/automation.yaml` gets `questions: { remind_after_h: 24, escalate_after_h: 72 }` through the shared YAML writer. The reader ships before the writer (`deny_unknown_fields`). |
| Risks | A cap that is too low escalates good runs: the defaults are the owner's, and a workflow raises them. A fingerprint that is too loose escalates two different failures: the normalisation is unit-tested on real logs. A reply on a public issue unblocks a run: the reply is untrusted data, and it gives only one round inside the caps. `Closes #N` closes the issue only on a merge into the default branch: REQ-018 and REQ-019 still stop the restart. |

## Affected Surfaces

- Code: `crates/shipyard-core/src/run.rs`, `crates/shipyard-core/src/workflow.rs` (limits), `crates/shipyard-core/src/pickup.rs`, `crates/shipyard-engine/src/` (`run_engine.rs`, `review.rs`, `feedback.rs`, `pull_request.rs`, `children.rs`, `questions.rs`, `budget.rs`, `tick.rs`, `claims.rs`, `merge.rs`, `approvals.rs`, `tools.rs`, `persist.rs`), `crates/shipyard-mcp/src/` (token check), `crates/shipyard-agents/src/` (top tier), `crates/shipyard-store/src/automation_file.rs`, `.shipyard/workflows/*.yaml` schema, `src/features/factory/` (escalation notice, Unblock), `src/lib/ipc/mock*.ts`, `src/lib/i18n/`.
- Tests: `crates/shipyard-core/tests/run_state.rs`, `crates/shipyard-core/tests/workflow.rs`, `crates/shipyard-core/tests/pickup.rs`, `crates/shipyard-engine/tests/` (`engine.rs`, `review.rs`, `feedback.rs`, `pull_request.rs`, `children.rs`, `questions.rs`, `merge.rs`, `approvals.rs`, `restart.rs`, `tick.rs`, `claims.rs`, `tools.rs`), `src/features/factory/*.test.tsx`.
- Docs/specs: `docs/diagrams/run-state-machine.mmd`, `docs/diagrams/delivery-loop.mmd`, `docs/diagrams/sync-tick.mmd`, `docs/delivery/test-plans/{factory,delivery,sync,questions-loop}.feature`, `docs/guide/` (EN, FR), `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Validation

```bash
cargo test -p shipyard-core -p shipyard-engine -p shipyard-mcp -p shipyard-store -p shipyard-agents
pnpm test src/features/factory src/lib/ipc
cd docs && npx -y @fission-ai/openspec@1.15.0 validate update-run-resilience --strict
```

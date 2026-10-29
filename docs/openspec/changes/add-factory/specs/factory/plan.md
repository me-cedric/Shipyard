# Plan: factory

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

The run state machine and the workflow model are pure code in `shipyard-core`. The engine in `shipyard-engine` drives them on each tick. Runners live in `shipyard-agents`, the agent tools in `shipyard-mcp`, the run log and the file codecs in `shipyard-store`. The UI is `src/features/factory/`. This covers REQ-001 to REQ-034.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). |
| Dependencies | No new dependency. Reuse `serde_yaml`, `rusqlite` and `git2` (through `shipyard-git`). Validate workflows with a JSON Schema file and the `jsonschema` crate only if the workspace has none. xyflow draws the DAG and the Agents map. |
| Data/storage | Run log and run state in the SQLite store of the app data folder. Workflows, roles and `.shipyard/automation.yaml` in the repository. |
| APIs/contracts | IPC commands `runs_list`, `run_get`, `run_start`, `run_cancel`, `kill_switch_set`, `approval_decide`, `workflows_list`, `workflow_save`, `usage_get`, `budget_set`, `sessions_list`. Run events as IPC events. Bindings are generated. |
| State machine | A transition table in `shipyard-core` (`run::Run::apply`). It takes an event and returns the next run or a refusal. No I/O. The event `Finished` moves a run from `Working` or `SelfReview` to `Done` when the workflow has no pull request step. `Cancel` works from every state that is not final. A second `Ask` in `WaitingForAnswer` keeps the first return state. |
| Run log | One append-only table. The store exposes insert and read only. No update, no delete. |
| Workflow check | JSON Schema in `crates/shipyard-core/schema/workflow.schema.json`. `steps` is a list and each step has its `id` (REQ-012), not the map of the MASTER-PLAN example. `Workflow::check` adds the `needs` cycle, unknown roles, ids (`a-z`, `0-9`, `-`, `_`), one of `role` or `action`, and a `for_each` source that is a need (`<need>.<field>`). Defaults: `mode: auto`, `workspace: shared`, `gate: none`, `retry: 0`, `max_parallel: 2`. Empty `tools` allows no tool. A file watcher reloads and keeps the last valid version. |
| Retry | Delay is `min(10 s * 2^(n-1), 300 s)`, computed in `shipyard-core`. |
| Clocks | The engine holds a stall timer and a budget clock for each run (`run::Stopwatch`). They run only in `Planning`, `Working` and `SelfReview` (`RunState::clocks_run`), so `WaitingForAnswer` and every state that waits for a person or the forge stop both. |
| Runners | One `Runner` trait in `shipyard-agents` with a headless start and a streamed JSON parser. First adapters follow Q-024. |
| Agent tools | `shipyard-mcp` serves the eight tools. It validates each input and writes one event. A step gets only the tools in its `tools` field. |
| Worktrees | `shipyard-git` creates one worktree for each child when `workspace` is `worktree`. |
| Secrets | Runners read keys from the keychain through `connections`. No key goes in arguments or in the log. |
| Risks | The state machine drifts from ADR 0005. Cover each transition with a unit test. A runner changes its JSON format. Pin fixtures and parse with a tolerant reader. Q-002, Q-023, Q-024 and Q-025 stay open. |

## Affected Surfaces

- Code: `crates/shipyard-core` (run states, workflow model, schema), `crates/shipyard-store` (run log, automation and workflow codecs), `crates/shipyard-engine` (tick, dispatch, clocks, budgets, approvals), `crates/shipyard-agents` (runners), `crates/shipyard-mcp` (tools), `crates/shipyard-git` (worktrees), `crates/shipyard-app` (commands), `src/features/factory/`.
- Tests: `crates/*/tests`, `src/features/factory/*.test.tsx`, `e2e/factory.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-factory/`, ADR 0005, ADR 0006, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-002, Q-023, Q-024, Q-025.

## Approach

1. Write the transition table and its tests in `shipyard-core`.
2. Write the workflow model, the schema and the five default workflows. Default roles ship as Markdown files.
3. Add the run log and the file codecs in `shipyard-store`.
4. Add the engine: claim intake, dispatch, retry, clocks, budgets, kill switches, approvals.
5. Add the runners with a fake CLI for tests, then the worktree per child.
6. Add the eight tools in `shipyard-mcp`.
7. Add the IPC commands and events.
8. Build the six views, then the French and English keys.

Default mapping of states to tracker status and labels (the admin edits it):

| State | Status | Labels |
|---|---|---|
| Queued | unchanged | `shipyard` |
| Claimed, Planning, Working, SelfReview, ChangesRequested | In Progress | `shipyard:running` |
| PlanReview | In Progress | `shipyard:needs-you` |
| WaitingForAnswer | Needs info | `shipyard:needs-you` |
| Blocked | unchanged | `shipyard:blocked` |
| RetryQueued | unchanged | `shipyard:retry` |
| Paused | unchanged | `shipyard:paused` |
| PROpen | In Review | `shipyard:in-review` |
| Merged, Done | Done | none |
| Failed | unchanged | `shipyard:failed` |
| Cancelled | unchanged | none |

Default workflows:

| Id | Steps |
|---|---|
| feature | grill, plan (human gate), build (`for_each`, max 2), review (fresh context, max 2 rounds), pr |
| bug | triage, fix, review, pr. No plan gate. |
| spike | grill, investigate, report. No pr. |
| spec-split | read the change, propose work items, gate human |
| review-only | review a branch, report |

Lane of each state: Queued (Queued, Claimed, RetryQueued), Working (Planning, Working, SelfReview, ChangesRequested), Needs you (PlanReview, WaitingForAnswer, Blocked, Paused, Failed), In review (PROpen), Ready to merge (PROpen with passing CI and no change request), Done (Merged, Done, Cancelled).

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-store
cargo test -p shipyard-engine
cargo test -p shipyard-agents
cargo test -p shipyard-mcp
pnpm vitest run src/features/factory
pnpm playwright test e2e/factory.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-factory --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

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
| APIs/contracts | IPC commands in `crates/shipyard-app/src/factory.rs`: `runs_list` (the runs of the active project, newest first, each with its `lane`, its pull request row and its counts), `run_get_one`, `run_log_page` (events after an id, at most 500), `run_start` (by hand, on a mirrored ticket), `run_cancel`, `run_resume` (budget and tokens added), `run_unblock`, `run_plan_approve`, `run_plan_reject`, `kill_switch_get`, `kill_switch_set`, `workflows_list`, `workflow_get`, `workflow_check`, `workflow_write`, `roles_list`, `role_get`, `role_write`; `tiers_get` and `tiers_set` in `commands/agents.rs`. Approvals, questions and messages: `approvals_list`, `approval_approve`, `approval_reject` (`delivery.rs`), `questions_list`, `question_answer`, `messages_list`, `message_read_mark` (`questions.rs`). Events `factory-run`, `factory-approval`, `factory-question`, `factory-message`, each with `{ run, id }`: the views read again. Usage, budget and session views (`usage_get`, `budget_set`, `sessions_list`) are not built. Bindings are generated. |
| State machine | A transition table in `shipyard-core` (`run::Run::apply`). It takes an event and returns the next run or a refusal. No I/O. The event `Finished` moves a run from `Working` or `SelfReview` to `Done` when the workflow has no pull request step. `Cancel` works from every state that is not final. A second `Ask` in `WaitingForAnswer` keeps the first return state. |
| Run log | One append-only table in `run_log.sqlite`. The store exposes insert and read only. SQL triggers refuse an update and a delete, so raw SQL fails too. The caller gives the timestamp (Unix ms). |
| Workflow check | JSON Schema in `crates/shipyard-core/schema/workflow.schema.json`. `steps` is a list and each step has its `id` (REQ-012), not the map of the MASTER-PLAN example. `Workflow::check` adds the `needs` cycle, unknown roles, ids (`a-z`, `0-9`, `-`, `_`), one of `role` or `action`, and a `for_each` source that is a need (`<need>.<field>`). Defaults: `mode: auto`, `workspace: shared`, `gate: none`, `retry: 0`, `max_parallel: 2`. Empty `tools` allows no tool. The loop compares the file metadata with the last read, once each second, and reloads a changed file. It keeps the last valid version. |
| Model tiers | A step or a role names a tier (`top`, `mid`, `small`), never a vendor id. The config maps each tier to a model of each runner. `agents.json` keeps one row for each runner that a person saved (`tiers`); a runner with no row gets the default (Claude `opus`, `sonnet`, `haiku`; the others none, so their own default model runs). `tiers_get` and `tiers_set` read and edit it; a model id is 100 characters of `A-Za-z0-9._-:/@+` and never starts with `-`. `Factory::set_tiers` applies an edit to the next step. The defaults follow the token rules: planner and reviewer on `top` with high effort, worker, tester and docs on `mid` with medium effort, scout and triager on `small` with low effort. |
| Seed | `seed` writes the defaults into `.shipyard/workflows/` and `.shipyard/roles/` when the directory does not exist. A directory that exists is a person's: a deleted file stays deleted. A role with no file falls back to the bundled profile. |
| Retry | Delay is `min(10 s * 2^(n-1), 300 s)`, computed in `shipyard-core`. |
| Clocks | Agents run only in `Planning`, `Working` and `SelfReview` (`RunState::clocks_run`). Each other state stops the agents of the run, and each keeps its CLI session to resume. So the stall timer (time since the last event of a step), the step `timeout` and the spend stop in `WaitingForAnswer` and in every state that waits for a person or the forge. The engine reads the time from its `Clock`. |
| Engine | `shipyard-engine/src/run_engine.rs`: `Factory` implements `Dispatch` and `shipyard_mcp::tools::agent::AgentEvents`. It is driven by `pump` (no wait, no thread). Ports: `Agents` (runner), `Workspaces` (worktrees), `Writer` (tracker, push, pull request). Step kinds: `action`, review (`max_rounds`), plan (`mode: plan` or `gate: human`), build (the rest). A build or review step that starts in `Planning` sends `PlanReady { gate: false }`; a review or action that starts in `Working` sends `BuildDone`. A blocking review (report outcome not `done`) runs its `needs` steps again with the findings. Budget: workflow USD plus an optional token budget per run (`Config::max_tokens`); no budget per day or per member (`q:Q-023`). Tiers: `Tiers` in the engine config, Claude `opus`, `sonnet`, `haiku` by default; another runner uses its own default model until the config names one. |
| Approvals | `shipyard-engine/src/approvals.rs`. A write without its switch waits in a queue, and each step of its life is a `write` event in the run log. A newer ticket move replaces a pending one of the same run. A force-with-lease push always waits. A pull request that merges drops the push, pull request and thread reply that wait for a click. |
| Restart | `shipyard-engine/src/persist.rs`. The run log file holds a `snapshots` table next to the append-only `events` table. The factory saves each run (record, steps, questions, its approvals) after each public call, and the global state (id counter, approval counter, kill switch). `Factory::new` reads the saves. A step that ran goes back to `Pending` with its CLI session, so the pump resumes it or briefs it again. A write logs an intent event and a result event with its idempotency key (the write as text). After a crash the writes that the log shows after the last save are not sent again: a write with a result is taken as done, and a comment or thread reply with no result is not repeated (at most once). A run with no save and no end in the log is named in `take_errors`. |
| Runners | One `Runner` trait in `shipyard-agents/src/runner.rs`: `launch` builds the command, a `Parser` reads the streamed JSON line by line, one driver spawns the process in its own group and sends `Event`s (session, turn, text, tool call, tool result, usage, error, exit). First adapters: Claude Code (`stream-json`), Codex (`exec --json`), Gemini CLI, OpenCode, Copilot (ACP) and HTTP providers. Codex `app-server` is not built. The caller enforces the limits through `recv_timeout`, `Event::Turn`, `elapsed` and `CancelHandle`. |
| Agent tools | `shipyard-mcp` serves the eight tools over stdio and over HTTP on `127.0.0.1` (`Server`, `Http`, `serve_stdio`). Each step gets a bearer token (`Sessions`) that names its run and step and its allowed tools. The server checks each input against a strict schema, applies the rate and size limits, and gives one typed `AgentEvent` to `AgentEvents`. The engine implements `AgentEvents` and owns every rule that needs state (`shipyard-engine/src/tools.rs`: `handoff` ends the caller and notes the target step; `message` to a step stops a running target and resumes it with the text, to `person` it is an Inbox item; `spawn_subtask` adds a child to a `for_each` worktree step under `max_parallel` and the budget alert; `read_ref` reads the ref index set with `Factory::set_refs` and turns an unresolved or broken ref into an error). `tools/list` adds the proxied tools of the connections. `shipyard://ref/<ref>` is a resource. A run gets one `shipyard` MCP entry in its private MCP file (`0600`). Claude Code gets an HTTP entry (`type: http`, bearer header). Each other CLI starts `shipyard --mcp-bridge` (`shipyard-cli`), a stdio server that posts each line to the endpoint. It reads `SHIPYARD_MCP_URL` and `SHIPYARD_MCP_TOKEN` from its environment and refuses a URL that is not loopback. |
| Worktrees | `shipyard-git` gives one worktree per child at `<data>/worktrees/<project>/<run>/<child>`, on the branch `shipyard/<run>/<child>`. The same ids return the same worktree. Removal refuses a dirty tree unless forced. `delivery::squash_child(run_worktree, child_branch, message)` joins a child: one commit with one parent on the run branch; a conflict is `GitError::Conflicts` and leaves the run as it was. The engine port `Git::merge_child(run, child, message)` commits what the child left, then squashes; `shipyard-git/tests/merge_child_port.rs` is its contract test with a temporary repository adapter. |
| Secrets | Runners read keys from the keychain through `connections`. No key goes in arguments or in the log. |
| App wiring | `crates/shipyard-app/src/factory.rs` holds one `FactoryHost` for the machine. It is the `Dispatch` of each sync engine (the placeholder is gone) and the `AgentEvents` of the endpoint. `attach` gives the factory the ports of a project each time its sync engine is made or changes: the workflow and role files (seeded once, then loaded with the last valid version), the mirror, the connections. A background loop (1 s) pumps the factory, frees the claim of each run that ended (`Engine::release`), and sends the events by comparing the factory with what it saw last. The agent tools endpoint (`Http` on `127.0.0.1`, port 0) starts at app start. `RunnerAgents` opens one MCP session for each (run, step), gives `McpEntry::shipyard` (HTTP for Claude Code, the bridge for the others) and a scratch folder `<app data>/agents/<run>/<step>` outside every worktree, and ends both in `Agents::end`. `read_ref` reads the ref index of the app (the same object, one lock for each call); `run:` refs resolve from the factory. At exit `Factory::shutdown` stops the agent processes and leaves the runs as they are. |
| Folders | `Folders` (`crates/shipyard-app/src/delivery.rs`) is `Workspaces` and `Git`. The run folder is a linked worktree at `<app data>/worktrees/<project>/<run>/run`, on the branch `<runner>/<run>` that starts at the declared base, `develop`, `main`, `master` or HEAD. The pull request step renames it before the first push. Each child of a `worktree` step starts from the run branch at `<run>/<child>`. The working copy of the person is never touched. |
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

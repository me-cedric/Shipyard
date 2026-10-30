# add-factory

## Why

Delegation only sets a label. It has no run engine, no worktree per agent and no budget.
Shipyard is a software factory: it must take a ticket, run a workflow of agents with the right model and effort, keep each run inside its budget, and stop for a person when a decision belongs to a person.

## What Changes

- Add the run engine with the run state machine: `Queued`, `Claimed`, `Planning`, `PlanReview`, `Working`, `SelfReview`, `PROpen`, `ChangesRequested`, `Merged`, `Done`, and the side states `WaitingForAnswer`, `Blocked`, `RetryQueued`, `Paused`, `Failed`, `Cancelled`.
- Add the mapping of each run state to a tracker status and labels in `.shipyard/automation.yaml`.
- Add YAML workflows in `.shipyard/workflows/<id>.yaml` with a JSON Schema and hot reload. Defaults: `feature`, `bug`, `spike`, `spec-split`, `review-only`. A step has a role, model, effort, tools, mode, workspace, needs, gate, `for_each` fan-out, retry, timeout and budget.
- Add roles as Markdown profiles: `scout`, `worker`, `reviewer`, `planner`, `tester`, `docs`, `triager`, plus project roles.
- Add runners and sub-sessions: a `for_each` step starts child runs, each in its own worktree when the step says so.
- Add the agent MCP tools served by `shipyard-mcp`: `ask_question`, `post_progress`, `handoff`, `message`, `spawn_subtask`, `report`, `read_ticket`, `read_ref`.
- Add the append-only run log. The UI and the ticket summary read the same log.
- Add budgets per run, per day and per member, the alert at 80 %, the stall timeout, max turns, and the kill switch per run and global.
- Add the automation write switches (`push`, `pull_request`, `tracker_transition`, `tracker_comment`), all off by default (Q-002, option 1, working assumption). A write without its switch becomes an approval in Home / Inbox.
- Add Factory views: Runs (lanes), the run view (DAG, event tail, diff, cost), Workflows, Agents map, Sessions, Usage.

## Impact

- Affected capability: `factory`
- Consumes: `sync` (claimed tickets, terminal tickets), `connections` (runners and providers), `extensions` (roles and skills from compass), `specs` (the `spec-split` workflow reads a change), `refs` (`read_ref`).
- Produces: `run:` and `wf:` entities, the run log, approvals for `shell` (Inbox), questions for `questions-loop`, a reviewed worktree for `delivery`, run state for `work` and `refs`.
- Feature list: Specifications delegate, AI sessions bar, Orca, FinOps, the MCP server (HTTP, stdio, relay, gates, proxy), Répartition gates.
- Affected code/docs: `crates/shipyard-core`, `crates/shipyard-engine`, `crates/shipyard-agents`, `crates/shipyard-mcp`, `src/features/factory/`, ADR 0005, ADR 0006, Q-002.

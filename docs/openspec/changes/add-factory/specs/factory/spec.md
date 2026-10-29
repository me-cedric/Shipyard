# Spec: factory

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-factory`

### Goal

A claimed ticket becomes a run. The run follows a state machine and a YAML workflow of agent steps. It stays inside its budget, and it stops for a person when a decision or a write belongs to a person. Six views show the work.

### Why

Legacy delegation only sets a label. It has no run engine, no worktree per agent and no budget. Shipyard must take a ticket, run the right agents with the right model and effort, and keep each run safe and visible.

### Users And Scenarios

- PM: sees every run in the lanes, watches cost in Usage, and stops a run with a kill switch.
- Architect: edits the workflows and roles of the project and reviews a plan at PlanReview.
- Developer: reads the run view (DAG, event tail, diff, cost) and takes over a run in its worktree.
- QA: runs `review-only` and the `tester` role on a branch and reads the report.
- BA: starts `spec-split` on a change and approves the plan.
- Functional lead: approves a write from the Inbox with one click.
- Junior: reads the run view to learn how a ticket becomes a pull request.

### Requirements

- REQ-001: The system SHALL move a run along the main path `Queued`, `Claimed`, `Planning`, `PlanReview`, `Working`, `SelfReview`, `PROpen`, `Merged`, `Done`. A run of a workflow with no pull request step SHALL move to `Done` when its last step ends. The system SHALL refuse and log any transition that this requirement and REQ-002 to REQ-005 do not list.
- REQ-002: A run SHALL return to `Planning` when a person rejects the plan at `PlanReview`. A run SHALL return to `Working` from `SelfReview` for a fix round and from `ChangesRequested`, in the same worktree. A CI failure or a review comment on the pull request SHALL move a run from `PROpen` to `ChangesRequested`. A pull request that merges while the run fixes it (`ChangesRequested`, `Working` or `SelfReview` with an open pull request) SHALL stop the agents of the run and move it to `Merged`, then `Done`.
- REQ-003: `PlanReview` SHALL be a human gate. A workflow SHALL be able to turn it off. Then a run SHALL move from `Planning` to `Working` without a person.
- REQ-004: From any active state, a run SHALL be able to enter `WaitingForAnswer`, `Blocked`, `RetryQueued`, `Paused`, `Failed` or `Cancelled`. `Blocked` follows a missing connection or runner, a rejected approval, spent review rounds or a pull request closed without a merge (`add-delivery` REQ-026). The scenarios give `WaitingForAnswer`, `RetryQueued` and `Paused`. `Failed` follows exhausted retries or max turns. `Cancelled` follows a kill switch or a stop from `add-sync` REQ-004.
- REQ-005: A run SHALL store its return state when it enters `WaitingForAnswer`, `Blocked`, `RetryQueued` or `Paused`. The run SHALL go back to that state when it leaves. `Failed`, `Cancelled` and `Done` SHALL be final. A run SHALL leave `Paused` when a person raises its budget and resumes it. A resume with no budget left SHALL keep the run in `Paused` (assumption `q:Q-053`). [NEEDS CLARIFICATION: Q-025 How does a run leave `Blocked`?] Working assumption: Q-025 option 1, on the next tick after the cause is gone, or by a click.
- REQ-006: While a run is in `WaitingForAnswer`, the system SHALL pause the stall timer and the budget clock. Both SHALL restart when the run leaves that state.
- REQ-007: The system SHALL delay retry number n of a step by min(10 s x 2^(n-1), 5 min). A step SHALL fail the run when its `retry` count is spent.
- REQ-008: The system SHALL map each of the sixteen run states to a tracker status and labels in `.shipyard/automation.yaml`. The project admin SHALL be able to change each row. The status and label changes SHALL follow the `tracker_transition` switch.
- REQ-009: A run SHALL start only from a ticket that `sync` claimed. The workflow SHALL come from the ticket label `wf:<id>`, else from the project default (`add-projects` REQ-007). On a stop from `add-sync` REQ-004, the system SHALL move the run to `Cancelled`.
- REQ-010: The system SHALL read workflows from `.shipyard/workflows/<id>.yaml` and validate each file with a JSON Schema. The system SHALL reload a changed file at once. It SHALL keep the last valid version when the new file is invalid.
- REQ-011: The system SHALL ship the workflows `feature`, `bug`, `spike`, `spec-split` and `review-only`. `feature` SHALL grill, plan with a human gate, build with fan-out, review and open a pull request. `bug` SHALL triage, fix, review and open a pull request, with no `PlanReview`. `spike` SHALL grill, investigate and report, with no pull request. `spec-split` SHALL read a change and propose work items behind a human gate. `review-only` SHALL review an existing branch and report.
- REQ-012: A step SHALL accept the fields `id`, `role`, `model`, `effort`, `tools`, `needs`, `skill` and `action`. A step SHALL accept the fields `for_each`, `max_parallel`, `retry`, `timeout`, `budget`, `fresh_context` and `max_rounds`. A step SHALL accept `mode` (plan or auto), `workspace` (worktree, shared or none) and `gate` (none or human). The system SHALL reject an unknown field and a `needs` cycle.
- REQ-013: A `for_each` step SHALL start one child run for each item of its list. At most `max_parallel` children SHALL run at the same time (default 2). Each child SHALL get its own worktree when its `workspace` is `worktree`. The parent SHALL collect the outputs of the children. After the last child, the system SHALL squash each child onto the run branch in child order, one commit for each, and remove the child worktrees. A conflict SHALL block the run and name the child and the files.
- REQ-014: The system SHALL read each role as a Markdown profile at `.shipyard/roles/<role>.md`. The roles `scout`, `worker`, `reviewer`, `planner`, `tester`, `docs` and `triager` SHALL exist by default. A project SHALL be able to add roles.
- REQ-015: The system SHALL run agents headless with streamed JSON, as far as the connections allow. The system SHALL support Claude Code, Codex, GitHub Copilot, Gemini CLI, OpenCode and HTTP model providers. A runner MUST NOT receive a secret value in its arguments. The log MUST NOT hold one. [NEEDS CLARIFICATION: Q-024 Which runners ship in the first release?] Working assumption: Q-024 option 1, Claude Code and Codex.
- REQ-016: The system SHALL serve the eight tools `ask_question`, `post_progress`, `handoff`, `message`, `spawn_subtask`, `report`, `read_ticket` and `read_ref` to agents. A tool call SHALL write one structured event to the run bus. The system SHALL reject a call with an invalid input. A step SHALL call only the tools of its `tools` field.
- REQ-017: `ask_question` SHALL take a question, two to four options and one recommended option. It SHALL also take a flag for free text and a kind, `ticket` (default) or `spec`. A `spec` question SHALL carry a ref of a spec, and a `ticket` question SHALL NOT. It SHALL move the run to `WaitingForAnswer` and SHALL hand the question to the questions loop.
- REQ-018: `post_progress` SHALL take a short text. It SHALL show the text in the event tail and the ticket summary. `report` SHALL take an outcome (done, partial or failed), a summary, refs of the artifacts and optional named output fields, such as the list `tasks` of a plan. It SHALL end the step with that output. A report above the size cap SHALL be an error.
- REQ-019: `handoff` SHALL take a role, a summary and an optional target step. It SHALL end the calling child and pass the summary to that role in the same run. `message` SHALL take a target step or the person, and a text. It SHALL deliver the text at the next turn of the target. `spawn_subtask` SHALL take a title, a brief and a role. It SHALL start a child run under the limits of the calling step: the step needs `for_each` and a worktree workspace, the children that run now stay under `max_parallel`, and the run budget is under its alert level.
- REQ-020: `read_ticket` SHALL take a ref `wi:` and SHALL return the mirrored ticket. `read_ref` SHALL take any ref and SHALL return its resolved text. Both tools SHALL be read-only, and a ref that does not resolve SHALL return an error and not a guess.
- REQ-021: The system SHALL keep an append-only run log. The log SHALL hold one event for each state change, tool call, runner event and write. The system MUST NOT edit or delete an event. The UI and the ticket summary SHALL read the same log.
- REQ-022: The system SHALL enforce a budget in tokens and money per run, per day and per member. It SHALL raise one alert at 80 % of a budget. It SHALL move the run to `Paused` at 100 %. [NEEDS CLARIFICATION: Q-023 What are the default budgets?] Working assumption: Q-023 option 1, the workflow limit for a run and no default per day or per member.
- REQ-023: The system SHALL stop a step that sends no event for the stall timeout. It SHALL treat that step as a failed step. The system SHALL stop a run at its max turns and SHALL move it to `Failed`.
- REQ-024: The system SHALL offer a kill switch per run and one global kill switch. The run switch SHALL move the run to `Cancelled`. The global switch SHALL cancel every active run on this machine and stop pickup until a person turns it off.
- REQ-025: The system SHALL keep four switches in `.shipyard/automation.yaml`: `push`, `pull_request`, `tracker_transition` and `tracker_comment`. All four SHALL be off by default, and a project admin SHALL turn each one on in Settings / Project, group Automation. That group SHALL be the one editor of `.shipyard/automation.yaml`. [NEEDS CLARIFICATION: Q-002 What is the default for automation writes?] Working assumption: Q-002 option 1, all off.
- REQ-026: A write without its switch SHALL become an approval in Home / Inbox that names the exact write. One click SHALL send the write, and a rejection SHALL drop it and move the run to `Blocked`. A push with force with lease SHALL always wait for approval, also when `push` is on (`add-delivery` REQ-015).
- REQ-027: Factory / Runs SHALL show six lanes, each with a count. The view SHALL have one primary action. Each run SHALL sit in the lane that REQ-038 gives.
- REQ-028: The run view SHALL show the workflow DAG with the live state of each step. It SHALL also show the event tail, the diff of the worktree and the cost. It SHALL offer the kill switch of the run.
- REQ-029: Factory / Workflows SHALL list the workflows with their steps and SHALL edit the same files as REQ-010. It SHALL show a validation error with its line.
- REQ-030: Factory / Agents map SHALL show a live graph of agents, tickets, files and refs. A click on a node SHALL open its entity in the inspector.
- REQ-031: Factory / Sessions SHALL list the agent sessions. Each row SHALL show runner, model, run, state and tokens. The view SHALL offer the global kill switch as its primary action.
- REQ-032: Factory / Usage SHALL show tokens and money per run, per day and per member against their budgets. It SHALL let an admin set a budget.
- REQ-033: Each Factory view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path and a focus ring. It SHALL have assistive labels, enough contrast and reduced motion. It SHALL show French and English text.
- REQ-034: The system SHALL expose each run as `run:<ulid>` with its steps as `run:<ulid>/<step-id>`, and each workflow as `wf:<id>`. It SHALL expose the run state to `work` and `refs`.
- REQ-035: A workflow SHALL hold a `limits` block with `max_turns`, `budget_usd` and `stall_s`. The block SHALL set the max turns, the budget in USD and the stall timeout of each run. The system SHALL reject a limit that is not a positive number.
- REQ-036: After the build steps end, a run SHALL enter `SelfReview`. `SelfReview` SHALL follow `add-delivery` REQ-001 to REQ-004. `max_rounds` SHALL NOT exceed 2.
- REQ-037: The system SHALL serve the agent tools over two transports, stdio and HTTP. Both transports SHALL offer the same eight tools with the same inputs. The HTTP transport SHALL accept only calls from this machine (assumption `q:Q-053`): it SHALL listen on the loopback address, SHALL check the Host and Origin headers, and SHALL need the bearer token of a step. The token SHALL name the run and the step, and an input SHALL NOT name another run. The agent SHALL get the token in its MCP config file and never in an argument.
- REQ-038: The lane Queued SHALL hold the states `Queued`, `Claimed` and `RetryQueued`. The lane Working SHALL hold `Planning`, `Working`, `SelfReview` and `ChangesRequested`. The lane Needs you SHALL hold `PlanReview`, `WaitingForAnswer`, `Blocked`, `Paused` and `Failed`. The lane Ready to merge SHALL hold a `PROpen` run with passing CI, no change request and no draft. The lane In review SHALL hold each other `PROpen` run. The lane Done SHALL hold `Merged`, `Done` and `Cancelled`.
- REQ-039: After a restart, the system SHALL take back the runs, the approval queue, the open questions and the global kill switch from the run log file. A step that ran SHALL start again, on its CLI session when it has one, else with a new brief. The system MUST NOT send a write a second time when the log shows that it went out before the restart.

### Non-Goals

- Tracker polling, pickup rules and claims. The `sync` capability owns them.
- Opening the pull request, CI feedback, merge detection and ticket close. The `delivery` capability owns them.
- The question loop (comment, marker, answer detection, fold). The `questions-loop` capability owns it.
- Creating work items from a split. The `specs` capability owns it.
- Tracker, forge and provider adapters and the secret store. The `connections` capability owns them.
- Free chat between agents. Agents write structured events only.
- A webhook relay and a runner on another machine.
- The relay and the proxy of third-party MCP servers. `add-connections` owns them (REQ-017, REQ-018). This change serves the agent tools only.

### Acceptance Criteria

- [ ] A claimed ticket creates a run in `Queued` and the run reaches `Done` through the main path.
- [ ] A transition that the state machine does not list is refused and logged.
- [ ] PlanReview waits for a person, and a workflow with the gate off skips it.
- [ ] A run in `WaitingForAnswer` shows no stall timeout and no budget spend, and returns to its stored state.
- [ ] A failed step retries after 10 s, 20 s, 40 s and so on, never more than 5 min apart.
- [ ] Each of the sixteen run states has a tracker status and labels in `.shipyard/automation.yaml`, and an edit changes the next write.
- [ ] A broken workflow file shows its error and the last valid version keeps running.
- [ ] The five default workflows exist and validate against the schema.
- [ ] A `for_each` step with `max_parallel` 2 runs at most two children, each in its own worktree.
- [ ] The children of a worktree step join the run folder at fan-in, and a conflict blocks the run.
- [ ] A role file in `.shipyard/roles/` changes the profile that its step uses.
- [ ] A runner streams events to the run bus, and no secret value appears in its arguments or in the log.
- [ ] Each of the eight tools writes one event with the effect named in its requirement, and a bad input is rejected.
- [ ] The run log has no edit and no delete, and the UI and the ticket summary show the same events.
- [ ] A run at 80 % of its budget raises one alert, and at 100 % it moves to `Paused`.
- [ ] A run in `Paused` leaves it when a person raises the budget and resumes it.
- [ ] A workflow `limits` block sets max turns, budget and stall timeout, and a bad value is rejected.
- [ ] `SelfReview` uses a fresh reviewer, allows two fix rounds at most, and moves to `Blocked` when they are spent.
- [ ] The agent tools answer on stdio and on HTTP, and HTTP accepts only this machine.
- [ ] A run with no event for the stall timeout is stopped, and a run at max turns moves to `Failed`.
- [ ] The kill switch of a run cancels it, and the global kill switch cancels every active run and stops pickup.
- [ ] After a restart the runs, the approval queue, the open questions and the kill switch are back, running steps start again, and no write that went out is sent twice.
- [ ] With all four write switches off, each write appears in the Inbox as an approval, and one click sends it.
- [ ] The Runs view shows the six lanes with counts, puts each state in its lane, shows a ready `PROpen` run in Ready to merge, and the run view shows the DAG, event tail, diff and cost.
- [ ] The Workflows, Agents map, Sessions and Usage views each open from the Factory sidebar and have one primary action.
- [ ] Every Factory view works with the keyboard, shows a focus ring and has assistive labels, in French and English.

### Links

- Consumes: `add-sync` REQ-003, REQ-004, REQ-008 and REQ-009 (ticks, terminal tickets, claims), `add-connections` REQ-003, REQ-009, REQ-010 and REQ-011 (capability flags, runners, providers, secrets), `add-extensions` (compass roles and skills), `add-specs` (the `spec-split` workflow reads a change), `add-refs` REQ-014 (`read_ref`), `add-shell` REQ-003 and REQ-004 (Inbox) and REQ-007 (active runs in the status bar), `add-design-system` REQ-005 (RunStep, ApprovalBar).
- Produces: `run:` and `wf:` entities (indexed by `add-refs` REQ-003), the run log, approvals for the Inbox, questions for `add-questions-loop`, a reviewed worktree for `add-delivery`, run state for `add-work` and `add-refs`.

### Legacy parity

| Legacy feature | Shipyard view | REQ ids |
|---|---|---|
| Specifications, delegate (sets a label) | Factory / Runs, Workflows | REQ-001, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013, REQ-014 |
| AI sessions bar | Factory / Sessions | REQ-015, REQ-024, REQ-031 |
| Orca (worktree per task) | Factory / Agents map, run view | REQ-013, REQ-028, REQ-030 |
| FinOps | Factory / Usage | REQ-022, REQ-032, REQ-035 |
| Legacy MCP server (HTTP, stdio, relay, gates, proxy) | Agent tools and approvals | REQ-016, REQ-017, REQ-018, REQ-019, REQ-020, REQ-025, REQ-026, REQ-037 |
| Répartition gates | PlanReview gate and approvals | REQ-003, REQ-026 |

### Existing References

- Existing code/docs/specs: `docs/plan/MASTER-PLAN.md` sections 5.3, 5.4, 5.5, 5.8 and 5.9; ADR 0005; ADR 0006; Q-002.
- Supersedes or extends: N/A

## ADDED Requirements

### Requirement: REQ-001 Main path

The system SHALL move a run along the main path `Queued`, `Claimed`, `Planning`, `PlanReview`, `Working`, `SelfReview`, `PROpen`, `Merged`, `Done`. A run of a workflow with no pull request step SHALL move to `Done` when its last step ends. The system SHALL refuse and log any transition that this requirement and REQ-002 to REQ-005 do not list.

#### Scenario: Forward path
- GIVEN a run in `Queued` and a claim that succeeds
- WHEN the engine starts it
- THEN the run moves to `Claimed`, then `Planning`, and each move is in the run log

#### Scenario: Refused transition
- GIVEN a run in `Working`
- WHEN a caller asks for `Merged`
- THEN the run stays in `Working` and the log holds the refusal

#### Scenario: No pull request step
- GIVEN a run of the workflow `spike` in `Working`
- WHEN its last step ends
- THEN the run moves to `Done`

### Requirement: REQ-002 Return transitions

A run SHALL return to `Planning` when a person rejects the plan at `PlanReview`. A run SHALL return to `Working` from `SelfReview` for a fix round and from `ChangesRequested`, in the same worktree. A CI failure or a review comment on the pull request SHALL move a run from `PROpen` to `ChangesRequested`. A pull request that merges while the run fixes it (`ChangesRequested`, `Working` or `SelfReview` with an open pull request) SHALL stop the agents of the run and move it to `Merged`, then `Done`.

#### Scenario: CI failure
- GIVEN a run in `PROpen`
- WHEN the pull request CI fails
- THEN the run moves to `ChangesRequested`, then to `Working` in the same worktree

#### Scenario: Merge during a fix
- GIVEN a run in `Working` for a fix round of an open pull request
- WHEN the pull request merges
- THEN the agents stop, the run moves to `Merged` and then to `Done`, and a push that waits for a click is dropped

#### Scenario: Plan rejected
- GIVEN a run in `PlanReview`
- WHEN the person rejects the plan with a comment
- THEN the run returns to `Planning` with the comment in context

### Requirement: REQ-003 PlanReview gate

`PlanReview` SHALL be a human gate. A workflow SHALL be able to turn it off. Then a run SHALL move from `Planning` to `Working` without a person.

#### Scenario: Gate on
- GIVEN a workflow with the gate `human` on the plan step
- WHEN the plan is ready
- THEN the run waits in `PlanReview` and an approval shows in the Inbox

#### Scenario: Gate off
- GIVEN a workflow with no gate on the plan step
- WHEN the plan is ready
- THEN the run moves to `Working` and no approval shows

### Requirement: REQ-004 Side states

From any active state, a run SHALL be able to enter `WaitingForAnswer`, `Blocked`, `RetryQueued`, `Paused`, `Failed` or `Cancelled`. `Blocked` follows a missing connection or runner, a rejected approval, spent review rounds or a pull request closed without a merge (`add-delivery` REQ-026). The scenarios give `WaitingForAnswer`, `RetryQueued` and `Paused`. `Failed` follows exhausted retries or max turns. `Cancelled` follows a kill switch or a stop from `add-sync` REQ-004.

#### Scenario: Question and budget
- GIVEN a run in `Working`
- WHEN the agent calls `ask_question`, or a hard budget stop applies
- THEN the run moves to `WaitingForAnswer`, or to `Paused`

#### Scenario: Failed step
- GIVEN a run in `Working` with retries left
- WHEN the step fails
- THEN the run moves to `RetryQueued`

#### Scenario: Rejected approval
- GIVEN a run that waits for an approval
- WHEN the person rejects it
- THEN the run moves to `Blocked` and the log holds the reason

### Requirement: REQ-005 Return state

A run SHALL store its return state when it enters `WaitingForAnswer`, `Blocked`, `RetryQueued` or `Paused`. The run SHALL go back to that state when it leaves. `Failed`, `Cancelled` and `Done` SHALL be final. A run SHALL leave `Paused` when a person raises its budget and resumes it. A resume with no budget left SHALL keep the run in `Paused`. [NEEDS CLARIFICATION: Q-025 How does a run leave `Blocked`?] Working assumption: Q-025 option 1, on the next tick after the cause is gone, or by a click.

#### Scenario: Return after wait
- GIVEN a run in `Working` that enters `WaitingForAnswer`
- WHEN the answer arrives
- THEN the run returns to `Working`

#### Scenario: Final state
- GIVEN a run in `Failed`
- WHEN a caller asks for any transition
- THEN the run stays in `Failed`

#### Scenario: Leave Paused
- GIVEN a run in `Paused` after a hard budget stop
- WHEN a person raises the budget and resumes the run
- THEN the run returns to its stored state

#### Scenario: Resume without budget
- GIVEN a run in `Paused` with no budget left
- WHEN a person resumes the run
- THEN the run stays in `Paused`

### Requirement: REQ-006 Waiting pauses the clocks

While a run is in `WaitingForAnswer`, the system SHALL pause the stall timer and the budget clock. Both SHALL restart when the run leaves that state.

#### Scenario: Long wait
- GIVEN a run with a stall timeout of 300 s in `WaitingForAnswer` for one hour
- WHEN the answer arrives
- THEN the run does not stall and no budget is spent for the hour

### Requirement: REQ-007 Retry backoff

The system SHALL delay retry number n of a step by min(10 s x 2^(n-1), 5 min). A step SHALL fail the run when its `retry` count is spent.

#### Scenario: Backoff steps
- GIVEN a step that fails four times
- WHEN the engine queues each retry
- THEN the delays are 10 s, 20 s, 40 s and 80 s

#### Scenario: Backoff cap
- GIVEN a step at retry number 7
- WHEN the engine queues the retry
- THEN the delay is 5 min

### Requirement: REQ-008 State to tracker mapping

The system SHALL map each of the sixteen run states to a tracker status and labels in `.shipyard/automation.yaml`. The project admin SHALL be able to change each row. The status and label changes SHALL follow the `tracker_transition` switch.

#### Scenario: Mapped status
- GIVEN a mapping of `WaitingForAnswer` to the status `Needs info`
- WHEN a run enters that state and the switch is on
- THEN the ticket moves to `Needs info` with the mapped labels

#### Scenario: Missing row
- GIVEN a mapping file without a row for a state
- WHEN the file loads
- THEN the state keeps its default row

#### Scenario: Invalid mapping
- GIVEN a mapping file with a row for a name that is not a run state
- WHEN the file loads
- THEN the system shows an error and keeps the last valid mapping

### Requirement: REQ-009 Pickup and terminal tickets

A run SHALL start only from a ticket that `sync` claimed. The workflow SHALL come from the ticket label `wf:<id>`, else from the project default (`add-projects` REQ-007). On a stop from `add-sync` REQ-004, the system SHALL move the run to `Cancelled`.

#### Scenario: Terminal ticket
- GIVEN an active run
- WHEN `add-sync` REQ-004 stops the run for a done ticket
- THEN the run moves to `Cancelled` and its agent session stops

#### Scenario: Workflow choice
- GIVEN a claimed ticket with the label `wf:bug`
- WHEN the engine creates the run
- THEN the run uses the workflow `bug`, and a ticket with no such label uses the project default

#### Scenario: No claim
- GIVEN a ticket without a claim
- WHEN the engine looks for work
- THEN it creates no run

### Requirement: REQ-010 Workflow files

The system SHALL read workflows from `.shipyard/workflows/<id>.yaml` and validate each file with a JSON Schema. The system SHALL reload a changed file at once. It SHALL keep the last valid version when the new file is invalid.

#### Scenario: Hot reload
- GIVEN a valid workflow
- WHEN a person saves a valid change
- THEN the next run uses the new version

#### Scenario: Broken file
- GIVEN a valid workflow
- WHEN a person saves an invalid change
- THEN the view shows the error and runs keep the last valid version

### Requirement: REQ-011 Default workflows

The system SHALL ship the workflows `feature`, `bug`, `spike`, `spec-split` and `review-only`. `feature` SHALL grill, plan with a human gate, build with fan-out, review and open a pull request. `bug` SHALL triage, fix, review and open a pull request, with no `PlanReview`. `spike` SHALL grill, investigate and report, with no pull request. `spec-split` SHALL read a change and propose work items behind a human gate. `review-only` SHALL review an existing branch and report.

#### Scenario: Defaults present
- GIVEN a new project
- WHEN a person opens Factory / Workflows
- THEN the five workflows show and each one validates

### Requirement: REQ-012 Step fields

A step SHALL accept the fields `id`, `role`, `model`, `effort`, `tools`, `needs`, `skill` and `action`. A step SHALL accept the fields `for_each`, `max_parallel`, `retry`, `timeout`, `budget`, `fresh_context` and `max_rounds`. A step SHALL accept `mode` (plan or auto), `workspace` (worktree, shared or none) and `gate` (none or human). The system SHALL reject an unknown field and a `needs` cycle.

#### Scenario: Needs order
- GIVEN a step with `needs: [plan]`
- WHEN the run starts
- THEN the step starts only after `plan` ends

#### Scenario: Cycle
- GIVEN two steps that need each other
- WHEN the file loads
- THEN the schema check rejects it and names both steps

### Requirement: REQ-013 Fan-out

A `for_each` step SHALL start one child run for each item of its list. At most `max_parallel` children SHALL run at the same time (default 2). Each child SHALL get its own worktree when its `workspace` is `worktree`. The parent SHALL collect the outputs of the children. After the last child, the system SHALL squash each child onto the run branch in child order, one commit for each, and remove the child worktrees. A conflict SHALL block the run and name the child and the files.

#### Scenario: Parallel limit
- GIVEN a `for_each` over five items with `max_parallel` 2
- WHEN the step runs
- THEN two children run, the others wait, and each child has its own worktree

#### Scenario: Collect
- GIVEN all children ended
- WHEN the last child ends
- THEN the parent step holds the five outputs

#### Scenario: Conflict
- GIVEN two children that change the same line
- WHEN the second child joins
- THEN the run blocks, the event names the child and the file, and the run folder holds the first child only

#### Scenario: Join
- GIVEN three children that ended with a change each
- WHEN the last child ends
- THEN the system merges the three children into the run folder in child order
- AND the three child worktrees are gone

#### Scenario: Join conflict
- GIVEN the change of the second child conflicts with the first
- WHEN the last child ends
- THEN the run moves to `Blocked` and the event names the second child and its files
- AND the child worktrees stay until a person clicks and the join succeeds

### Requirement: REQ-014 Roles

The system SHALL read each role as a Markdown profile at `.shipyard/roles/<role>.md`. The roles `scout`, `worker`, `reviewer`, `planner`, `tester`, `docs` and `triager` SHALL exist by default. A project SHALL be able to add roles.

#### Scenario: Project role
- GIVEN a file `.shipyard/roles/security.md`
- WHEN a step names the role `security`
- THEN the step runs with that profile

#### Scenario: Unknown role
- GIVEN a step names a role with no file
- WHEN the file loads
- THEN the schema check reports the missing role

### Requirement: REQ-015 Runners

The system SHALL run agents headless with streamed JSON, as far as the connections allow. The system SHALL support Claude Code, Codex, GitHub Copilot, Gemini CLI, OpenCode and HTTP model providers. A runner MUST NOT receive a secret value in its arguments. The log MUST NOT hold one. [NEEDS CLARIFICATION: Q-024 Which runners ship in the first release?] Working assumption: Q-024 option 1, Claude Code and Codex.

#### Scenario: Streamed events
- GIVEN a step with a Claude Code runner
- WHEN the agent works
- THEN each streamed event appears in the run log in order

#### Scenario: Secret
- GIVEN a provider with a key in the keychain
- WHEN a runner starts
- THEN no argument and no log line holds the key

### Requirement: REQ-016 Agent tools

The system SHALL serve the eight tools `ask_question`, `post_progress`, `handoff`, `message`, `spawn_subtask`, `report`, `read_ticket` and `read_ref` to agents. A tool call SHALL write one structured event to the run bus. The system SHALL reject a call with an invalid input. A step SHALL call only the tools of its `tools` field. The system SHALL limit the calls per minute and the size of each call.

#### Scenario: Invalid input
- GIVEN an agent in a step
- WHEN it calls a tool with a missing input
- THEN the system returns an error to the agent and writes no event

#### Scenario: Tool not allowed
- GIVEN a step with `tools: [read_ref]`
- WHEN the agent calls `report`
- THEN the system refuses the call

#### Scenario: Too many calls
- GIVEN a step that has used its calls of the minute
- WHEN the agent calls a tool again
- THEN the system returns an error with the wait time and writes no event

### Requirement: REQ-017 ask_question tool

`ask_question` SHALL take a question, two to four options and one recommended option. It SHALL also take a flag for free text and an optional ref of a spec. It SHALL move the run to `WaitingForAnswer` and SHALL hand the question to the questions loop.

#### Scenario: Valid question
- GIVEN an agent in `Working`
- WHEN it calls `ask_question` with three options
- THEN the run moves to `WaitingForAnswer` and the question reaches the questions loop

#### Scenario: One option
- GIVEN an agent
- WHEN it calls `ask_question` with one option
- THEN the system rejects the call

### Requirement: REQ-018 post_progress and report tools

`post_progress` SHALL take a short text. It SHALL show the text in the event tail and the ticket summary. `report` SHALL take an outcome (done, partial or failed), a summary and refs of the artifacts. It SHALL end the step with that output.

#### Scenario: Progress
- GIVEN an agent in a step
- WHEN it calls `post_progress`
- THEN the text shows in the event tail

#### Scenario: Report
- GIVEN an agent in a step
- WHEN it calls `report` with the outcome `done`
- THEN the step ends and its output goes to the steps that need it

### Requirement: REQ-019 handoff, message and spawn_subtask tools

`handoff` SHALL take a role, a summary and an optional target step. It SHALL end the calling child and pass the summary to that role in the same run. `message` SHALL take a target step or the person, and a text. It SHALL deliver the text at the next turn of the target. `spawn_subtask` SHALL take a title, a brief and a role. It SHALL start a child run under the limits of the calling step.

#### Scenario: Subtask
- GIVEN a step with `max_parallel` 2 and two children running
- WHEN an agent calls `spawn_subtask`
- THEN the call returns an error that says the step runs 2 of 2 children, and no child starts

#### Scenario: Subtask with a free slot
- GIVEN a `for_each` step with a worktree workspace and one child running
- WHEN an agent calls `spawn_subtask`
- THEN a new child of the same step starts in its own worktree, and the step waits for it before the join

#### Scenario: Subtask outside a fan-out
- GIVEN a step with no `for_each`, or a step whose workspace is not `worktree`
- WHEN an agent calls `spawn_subtask`
- THEN the call returns an error and no child starts

#### Scenario: Subtask over the budget
- GIVEN a run at 80 % of its budget
- WHEN an agent calls `spawn_subtask`
- THEN the call returns an error and no child starts

#### Scenario: Handoff
- GIVEN a builder child and a reviewer step that has not started
- WHEN the builder calls `handoff` with the role `reviewer` and a summary
- THEN the builder ends, and the reviewer brief holds the summary

#### Scenario: Message to a running step
- GIVEN two children that run
- WHEN one calls `message` for the other
- THEN the other stops after its turn and starts again on its CLI session with the text

#### Scenario: Message to person
- GIVEN an agent in a step
- WHEN it calls `message` for the person
- THEN the text shows in Home / Inbox and the run does not wait

### Requirement: REQ-020 read_ticket and read_ref tools

`read_ticket` SHALL take a ref `wi:` and SHALL return the mirrored ticket. `read_ref` SHALL take any ref and SHALL return its resolved text. Both tools SHALL be read-only, and a ref that does not resolve SHALL return an error and not a guess.

#### Scenario: Read a ref
- GIVEN a ref `adr:0005`
- WHEN an agent calls `read_ref`
- THEN it receives the text of the ADR

#### Scenario: Unresolved ref
- GIVEN a ref that no entity holds
- WHEN an agent calls `read_ref`
- THEN it receives an error

### Requirement: REQ-021 Run log

The system SHALL keep an append-only run log. The log SHALL hold one event for each state change, tool call, runner event and write. The system MUST NOT edit or delete an event. The UI and the ticket summary SHALL read the same log.

#### Scenario: Append only
- GIVEN a run log with ten events
- WHEN any caller tries to change or delete event three
- THEN the system refuses and the log still holds the ten events, with event three as it was

#### Scenario: Same source
- GIVEN a run with progress events
- WHEN the UI and the ticket summary render
- THEN both show the same events

### Requirement: REQ-022 Budgets

The system SHALL enforce a budget in tokens and money per run, per day and per member. It SHALL raise one alert at 80 % of a budget. It SHALL move the run to `Paused` at 100 %. [NEEDS CLARIFICATION: Q-023 What are the default budgets?] Working assumption: Q-023 option 1, the workflow limit for a run and no default per day or per member.

#### Scenario: Alert
- GIVEN a run with a budget of 5 USD
- WHEN it spends 4 USD
- THEN one alert shows in the Inbox

#### Scenario: Hard stop
- GIVEN a run with a budget of 5 USD
- WHEN it spends 5 USD
- THEN the run moves to `Paused` and stops its agents

### Requirement: REQ-023 Stall timeout and max turns

The system SHALL stop a step that sends no event for the stall timeout. It SHALL treat that step as a failed step. The system SHALL stop a run at its max turns and SHALL move it to `Failed`.

#### Scenario: Stall
- GIVEN a step with `stall_s` 300
- WHEN no event arrives for 300 s
- THEN the step stops and the run moves to `RetryQueued`

#### Scenario: Max turns
- GIVEN a run with `max_turns` 40
- WHEN the agent reaches turn 40
- THEN the run moves to `Failed` with the reason max turns

### Requirement: REQ-024 Kill switches

The system SHALL offer a kill switch per run and one global kill switch. The run switch SHALL move the run to `Cancelled`. The global switch SHALL cancel every active run on this machine and stop pickup until a person turns it off.

#### Scenario: Run switch
- GIVEN an active run
- WHEN the person uses its kill switch
- THEN its agents stop and it moves to `Cancelled`

#### Scenario: Global switch
- GIVEN three active runs
- WHEN the person uses the global kill switch
- THEN all three move to `Cancelled` and no new run starts

### Requirement: REQ-025 Write switches

The system SHALL keep four switches in `.shipyard/automation.yaml`: `push`, `pull_request`, `tracker_transition` and `tracker_comment`. All four SHALL be off by default, and a project admin SHALL turn each one on in Settings / Project, group Automation. That group SHALL be the one editor of `.shipyard/automation.yaml`. [NEEDS CLARIFICATION: Q-002 What is the default for automation writes?] Working assumption: Q-002 option 1, all off.

#### Scenario: Default off
- GIVEN a new project
- WHEN a person reads the switches
- THEN all four are off

#### Scenario: Admin turns on
- GIVEN a project admin in Settings
- WHEN they turn on `push`
- THEN the next push of a run goes out with no approval

#### Scenario: Force with lease
- GIVEN `push` on and a push that rewrites history
- WHEN the run sends it
- THEN the push waits as an approval in Home / Inbox

### Requirement: REQ-026 Approvals

A write without its switch SHALL become an approval in Home / Inbox that names the exact write. One click SHALL send the write, and a rejection SHALL drop it and move the run to `Blocked`. A push with force with lease SHALL always wait for approval, also when `push` is on (`add-delivery` REQ-015).

#### Scenario: Approve
- GIVEN a run that wants to push and `push` off
- WHEN the person clicks Approve in the Inbox
- THEN the push goes out once

#### Scenario: Reject
- GIVEN a pending approval
- WHEN the person rejects it
- THEN the write does not go out and the run moves to `Blocked`

### Requirement: REQ-027 Runs view

Factory / Runs SHALL show six lanes, each with a count. The view SHALL have one primary action. Each run SHALL sit in the lane that REQ-038 gives.

#### Scenario: Needs you lane
- GIVEN a run in `WaitingForAnswer`
- WHEN the person opens Runs
- THEN the run shows in the lane Needs you

#### Scenario: Empty lane
- GIVEN no run in Done
- WHEN the person opens Runs
- THEN the lane shows ghost rows

### Requirement: REQ-028 Run view

The run view SHALL show the workflow DAG with the live state of each step. It SHALL also show the event tail, the diff of the worktree and the cost. It SHALL offer the kill switch of the run.

#### Scenario: Live step
- GIVEN a running step
- WHEN an event arrives
- THEN the DAG node and the event tail update

#### Scenario: Diff
- GIVEN a run with a worktree
- WHEN the person opens the diff
- THEN the changed files show

### Requirement: REQ-029 Workflows view

Factory / Workflows SHALL list the workflows with their steps and SHALL edit the same files as REQ-010. It SHALL show a validation error with its line.

#### Scenario: Edit
- GIVEN a workflow
- WHEN the person saves a valid edit in the view
- THEN the file in `.shipyard/workflows/` changes

#### Scenario: Error
- GIVEN an invalid edit
- WHEN the person saves
- THEN the view shows the error and the line

### Requirement: REQ-030 Agents map

Factory / Agents map SHALL show a live graph of agents, tickets, files and refs. A click on a node SHALL open its entity in the inspector.

#### Scenario: Live node
- GIVEN a running agent
- WHEN it reads a file
- THEN a link from the agent to the file shows

#### Scenario: Open entity
- GIVEN a ticket node
- WHEN the person clicks it
- THEN the inspector shows the ticket

### Requirement: REQ-031 Sessions view

Factory / Sessions SHALL list the agent sessions. Each row SHALL show runner, model, run, state and tokens. The view SHALL offer the global kill switch as its primary action.

#### Scenario: Session row
- GIVEN a live session
- WHEN the person opens Sessions
- THEN the row shows runner, model, run, state and tokens

#### Scenario: Stop all
- GIVEN live sessions
- WHEN the person uses the global kill switch
- THEN all sessions stop

### Requirement: REQ-032 Usage view

Factory / Usage SHALL show tokens and money per run, per day and per member against their budgets. It SHALL let an admin set a budget.

#### Scenario: Per member
- GIVEN two members with runs
- WHEN the person opens Usage
- THEN the view shows the spend of each member against its budget

#### Scenario: Set budget
- GIVEN an admin
- WHEN they set a daily budget
- THEN the next run checks that budget

### Requirement: REQ-033 Interface rules

Each Factory view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path and a focus ring. It SHALL have assistive labels, enough contrast and reduced motion. It SHALL show French and English text.

#### Scenario: Keyboard
- GIVEN any Factory view
- WHEN the person uses only the keyboard
- THEN they reach every action and see the focus ring

#### Scenario: Reduced motion
- GIVEN reduced motion is on
- WHEN a run step changes state
- THEN the view shows the change with no animation

### Requirement: REQ-034 Entities

The system SHALL expose each run as `run:<ulid>` with its steps as `run:<ulid>/<step-id>`, and each workflow as `wf:<id>`. It SHALL expose the run state to `work` and `refs`.

#### Scenario: Backlinks
- GIVEN a run for `wi:SHIP-42`
- WHEN the person opens the ticket in the inspector
- THEN the run shows in its backlinks

### Requirement: REQ-035 Workflow limits

A workflow SHALL hold a `limits` block with `max_turns`, `budget_usd` and `stall_s`. The block SHALL set the max turns, the budget in USD and the stall timeout of each run. The system SHALL reject a limit that is not a positive number.

#### Scenario: Limits apply
- GIVEN a workflow with `limits: { max_turns: 40, budget_usd: 5, stall_s: 300 }`
- WHEN a run of that workflow starts
- THEN the run stops at turn 40, pauses at 5 USD and stalls after 300 s with no event

#### Scenario: Bad limit
- GIVEN a workflow with `budget_usd: -1`
- WHEN the file loads
- THEN the schema check rejects it

### Requirement: REQ-036 SelfReview

After the build steps end, a run SHALL enter `SelfReview`. `SelfReview` SHALL follow `add-delivery` REQ-001 to REQ-004. `max_rounds` SHALL NOT exceed 2.

#### Scenario: Clean review
- GIVEN a run in `SelfReview`
- WHEN the reviewer finds nothing
- THEN the run moves to `PROpen`

#### Scenario: Fix round
- GIVEN a run in `SelfReview` with round 1 spent
- WHEN the reviewer finds a defect
- THEN the run returns to `Working` in the same worktree for round 2

#### Scenario: Rounds spent
- GIVEN a run with two fix rounds spent and a P0 or P1 finding left
- WHEN the reviewer reports it
- THEN the run moves to `Blocked` and Home / Inbox shows a card with the finding

#### Scenario: Fresh context
- GIVEN a run in `SelfReview`
- WHEN the reviewer session starts
- THEN it holds no context of the build sessions

### Requirement: REQ-037 Tool transports

The system SHALL serve the agent tools over two transports, stdio and HTTP. Both transports SHALL offer the same eight tools with the same inputs. The HTTP transport SHALL accept only calls from this machine.

#### Scenario: Same tools
- GIVEN one session on stdio and one on HTTP
- WHEN each lists its tools
- THEN both list the same eight tools

#### Scenario: Remote caller
- GIVEN the HTTP transport
- WHEN a caller from another machine connects
- THEN the system refuses the call

#### Scenario: No token
- GIVEN the HTTP transport
- WHEN a local caller sends a call with no valid token
- THEN the system answers 401 and runs no tool

#### Scenario: Agent without HTTP entries
- GIVEN a runner whose CLI reads no HTTP MCP entry
- WHEN a step starts it
- THEN the MCP file starts `shipyard --mcp-bridge`, the URL and the token are in the file, and no argument holds the token

#### Scenario: App closed
- GIVEN the bridge runs and the app is closed
- WHEN the agent calls a tool
- THEN the bridge answers with an error that says the app is not running

### Requirement: REQ-038 Run lanes

The lane Queued SHALL hold the states `Queued`, `Claimed` and `RetryQueued`. The lane Working SHALL hold `Planning`, `Working`, `SelfReview` and `ChangesRequested`. The lane Needs you SHALL hold `PlanReview`, `WaitingForAnswer`, `Blocked`, `Paused` and `Failed`. The lane Ready to merge SHALL hold a `PROpen` run with passing CI, no change request and no draft. The lane In review SHALL hold each other `PROpen` run. The lane Done SHALL hold `Merged`, `Done` and `Cancelled`.

#### Scenario: Ready to merge
- GIVEN a run in `PROpen` with passing CI, no change request and no draft
- WHEN the person opens Runs
- THEN the run shows in the lane Ready to merge

#### Scenario: Draft
- GIVEN a run in `PROpen` with passing CI and a draft pull request
- WHEN the person opens Runs
- THEN the run shows in the lane In review

### Requirement: REQ-039 Restart

After a restart, the system SHALL take back the runs, the approval queue, the open questions and the global kill switch from the run log file. A step that ran SHALL start again, on its CLI session when it has one, else with a new brief. The system MUST NOT send a write a second time when the log shows that it went out before the restart.

#### Scenario: Resume a step
- GIVEN a run in `Working` with an agent that has a CLI session
- WHEN the app restarts
- THEN the run is in `Working` with its cost and tokens, and the next pump starts the agent again on that session

#### Scenario: Approvals and questions
- GIVEN an approval that waits and a question that is open
- WHEN the app restarts
- THEN the approval keeps its id and one click sends it, and the answer of the question resumes the run

#### Scenario: Write before the crash
- GIVEN a question comment that went out and the app stopped before it saved the run
- WHEN the app restarts and the agent asks the same question
- THEN no second comment goes out

#### Scenario: Write with no result
- GIVEN the log shows the intent of a comment and no result
- WHEN the app restarts and the same comment is due
- THEN it is not sent, because it may have gone out, and a note says so

#### Scenario: Run with no save
- GIVEN a run in the log that has no save and no end
- WHEN the app restarts
- THEN the system names the run and does not guess its state

#### Scenario: Kill switch
- GIVEN the global kill switch is on
- WHEN the app restarts
- THEN the kill switch is still on

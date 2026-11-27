# Spec: factory

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `docs/openspec/changes/archive/2026-10-31-add-factory/`

### Goal

A claimed ticket becomes a run. The run follows a state machine and a YAML workflow of agent steps. It stays inside its budget, and it stops for a person when a decision or a write belongs to a person. Six views show the work.

### Why

Delegation only sets a label. It has no run engine, no worktree per agent and no budget. Shipyard must take a ticket, run the right agents with the right model and effort, and keep each run safe and visible.

### Users And Scenarios

- PM: sees every run in the lanes, watches cost in Usage, and stops a run with a kill switch.
- Architect: edits the workflows and roles of the project and reviews a plan at PlanReview.
- Developer: reads the run view (DAG, event tail, diff, cost) and takes over a run in its worktree.
- QA: runs `review-only` and the `tester` role on a branch and reads the report.
- BA: starts `spec-split` on a change and approves the plan.
- Functional lead: approves a write from the Inbox with one click.
- Junior: reads the run view to learn how a ticket becomes a pull request.

### Requirement list

- REQ-001: The system SHALL move a run along the main path `Queued`, `Claimed`, `Planning`, `PlanReview`, `Working`, `SelfReview`, `PROpen`, `Merged`, `Done`. A run of a workflow with no pull request step SHALL move to `Done` when its last step ends. The system SHALL refuse and log any transition that this requirement and REQ-002 to REQ-005 do not list.
- REQ-002: A merge in any state that is not final moves the run to `Merged`, then `Done`.
- REQ-003: `PlanReview` SHALL be a human gate. A workflow SHALL be able to turn it off. Then a run SHALL move from `Planning` to `Working` without a person.
- REQ-004: `Blocked` means that a person must act, and follows an escalation only. No new run enters `Failed`.
- REQ-005: An escalated wait or retry keeps its return state. A day budget pause leaves by itself.
- REQ-006: While a run is in `WaitingForAnswer`, the system SHALL pause the stall timer and the budget clock. Both SHALL restart when the run leaves that state.
- REQ-007: Spent retries escalate. A failed guard uses the backoff and is no retry.
- REQ-008: The system SHALL map each of the sixteen run states to a tracker status and labels in `.shipyard/automation.yaml`. The project admin SHALL be able to change each row. The status and label changes SHALL follow the `tracker_transition` switch.
- REQ-009: A run SHALL start only from a ticket that `sync` claimed. The workflow SHALL come from the ticket label `wf:<id>`, else from the project default (`add-projects` REQ-007). On a stop from `add-sync` REQ-004, the system SHALL move the run to `Cancelled`.
- REQ-010: The system SHALL read workflows from `.shipyard/workflows/<id>.yaml` and validate each file with a JSON Schema. The system SHALL reload a changed file at once. It SHALL keep the last valid version when the new file is invalid.
- REQ-011: The system SHALL ship the workflows `feature`, `bug`, `spike`, `spec-split`, `review-only`, `docs-update` and `bootstrap`.
- REQ-012: A step SHALL accept the fields `id`, `role`, `model`, `effort`, `tools`, `needs`, `skill` and `action`. A step SHALL accept the fields `for_each`, `max_parallel`, `retry`, `timeout`, `budget`, `fresh_context` and `max_rounds`. A step SHALL accept `mode` (plan or auto), `workspace` (worktree, shared or none) and `gate` (none or human). The system SHALL reject an unknown field and a `needs` cycle.
- REQ-013: A second child conflict starts a fixer round.
- REQ-014: The system SHALL read each role as a Markdown profile at `.shipyard/roles/<role>.md`. The roles `scout`, `worker`, `reviewer`, `planner`, `tester`, `docs` and `triager` SHALL exist by default. A project SHALL be able to add roles.
- REQ-015: The system SHALL run agents headless with streamed JSON, as far as the connections allow. The system SHALL support Claude Code, Codex, GitHub Copilot, Gemini CLI, OpenCode and HTTP model providers. A runner MUST NOT receive a secret value in its arguments. The log MUST NOT hold one. Claude Code and Codex. The others follow in later changes.
- REQ-016: The system SHALL serve the eight tools `ask_question`, `post_progress`, `handoff`, `message`, `spawn_subtask`, `report`, `read_ticket` and `read_ref` to agents. A tool call SHALL write one structured event to the run bus. The system SHALL reject a call with an invalid input. A step SHALL call only the tools of its `tools` field.
- REQ-017: `ask_question` SHALL take a question, two to four options and one recommended option. It SHALL also take a flag for free text and a kind, `ticket` (default) or `spec`. A `spec` question SHALL carry a ref of a spec, and a `ticket` question SHALL NOT. It SHALL move the run to `WaitingForAnswer` and SHALL hand the question to the questions loop.
- REQ-018: `post_progress` SHALL take a short text. It SHALL show the text in the event tail and the ticket summary. `report` SHALL take an outcome (done, partial or failed), a summary, refs of the artifacts and optional named output fields, such as the list `tasks` of a plan. It SHALL end the step with that output. A report above the size cap SHALL be an error.
- REQ-019: `handoff` SHALL take a role, a summary and an optional target step. It SHALL end the calling child and pass the summary to that role in the same run. `message` SHALL take a target step or the person, and a text. It SHALL deliver the text at the next turn of the target. `spawn_subtask` SHALL take a title, a brief and a role. It SHALL start a child run under the limits of the calling step: the step needs `for_each` and a worktree workspace, the children that run now stay under `max_parallel`, and the run budget is under its alert level.
- REQ-020: `read_ticket` SHALL take a ref `wi:` and SHALL return the mirrored ticket. `read_ref` SHALL take any ref and SHALL return its resolved text. Both tools SHALL be read-only, and a ref that does not resolve SHALL return an error and not a guess.
- REQ-021: The system SHALL keep an append-only run log. The log SHALL hold one event for each state change, tool call, runner event and write. The system MUST NOT edit or delete an event. The UI and the ticket summary SHALL read the same log.
- REQ-022: A day budget pause resumes the next day. A run or member budget pause escalates.
- REQ-023: A stall is a failed attempt. No turn count stops a run (`adr:0025`).
- REQ-024: The system SHALL offer a kill switch per run and one global kill switch. The run switch SHALL move the run to `Cancelled`. The global switch SHALL cancel every active run on this machine and stop pickup until a person turns it off.
- REQ-025: The system SHALL keep four switches in `.shipyard/automation.yaml`: `push`, `pull_request`, `tracker_transition` and `tracker_comment`. All four SHALL be on by default, and a project admin SHALL turn each one off in Settings / Project, group Automation. That group SHALL be the one editor of `.shipyard/automation.yaml`. All on. A force push and a merge still wait for a person. An admin turns a switch off per project, and each write of that switch then waits for one click in Home / Inbox. A person with `project.settings` SHALL also be able to allow exactly the kinds of the effects of one approval question (`transition`, `labels`, `comment`, `push`, `open_pr`, `resolve_threads`) for the runs of one workflow only (`recipe_writes`, `spec:app-redesign#REQ-013`), and to remove each kind of it in that group. A write that already waits SHALL keep its question: a permission applies to the writes that come later. Remove SHALL take effect with Save. A save of that group SHALL never add a kind or a workflow to `recipe_writes`. A push with force with lease SHALL get no such permission.
- REQ-026: A rejected tracker write is skipped. A rejected push or pull request escalates.
- REQ-027: Factory / Runs SHALL show five lanes, each with a count, and a History view. The view SHALL have one primary action. Each run that is not ended, and the latest failed run of a ticket, SHALL sit in the lane that REQ-038 gives. History SHALL list every ended run.
- REQ-028: The run view SHALL show the workflow DAG with the live state of each step. It SHALL also show the event tail, the diff of the worktree and the cost. It SHALL offer the kill switch of the run.
- REQ-029: Factory / Workflows SHALL list the workflows with their steps and SHALL edit the same files as REQ-010. It SHALL show a validation error with its line.
- REQ-030: Factory / Agents map SHALL show a live graph of agents, tickets, files and refs. A click on a node SHALL open its entity in the inspector.
- REQ-031: Factory / Sessions SHALL list the agent sessions. Each row SHALL show runner, model, run, state and tokens. The view SHALL offer the global kill switch as its primary action. The list SHALL include the AI tool sessions of the run units (Active, Previous, start time), and a click SHALL open the run page at the unit. The run page SHALL list its started units with Follow and, for a Claude Code unit with a session id, Open in terminal, which SHALL be off while the unit runs.
- REQ-032: Factory / Usage SHALL show tokens and money per run, per day and per member against their budgets. It SHALL let an admin set a budget.
- REQ-033: Each Factory view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path and a focus ring. It SHALL have assistive labels, enough contrast and reduced motion. It SHALL show French and English text.
- REQ-034: The system SHALL expose each run as `run:<ulid>` with its steps as `run:<ulid>/<step-id>`, and each workflow as `wf:<id>`. It SHALL expose the run state to `work` and `refs`.
- REQ-035: The `limits` block holds the caps `review_rounds`, `feedback_rounds` and `fix_rounds`.
- REQ-036: Review rounds count for the whole run, default 4. The last round uses the top model tier.
- REQ-037: The system SHALL serve the agent tools over two transports, stdio and HTTP. Both transports SHALL offer the same eight tools with the same inputs. The HTTP transport SHALL accept only calls from this machine (assumption `q:Q-053`): it SHALL listen on the loopback address, SHALL check the Host and Origin headers, and SHALL need the bearer token of a step. The token SHALL name the run and the step, and an input SHALL NOT name another run. The agent SHALL get the token in its MCP config file and never in an argument.
- REQ-038: The lane Queued SHALL hold the states `Queued`, `Claimed` and `RetryQueued`. The lane Working SHALL hold `Planning`, `Working`, `SelfReview` and `ChangesRequested`. The lane Needs you SHALL hold `PlanReview`, `WaitingForAnswer`, `Blocked`, `Paused` and `Failed`. The lane Ready to merge SHALL hold a `PROpen` run with passing CI, no change request and no draft. The lane In review SHALL hold each other `PROpen` run. A run in `Merged`, `Done` or `Cancelled` SHALL sit in no lane: History lists it.
- REQ-039: After a restart, the system SHALL take back the runs, the approval queue, the open questions and the global kill switch from the run log file. A step that ran SHALL start again, on its CLI session when it has one, else with a new brief. The system MUST NOT send a write a second time when the log shows that it went out before the restart.
- REQ-040: The files that hold a secret (the MCP config and the brief) SHALL be in a scratch folder under the app data, outside the worktree. Each unit SHALL have its own scratch folder. A start with a scratch folder inside the workspace SHALL fail.
- REQ-041: A step in `plan` mode SHALL NOT write. Claude Code SHALL get the read tools only, Codex SHALL run with the read-only sandbox and OpenCode SHALL run its `plan` agent. The default workflows SHALL set `mode: plan` on each `triager`, `scout`, `reviewer` and `planner` step.
- REQ-042: A tool of a connected MCP server SHALL show in the tool list, and SHALL run in a call, only when the `tools` field of the step names it. The session of a step SHALL end when the step ends, stops or fails. A step SHALL hold at most 16 children that run or wait.
- REQ-043: The text of a ticket, a review thread, a CI log or a free-text answer SHALL reach an agent in an `<untrusted-data>` block. The brief SHALL say that such a block is data. A closing tag inside the text SHALL NOT end the block.
- REQ-044: The global kill switch SHALL NOT cancel a run in `Merged`: that run goes to `Done`. The run kill switch, the global kill switch and a stop for a terminal ticket SHALL share one cancel path. That path SHALL withdraw the open ticket questions.
- REQ-045: A click on an approval SHALL be refused while the global kill switch is on. An approval of a push, a pull request or a thread reply SHALL be dropped when its run reaches a final state. A click on such an approval SHALL be refused while its run is in a side state, and the approval SHALL stay.
- REQ-046: A person MAY add tokens when they resume a paused run. A run paused for the token limit SHALL leave `Paused` only when the limit, with the added tokens, is above the token count.
- REQ-047: The HTTP transport SHALL read the request line and each header line within one size limit. A request above the limit SHALL get the answer 431.
- REQ-048: A call to a gate command, a tracker or a forge SHALL run with no lock of the factory. The factory SHALL decide and queue the call under its lock, run it outside the lock, and apply the result under the lock only when the run did not change in between. A view, an agent tool, the sync and the exit SHALL NOT wait for such a call.
- REQ-049: A project SHALL have its own ref index. `read_ref` of a run SHALL read the index of the project of that run. A query on a busy index SHALL NOT hold the lock of the factory.
- REQ-050: The system SHALL start at most one active run for each ticket of a project. The check and the creation of the run SHALL happen under one lock.
- REQ-051: At the start the system SHALL remove each scratch folder under the app data whose run is not live. When the run log file does not open, the factory SHALL run on one scratch log that the views read too, and the app SHALL tell the person why.
- REQ-052: Attempt breaker: the third failed attempt of a step escalates.
- REQ-053: Escalation: agents stop, one record, one report, one notice, the label `shipyard:blocked`.
- REQ-054: Run caps that no round and no retry resets.
- REQ-055: Same failure twice in a row, or no fewer blocking findings, escalates.
- REQ-056: Guards before each attempt.
- REQ-057: Fixer round for a conflict or an empty branch.
- REQ-058: Stop report, once.
- REQ-059: Attempt fencing.

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

- [x] A claimed ticket creates a run in `Queued` and the run reaches `Done` through the main path. Test: `crates/shipyard-engine/tests/engine.rs`.
- [x] A transition that the state machine does not list is refused and logged. Test: `crates/shipyard-core/tests/run_state.rs`.
- [x] PlanReview waits for a person, and a workflow with the gate off skips it. Test: `crates/shipyard-core/tests/run_state.rs`, `crates/shipyard-engine/tests/engine.rs`.
- [x] A run in `WaitingForAnswer` shows no stall timeout and no budget spend, and returns to its stored state. Test: `crates/shipyard-core/tests/run_state.rs`, `crates/shipyard-engine/tests/questions.rs`.
- [x] A failed step retries after 10 s, 20 s, 40 s and so on, never more than 5 min apart. Test: `crates/shipyard-core/tests/run_state.rs`, `crates/shipyard-engine/tests/engine.rs`.
- [ ] Each of the sixteen run states has a tracker status and labels in `.shipyard/automation.yaml`, and an edit changes the next write.
- [x] A broken workflow file shows its error and the last valid version keeps running. Test: `crates/shipyard-store/tests/factory_files.rs`, `e2e/factory.spec.ts`.
- [x] The five default workflows exist and validate against the schema. Test: `crates/shipyard-store/tests/factory_files.rs`.
- [x] A `for_each` step with `max_parallel` 2 runs at most two children, each in its own worktree. Test: `crates/shipyard-core/tests/workflow.rs`, `crates/shipyard-git/tests/worktree.rs`.
- [x] The children of a worktree step join the run folder at fan-in. A first conflict runs the child again from the run branch, and a second conflict blocks the run. Test: `crates/shipyard-engine/tests/children.rs`.
- [ ] A role file in `.shipyard/roles/` changes the profile that its step uses.
- [x] A runner streams events to the run bus, and no secret value appears in its arguments or in the log. Test: `crates/shipyard-agents/tests/runner.rs`.
- [x] Each of the eight tools writes one event with the effect named in its requirement, and a bad input is rejected. Test: `crates/shipyard-mcp/tests/tools.rs`.
- [ ] The run log has no edit and no delete, and the UI and the ticket summary show the same events.
- [x] A run at 80 % of its budget raises one alert, and at 100 % it moves to `Paused`. Test: `crates/shipyard-engine/tests/engine.rs`.
- [x] A run in `Paused` leaves it when a person raises the budget and resumes it. Test: `crates/shipyard-engine/tests/engine.rs`.
- [x] A workflow `limits` block sets budget and stall timeout, and a bad value is rejected. Test: `crates/shipyard-core/tests/workflow.rs`, `crates/shipyard-engine/tests/engine.rs`.
- [x] `SelfReview` uses a fresh reviewer, allows two fix rounds at most, and moves to `Blocked` when they are spent. Test: `crates/shipyard-engine/tests/review.rs`.
- [x] The agent tools answer on stdio and on HTTP, and HTTP accepts only this machine. Test: `crates/shipyard-mcp/tests/transport.rs`.
- [x] A run with no event for the stall timeout is stopped, and a run with many turns goes on. Test: `crates/shipyard-engine/tests/engine.rs`.
- [x] The kill switch of a run cancels it, and the global kill switch cancels every active run and stops pickup. Test: `crates/shipyard-engine/tests/engine.rs`, `e2e/factory.spec.ts`.
- [x] After a restart the runs, the approval queue, the open questions and the kill switch are back, running steps start again, and no write that went out is sent twice. Test: `crates/shipyard-engine/tests/restart.rs`.
- [x] With all four write switches off, each write appears in the Inbox as an approval, and one click sends it. Test: `crates/shipyard-engine/tests/approvals.rs`.
- [x] The Runs view shows the six lanes with counts, puts each state in its lane, shows a ready `PROpen` run in Ready to merge, and the run view shows the DAG, event tail, diff and cost. Test: `src/features/factory/runs.test.tsx`, `e2e/factory.spec.ts`.
- [ ] The Workflows, Agents map, Sessions and Usage views each open from the Factory sidebar and have one primary action.
- [ ] Every Factory view works with the keyboard, shows a focus ring and has assistive labels, in French and English.

### Links

- Consumes: `add-sync` REQ-003, REQ-004, REQ-008 and REQ-009 (ticks, terminal tickets, claims), `add-connections` REQ-003, REQ-009, REQ-010 and REQ-011 (capability flags, runners, providers, secrets), `add-extensions` (compass roles and skills), `add-specs` (the `spec-split` workflow reads a change), `add-refs` REQ-014 (`read_ref`), `add-shell` REQ-003 and REQ-004 (Inbox) and REQ-007 (active runs in the status bar), `add-design-system` REQ-005 (RunStep, ApprovalBar).
- Produces: `run:` and `wf:` entities (indexed by `add-refs` REQ-003), the run log, approvals for the Inbox, questions for `add-questions-loop`, a reviewed worktree for `add-delivery`, run state for `add-work` and `add-refs`.

### Feature list

| Feature | Shipyard view | REQ ids |
|---|---|---|
| Specifications, delegate (sets a label) | Factory / Runs, Workflows | REQ-001, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013, REQ-014 |
| AI sessions bar | Factory / Sessions | REQ-015, REQ-024, REQ-031 |
| Orca (worktree per task) | Factory / Agents map, run view | REQ-013, REQ-028, REQ-030 |
| FinOps | Factory / Usage | REQ-022, REQ-032, REQ-035 |
| MCP server (HTTP, stdio, relay, gates, proxy) | Agent tools and approvals | REQ-016, REQ-017, REQ-018, REQ-019, REQ-020, REQ-025, REQ-026, REQ-037 |
| Répartition gates | PlanReview gate and approvals | REQ-003, REQ-026 |

### Existing References

- Existing code/docs/specs: `docs/plan/MASTER-PLAN.md` sections 5.3, 5.4, 5.5, 5.8 and 5.9; `adr:0005`; `adr:0006`; Q-002.
- Supersedes or extends: N/A

### Clarifications

- Q-025 How does a run leave Blocked?: On the next tick after the cause is gone, or by a click of the person, with an optional message for the agents.
- Q-024 Which runners ship in the first release?: Claude Code and Codex. The others follow in later changes.
- Q-023 What are the default budgets?: A run has a budget only when its workflow sets `budget_usd`; with none, the run has no budget of its own and the day, member and token budgets still apply. No default per day or per member until an admin sets one.
- Q-002 What is the default for automation writes?: All on. A force push and a merge still wait for a person. An admin turns a switch off per project, and each write of that switch then waits for one click in Home / Inbox.

## Requirements

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

A run SHALL return to `Planning` when a person rejects the plan at `PlanReview`. A run SHALL return to `Working` from `SelfReview` for a fix round and from `ChangesRequested`, in the same worktree. A CI failure or a review comment on the pull request SHALL move a run from `PROpen` to `ChangesRequested`. A pull request that merges while the run holds it, in any state that is not final, SHALL stop the agents, withdraw its questions and move the run to `Merged`, then `Done`.

#### Scenario: CI failure
- GIVEN a run in `PROpen`
- WHEN the pull request CI fails
- THEN the run moves to `ChangesRequested`, then to `Working` in the same worktree

#### Scenario: Merge during a fix
- GIVEN a run in `Working` for a fix round of an open pull request
- WHEN the pull request merges
- THEN the agents stop, the run moves to `Merged` and then to `Done`, and a push that waits for a click is dropped

#### Scenario: Merge during a wait
- GIVEN a run in `WaitingForAnswer` with an open pull request and an open question
- WHEN the pull request merges
- THEN the question is withdrawn, and the run moves to `Merged` and then to `Done`

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

From any active state, a run SHALL be able to enter `WaitingForAnswer`, `Blocked`, `RetryQueued`, `Paused` or `Cancelled`. `Blocked` SHALL mean that a person must act, and SHALL follow an escalation (REQ-053) only. `RetryQueued` follows a failed attempt or a failed guard. `Paused` follows a spent budget or max turns. `Cancelled` follows a kill switch, a stop of `sync` REQ-004 or a closed pull request. The engine SHALL NOT move a new run to `Failed` (assumption `q:Q-166`).

#### Scenario: Question and budget
- GIVEN a run in `Working`
- WHEN the agent calls `ask_question`, or a hard budget stop applies
- THEN the run moves to `WaitingForAnswer`, or to `Paused`

#### Scenario: Failed step
- GIVEN a run in `Working` with retries left
- WHEN the step fails
- THEN the run moves to `RetryQueued`

#### Scenario: Rejected approval
- GIVEN a run that waits for the approval of a push
- WHEN the person rejects it
- THEN the run moves to `Blocked` with the cause push rejected, and the log holds the reason

#### Scenario: No new Failed
- GIVEN a run in `Working` whose step has spent its retries
- WHEN the step fails again
- THEN the run moves to `Blocked` and not to `Failed`

### Requirement: REQ-005 Return state

A run SHALL store its return state when it enters `WaitingForAnswer`, `Blocked`, `RetryQueued` or `Paused`. A run that escalates from `WaitingForAnswer` or `RetryQueued` SHALL keep that return state in `Blocked`. The run SHALL go back to that state when it leaves. `Failed`, `Cancelled` and `Done` SHALL be final. A run SHALL leave `Paused` when each spent budget has room, and a resume with no room SHALL keep it there. An unblock SHALL take an optional message for the agents.

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

#### Scenario: Escalated wait
- GIVEN a run in `WaitingForAnswer` with the return state `Working`
- WHEN the wait escalates
- THEN the run is in `Blocked` with the return state `Working`

#### Scenario: Unblock with a message
- GIVEN a run in `Blocked`
- WHEN a person types a message and unblocks the run
- THEN the run returns to its stored state and the next brief of each running step holds the message

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

The system SHALL delay retry number n of a step by min(10 s x 2^(n-1), 5 min). When the `retry` count of a step or its breaker (REQ-052) is spent, the run SHALL escalate (REQ-053). A failed guard (REQ-056) SHALL wait with the same delays and SHALL NOT count as a retry.

#### Scenario: Backoff steps
- GIVEN a step that fails four times
- WHEN the engine queues each retry
- THEN the delays are 10 s, 20 s, 40 s and 80 s

#### Scenario: Backoff cap
- GIVEN a step at retry number 7
- WHEN the engine queues the retry
- THEN the delay is 5 min

#### Scenario: Retries spent
- GIVEN a step with `retry` 1
- WHEN the step fails for the second time
- THEN the run moves to `Blocked` with the cause retries spent

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

The system SHALL ship the workflows `feature`, `bug`, `spike`, `spec-split`, `review-only`, `docs-update` and `bootstrap`. `feature` SHALL grill, plan with a human gate, build with fan-out, review and open a pull request. `bug` SHALL triage, fix, review and open a pull request, with no `PlanReview`. `spike` SHALL grill, investigate and report, with no pull request. `spec-split` SHALL read a change and propose work items behind a human gate. `review-only` SHALL review a branch and report.

#### Scenario: Defaults present
- GIVEN a new project
- WHEN a person opens Factory / Workflows
- THEN the seven workflows show and each one validates

#### Scenario: Docs update
- GIVEN a stale doc
- WHEN a run of `docs-update` ends
- THEN the doc is up to date and a pull request is open

#### Scenario: Bootstrap
- GIVEN a new project
- WHEN a run of `bootstrap` starts
- THEN it plans the first specs and the skeleton behind a human gate, builds them, reviews them and opens a pull request

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

A `for_each` step SHALL start one child run for each item of its list, at most `max_parallel` at a time (default 2). A child SHALL get its own worktree when its `workspace` is `worktree`. The parent SHALL collect the child outputs. After the last child, the system SHALL squash each child onto the run branch in child order and remove the child worktrees. A conflict SHALL run the child again from the run branch. A second conflict SHALL start a fixer round (REQ-057).

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
- WHEN the second child joins for the first time
- THEN the second child runs again in a new worktree from the run branch, which holds the first child
- AND the event names the child and the file, and the run does not block

#### Scenario: Join
- GIVEN three children that ended with a change each
- WHEN the last child ends
- THEN the system merges the three children into the run folder in child order, one commit for each
- AND the three child worktrees are gone

#### Scenario: Join conflict
- GIVEN the second child conflicts with the first again after its new run
- WHEN it joins
- THEN a fixer round starts in the run worktree with the files of the second child, with no click
- AND the run does not move to `Blocked`

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

The system SHALL run agents headless with streamed JSON, as far as the connections allow. The system SHALL support Claude Code, Codex, GitHub Copilot, Gemini CLI, OpenCode and HTTP model providers. A runner MUST NOT receive a secret value in its arguments. The log MUST NOT hold one. Claude Code and Codex. The others follow in later changes.

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

The system SHALL enforce a budget in tokens and money per run, per day and per member. It SHALL raise one alert at 80 % of a budget and move the run to `Paused` at 100 %. A run has a budget only when its workflow sets `budget_usd`. No default per day or per member until an admin sets one. A run paused by the day budget SHALL resume by itself at the first tick of the next day when no other budget is spent. A pause for the run or the member budget SHALL escalate (REQ-053).

#### Scenario: Alert
- GIVEN a run with a budget of 5 USD
- WHEN it spends 4 USD
- THEN one alert shows in the Inbox

#### Scenario: Hard stop
- GIVEN a run with a budget of 5 USD
- WHEN it spends 5 USD
- THEN the run moves to `Paused`, stops its agents and posts one stop report

#### Scenario: No run budget
- GIVEN a run of a workflow with no `budget_usd`
- WHEN it spends 50 USD and no day, member or token budget is spent
- THEN the run does not pause and no alert shows

#### Scenario: Next day
- GIVEN a run in `Paused` because the day budget is spent
- WHEN the first tick of the next day runs
- THEN the run returns to its stored state with no click and posts no stop report

### Requirement: REQ-023 Stall timeout and turns

The system SHALL stop a step that sends no event for the stall timeout, and SHALL count that step as a failed attempt (REQ-052). The system SHALL NOT stop, pause or fail a run for a number of turns, and SHALL NOT pass a turn limit to an AI tool (`adr:0025`).

#### Scenario: Stall
- GIVEN a step with `stall_s` 300
- WHEN no event arrives for 300 s
- THEN the step stops, its failed attempts go up by one, and the run moves to `RetryQueued`

#### Scenario: Many turns
- GIVEN a run whose agent has used 200 turns
- WHEN the agent starts turn 201
- THEN the run stays in its state and no turn count stops it

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

The system SHALL keep four switches in `.shipyard/automation.yaml`: `push`, `pull_request`, `tracker_transition` and `tracker_comment`. All four SHALL be on by default. A project admin SHALL turn each one off in Settings / Project, group Automation, the one editor of the file. A force push and a merge SHALL still wait for a person. A person with `project.settings` SHALL be able to allow and remove kinds of effects for one workflow (`recipe_writes`, `spec:app-redesign#REQ-013`).

#### Scenario: Default on
- GIVEN a new project
- WHEN a person reads the switches
- THEN all four are on

#### Scenario: Admin turns off
- GIVEN a project admin in Settings
- WHEN they turn off `push`
- THEN the next push of a run waits as an approval in Home / Inbox

#### Scenario: Force with lease
- GIVEN `push` on and a push that rewrites history
- WHEN the run sends it
- THEN the push waits as an approval in Home / Inbox

#### Scenario: Switch off waits for a click
- GIVEN an admin who turned a switch off for a project
- WHEN a run makes a write of that switch
- THEN the write waits for one click in Home / Inbox

#### Scenario: Allow kinds per workflow
- GIVEN a person with `project.settings` in the group Automation
- WHEN they allow some of `transition`, `labels`, `comment`, `push`, `open_pr` and `resolve_threads` for one workflow
- THEN only the runs of that workflow skip the approval question for those kinds
- AND a write that already waits keeps its question
- AND a permission applies to the writes that come later
- AND a push with force with lease gets no such permission

#### Scenario: Remove and save
- GIVEN a permission in `recipe_writes`
- WHEN the person removes a kind and clicks Save
- THEN the removal takes effect with Save
- AND a save of that group never adds a kind or a workflow to `recipe_writes`

### Requirement: REQ-026 Approvals

A write without its switch SHALL become an approval in Home / Inbox that names the exact write. One click SHALL send the write. A rejection of a tracker write (status, labels or comment) SHALL drop the write and log it, and the run SHALL go on. A rejection of a push or a pull request SHALL escalate the run (REQ-053). A push with force with lease SHALL always wait for approval, also when `push` is on (`delivery` REQ-015).

#### Scenario: Approve
- GIVEN a run that wants to push and `push` off
- WHEN the person clicks Approve in the Inbox
- THEN the push goes out once

#### Scenario: Reject
- GIVEN a run in `Working` and an approval of a ticket move
- WHEN the person rejects it
- THEN the move is dropped, the log holds the rejection, and the run stays in `Working`

#### Scenario: Rejected pull request
- GIVEN a run that waits for the approval of its pull request
- WHEN the person rejects it
- THEN the run moves to `Blocked` with the cause pull request rejected and posts one stop report

### Requirement: REQ-027 Runs view

Factory / Runs SHALL show five lanes, each with a count, and a History view. The view SHALL have one primary action. Each run that is not ended, and the latest failed run of a ticket, SHALL sit in the lane that REQ-038 gives. History SHALL list every ended run.

#### Scenario: Needs you lane
- GIVEN a run in `WaitingForAnswer`
- WHEN the person opens Runs
- THEN the run shows in the lane Needs you

#### Scenario: Empty lane
- GIVEN no run in Queued
- WHEN the person opens Runs
- THEN the lane shows the empty pattern, an icon with no ghost rows

#### Scenario: Ended run
- GIVEN a run in `Done`
- WHEN the person opens Runs
- THEN the board has no lane Done
- AND the run shows in History

#### Scenario: Failed run
- GIVEN the latest run of a ticket is in `Failed`
- WHEN the person opens Runs
- THEN the run shows in the lane Needs you with the action Start again
- AND the run shows in History

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

Factory / Agents map SHALL show a live graph of agents, tickets, files and refs. A node SHALL show the ticket key and title, the step name or the file name, never a raw ref. The raw ref SHALL be the tooltip of the node and the item Copy ref of its menu. A click on an agent node or a run node SHALL open the run page. A click on another node SHALL open its entity in the inspector.

#### Scenario: Live node
- GIVEN a running agent
- WHEN it reads a file
- THEN a link from the agent to the file shows

#### Scenario: Open entity
- GIVEN a ticket node
- WHEN the person clicks it
- THEN the inspector shows the ticket

#### Scenario: Open run
- GIVEN an agent node of a run
- WHEN the person clicks it
- THEN the run page opens on the Workflow tab at that step

#### Scenario: Plain label
- GIVEN a run node
- WHEN the map shows
- THEN the node shows the ticket key and title and no `run:` ref

### Requirement: REQ-031 Sessions view

Factory / Sessions SHALL list the agent sessions. Each row SHALL show runner, model, run, state and tokens. The view SHALL show no stat tiles. The list SHALL include the AI tool sessions of the run units (Active, Previous, start time), and a click on a row SHALL open the run page at the unit. The Agents switch (the global kill switch of REQ-024) SHALL stay as the header action of the view, and it SHALL stop every session.

#### Scenario: Session row
- GIVEN a live session
- WHEN the person opens Sessions
- THEN the row shows runner, model, run, state and tokens
- AND the view shows no stat tiles

#### Scenario: Run unit session
- GIVEN a run with a running unit and an ended unit that has a Claude Code session id
- WHEN the person opens Sessions and clicks the row of the ended unit
- THEN the unit shows under Previous and the run page opens at that unit
- AND Open in terminal runs `claude --resume` with that session in the folder of the unit
- AND Open in terminal is off for the running unit

#### Scenario: No session
- GIVEN no session
- WHEN the person opens Sessions
- THEN the empty pattern shows with an action that opens Runs

#### Scenario: Stop all
- GIVEN live sessions
- WHEN the person turns off the Agents switch in the header of Sessions
- THEN all sessions stop

#### Scenario: Run page units
- GIVEN a run with started units
- WHEN the person opens the run page
- THEN each started unit shows with Follow
- AND a Claude Code unit with a session id shows Open in terminal, which is off while the unit runs

#### Scenario: Totals row
- GIVEN two sessions
- WHEN the person opens Sessions
- THEN the last row of the table holds the totals of tokens and cost

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

A workflow SHALL hold a `limits` block with `stall_s`, an optional `budget_usd` and the optional caps `review_rounds` (default 4), `feedback_rounds` (default 3) and `fix_rounds` (default 8, assumption `q:Q-167`). With no `budget_usd`, the run SHALL have no budget of its own. A file that still holds `max_turns` SHALL load, and the system SHALL ignore the key (`adr:0025`). The system SHALL reject a limit that is not a positive number. A resume and an unblock SHALL read the current limits.

#### Scenario: Limits apply
- GIVEN a workflow with `limits: { budget_usd: 5, stall_s: 300 }`
- WHEN a run of that workflow starts
- THEN the run pauses at 5 USD and stalls after 300 s with no event

#### Scenario: No run budget
- GIVEN a workflow with `limits: { stall_s: 300 }`
- WHEN a run of that workflow spends money
- THEN the run shows its cost with no budget and does not pause for a run budget

#### Scenario: Default caps
- GIVEN a workflow with a `limits` block that has no cap
- WHEN a run of that workflow starts
- THEN its caps are 4 review rounds, 3 feedback rounds and 8 fix rounds

#### Scenario: Bad limit
- GIVEN a workflow with `budget_usd: -1` or `review_rounds: 0`
- WHEN the file loads
- THEN the schema check rejects it

### Requirement: REQ-036 SelfReview

After the build steps end, a run SHALL enter `SelfReview`. `SelfReview` SHALL follow `delivery` REQ-001 to REQ-004. The review rounds SHALL count for the whole run against `review_rounds` (REQ-054). A step `max_rounds` SHALL only lower that cap. The last round that the cap allows SHALL run its fix with the top model tier of the runner. An unblock after the rounds are spent SHALL start one more fix round with the findings and the message of the person.

#### Scenario: Clean review
- GIVEN a run in `SelfReview`
- WHEN the reviewer finds nothing
- THEN the run moves to `PROpen`

#### Scenario: Fix round
- GIVEN a run in `SelfReview` with round 1 spent
- WHEN the reviewer finds a defect
- THEN the run returns to `Working` in the same worktree for round 2

#### Scenario: Last round
- GIVEN a run with `review_rounds` 4 and three fix rounds spent, with fewer blocking findings at each round
- WHEN the reviewer finds a P1 defect
- THEN round 4 runs its fix with the top model tier of the runner

#### Scenario: Rounds spent
- GIVEN a run with four fix rounds spent and a P0 or P1 finding left
- WHEN the reviewer reports it
- THEN the run moves to `Blocked` with the cause review rounds spent and posts one stop report with the finding

#### Scenario: Rounds over feedback
- GIVEN a run that spent three review rounds before its pull request opened
- WHEN a feedback round reaches `SelfReview` with a P1 finding
- THEN one more review round runs, and the next blocking finding escalates

#### Scenario: Unblock after the rounds
- GIVEN a run in `Blocked` after its fix rounds are spent
- WHEN a person unblocks it with a message
- THEN the run returns to `Working` for one more fix round with the findings and the message

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

The lane Queued SHALL hold the states `Queued`, `Claimed` and `RetryQueued`. The lane Working SHALL hold `Planning`, `Working`, `SelfReview` and `ChangesRequested`. The lane Needs you SHALL hold `PlanReview`, `WaitingForAnswer`, `Blocked`, `Paused` and `Failed`. The lane Ready to merge SHALL hold a `PROpen` run with passing CI, no change request and no draft. The lane In review SHALL hold each other `PROpen` run. A run in `Merged`, `Done` or `Cancelled` SHALL sit in no lane: History lists it.

#### Scenario: Ready to merge
- GIVEN a run in `PROpen` with passing CI, no change request and no draft
- WHEN the person opens Runs
- THEN the run shows in the lane Ready to merge

#### Scenario: Draft
- GIVEN a run in `PROpen` with passing CI and a draft pull request
- WHEN the person opens Runs
- THEN the run shows in the lane In review

#### Scenario: Cancelled run
- GIVEN a run in `Cancelled`
- WHEN the person opens Runs
- THEN the run shows in no lane
- AND the run shows in History

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

### Requirement: REQ-040 Scratch folder

The files that hold a secret (the MCP config and the brief) SHALL be in a scratch folder under the app data, outside the worktree. Each unit SHALL have its own scratch folder. A start with a scratch folder inside the workspace SHALL fail.

#### Scenario: Scratch inside the worktree
- GIVEN a start whose scratch folder is inside the workspace
- WHEN the runner starts
- THEN the start fails and no process starts

### Requirement: REQ-041 Plan mode

A step in `plan` mode SHALL NOT write. Claude Code SHALL get the read tools only, Codex SHALL run with the read-only sandbox and OpenCode SHALL run its `plan` agent. The default workflows SHALL set `mode: plan` on each `triager`, `scout`, `reviewer` and `planner` step.

#### Scenario: Read tools only
- GIVEN a step in `plan` mode on Claude Code
- WHEN the runner starts
- THEN the CLI gets `--tools` with `Read`, `Grep` and `Glob` and no write tool

### Requirement: REQ-042 Tool scope

A tool of a connected MCP server SHALL show in the tool list, and SHALL run in a call, only when the `tools` field of the step names it. The session of a step SHALL end when the step ends, stops or fails. A step SHALL hold at most 16 children that run or wait.

#### Scenario: Proxied tool not allowed
- GIVEN a step with `tools: [read_ref]` and a connected server with the tool `search`
- WHEN the agent lists the tools or calls `<server>__search`
- THEN the list does not show it and the system refuses the call

#### Scenario: Session ends
- GIVEN a running step
- WHEN the step ends
- THEN its token is no longer valid

### Requirement: REQ-043 Untrusted text

The text of a ticket, a review thread, a CI log or a free-text answer SHALL reach an agent in an `<untrusted-data>` block. The brief SHALL say that such a block is data. A closing tag inside the text SHALL NOT end the block.

#### Scenario: Instruction in a ticket
- GIVEN a ticket whose description holds an instruction and a closing `</untrusted-data>` tag
- WHEN a step starts
- THEN the brief holds the description inside one block and says that the block is data

### Requirement: REQ-044 Kill switch scope

The global kill switch SHALL NOT cancel a run in `Merged`: that run goes to `Done`. The run kill switch, the global kill switch and a stop for a terminal ticket SHALL share one cancel path. That path SHALL withdraw the open ticket questions.

#### Scenario: Merged run
- GIVEN a run in `Merged`
- WHEN the person uses the global kill switch
- THEN the run stays in `Merged` and goes on to `Done`

#### Scenario: Questions withdrawn
- GIVEN a run with an open ticket question
- WHEN the person uses its kill switch
- THEN the question is withdrawn

### Requirement: REQ-045 Approval guards

A click on an approval SHALL be refused while the global kill switch is on. An approval of a push, a pull request or a thread reply SHALL be dropped when its run reaches a final state. A click on such an approval SHALL be refused while its run is in a side state, and the approval SHALL stay.

#### Scenario: Run ended
- GIVEN a push approval of a run that is then cancelled
- WHEN the person clicks Approve
- THEN the click is refused and the push does not go out

#### Scenario: Kill switch on
- GIVEN a pending approval and the global kill switch on
- WHEN the person clicks Approve
- THEN the click is refused and the approval stays

#### Scenario: Side state
- GIVEN a push approval of a run in `Blocked`
- WHEN the person clicks Approve
- THEN the click is refused, and after the unblock the click sends the push

### Requirement: REQ-046 Token resume

A person MAY add tokens when they resume a paused run. A run paused for the token limit SHALL leave `Paused` only when the limit, with the added tokens, is above the token count.

#### Scenario: Token pause
- GIVEN a run paused at its token limit
- WHEN the person resumes it with money only
- THEN the run stays in `Paused`, and with added tokens it goes back to `Working`

### Requirement: REQ-047 Request size

The HTTP transport SHALL read the request line and each header line within one size limit. A request above the limit SHALL get the answer 431.

#### Scenario: Request line with no end
- GIVEN the HTTP transport
- WHEN a caller sends more bytes than the limit with no line end
- THEN the system answers 431 and reads no more

### Requirement: REQ-048 Slow calls outside the lock

A call to a gate command, a tracker or a forge SHALL run with no lock of the factory. The factory SHALL decide and queue the call under its lock, run it outside the lock, and apply the result under the lock only when the run did not change in between. A view, an agent tool, the sync and the exit SHALL NOT wait for such a call.

#### Scenario: Slow gate
- GIVEN a gate command that runs for a long time
- WHEN a view asks for the runs meanwhile
- THEN the view gets its answer at once

#### Scenario: Run changed during the gate
- GIVEN a gate command that runs and a person who cancels the run
- WHEN the gate ends
- THEN the system drops its verdict

### Requirement: REQ-049 Index of the project

A project SHALL have its own ref index. `read_ref` of a run SHALL read the index of the project of that run. A query on a busy index SHALL NOT hold the lock of the factory.

#### Scenario: Two projects
- GIVEN two projects with different indexes
- WHEN an agent of the second project calls `read_ref` for an entity of the first
- THEN the answer is that the entity is broken

#### Scenario: Scan in progress
- GIVEN an index that a scan holds
- WHEN a run calls `read_ref` and a view asks for the runs
- THEN the view gets its answer while the call waits

### Requirement: REQ-050 One active run for each ticket

The system SHALL start at most one active run for each ticket of a project. The check and the creation of the run SHALL happen under one lock.

#### Scenario: Two starts at once
- GIVEN a click and a tick that start the same ticket at the same time
- WHEN both reach the factory
- THEN one run starts and the other start is refused

### Requirement: REQ-051 Start clean

At the start the system SHALL remove each scratch folder under the app data whose run is not live. When the run log file does not open, the factory SHALL run on one scratch log that the views read too, and the app SHALL tell the person why.

#### Scenario: Folder of an ended run
- GIVEN a scratch folder of a run that ended before a crash
- WHEN the app starts
- THEN the folder is gone

#### Scenario: Run log that does not open
- GIVEN a run log file that cannot open
- WHEN the app starts
- THEN the file stays as it was, the views read what the factory writes, and the command `run_log_degraded` gives the reason

### Requirement: REQ-052 Attempt breaker

The system SHALL count the failed attempts of each step for the whole run. A new round, a feedback round, a retry or a restart SHALL NOT reset the count. The third failed attempt of a step SHALL escalate the run (REQ-053), also when `retry` allows more. A stall, a runner error and a failed report SHALL count as a failed attempt. A failed guard (REQ-056) SHALL NOT count. An unblock SHALL give the step one more attempt.

#### Scenario: Failures across rounds
- GIVEN a step `build` with `retry` 5 that failed once in round 1 and once in round 2
- WHEN it fails in round 3
- THEN the run moves to `Blocked` with the cause attempts spent

#### Scenario: One more attempt
- GIVEN a run blocked by the breaker of the step `build`
- WHEN a person unblocks it
- THEN the step gets one attempt, and its next failure escalates again

### Requirement: REQ-053 Escalation

When a person must act, the run SHALL escalate. It SHALL stop its agents, keep its worktree, enter `Blocked` (or stay in `Paused` for a budget) and spend nothing more. The run SHALL keep one escalation record: the cause, the last findings or error lines (10 at most), what the run tried, and the action. The run SHALL post its stop report (REQ-058) and show one notice in the lane Needs you and the Inbox. The ticket SHALL get the labels of the state mapping.

#### Scenario: Escalate
- GIVEN a run in `Working` with two agents that run
- WHEN the run escalates with the cause attempts spent
- THEN both agents stop, the clocks stop, and the run shows one notice in Needs you with the cause and the action

#### Scenario: Label
- GIVEN the default state mapping and `tracker_transition` on
- WHEN a run escalates to `Blocked`
- THEN the ticket gets the label `shipyard:blocked`

### Requirement: REQ-054 Run caps

The system SHALL count the review rounds, the feedback rounds and the fix rounds for the whole run, against `review_rounds`, `feedback_rounds` and `fix_rounds` (REQ-035). A fix round is each return to `Working` to fix a finding, a red gate, a conflict, an empty branch or feedback. No round and no retry SHALL reset a count. A round above a cap SHALL escalate. An unblock SHALL allow one more round of the spent cap. Only a change of the `limits` block SHALL raise a cap.

#### Scenario: Fix rounds spent
- GIVEN a run with `fix_rounds` 8 and eight fix rounds spent
- WHEN a new CI failure asks for a fix
- THEN the run moves to `Blocked` with the cause fix rounds spent

#### Scenario: Raised cap
- GIVEN a run blocked with the cause fix rounds spent
- WHEN a person sets `fix_rounds: 12` in the workflow and unblocks the run
- THEN the run can spend four more fix rounds

### Requirement: REQ-055 Same failure

After each round and each failed attempt, the system SHALL compute a fingerprint of the blocking findings, the gate errors or the runner error, and SHALL log it. Line numbers, times, ids and the order of the items SHALL NOT change the fingerprint. Two equal fingerprints in a row SHALL escalate the run at once with the cause same failure. When a round leaves no fewer blocking findings than the round before, the run SHALL escalate with the cause no progress.

#### Scenario: Same finding twice
- GIVEN a fix round that ended with the P1 finding "unchecked unwrap in src/a.rs" at line 10
- WHEN the next review reports the same finding at line 12
- THEN the run moves to `Blocked` with the cause same failure, and the caps are not spent

#### Scenario: No progress
- GIVEN a round that left two blocking findings
- WHEN the next round leaves two other blocking findings
- THEN the run moves to `Blocked` with the cause no progress

### Requirement: REQ-056 Guards

Before each attempt, the system SHALL check that the project is open, that the workspace exists, and that the AI tool and the connections of the step are set up. A start error of the workspace or the AI tool SHALL be a failed guard. A failed guard SHALL move the run to `RetryQueued` with the delays of REQ-007, and SHALL NOT count as a retry or a failed attempt.

#### Scenario: Tool missing
- GIVEN a step that needs Claude Code and Claude Code is not installed
- WHEN the attempt is due
- THEN the run moves to `RetryQueued` and its retries and failed attempts stay the same

#### Scenario: Guard escalates
- GIVEN a run whose guard fails for the same cause for 30 min
- WHEN the next retry fails the guard
- THEN the run moves to `Blocked` with the cause and posts one stop report

#### Scenario: Causes that change
- GIVEN a run whose guard fails for 30 min with two causes that take turns
- WHEN the next retry fails the guard
- THEN the run moves to `Blocked` with the last cause and posts one stop report

#### Scenario: Guards escalate after 30 min
- GIVEN a run whose guards fail for 30 min, with one cause or with causes that change
- WHEN the next retry fails a guard
- THEN the run escalates
- AND it does not escalate when the project is not open (`sync` REQ-020)

### Requirement: REQ-057 Fixer round

A child conflict after its new run, a rebase conflict and a run branch with no change SHALL each start one fixer round with no click. The fixer SHALL be one builder step in the run worktree, not in a child worktree, with a note that names the cause and the files. The review and the pull request step SHALL then run again. The fixer round SHALL count against `fix_rounds` (REQ-054). The same cause after the fixer round SHALL escalate (REQ-053).

#### Scenario: Fixer for a rebase conflict
- GIVEN a pull request step whose rebase onto the base conflicts in `src/a.rs`
- WHEN the conflict is found
- THEN a builder step starts in the run worktree with a note that names `src/a.rs`, with no click

#### Scenario: Same cause again
- GIVEN a fixer round for a rebase conflict that ended
- WHEN the rebase conflicts again
- THEN the run moves to `Blocked` with the cause rebase conflict and the files

### Requirement: REQ-058 Stop report

Each escalation and each end by a decision of a person SHALL be reported once, with the key run, cause and attempt. The report SHALL be one ticket comment with the marker `<!-- shipyard:stop <run> -->` when the tracker takes comments and `tracker_comment` is on; else the notice only, and no approval. It SHALL follow `delivery` REQ-031.

#### Scenario: One comment
- GIVEN `tracker_comment` on and a tracker with comments
- WHEN a run escalates with the cause review rounds spent
- THEN the ticket gets one comment with the marker, the cause, the last findings, the four rounds tried and the action

#### Scenario: Switch off
- GIVEN `tracker_comment` off
- WHEN a run escalates
- THEN no comment and no approval go out, and the notice shows in Needs you

#### Scenario: Restart
- GIVEN a stop report that went out, and the app stopped before it saved the run
- WHEN the app restarts and the run is still blocked for the same cause and attempt
- THEN no second comment goes out

#### Scenario: Comment content
- GIVEN a stop report that goes out as a ticket comment
- WHEN the comment is written
- THEN it gives the cause, the last lines, what the run tried and the action: reply on the ticket or use Unblock with a message
- AND a last line with the shape of a secret is replaced by a note

### Requirement: REQ-059 Attempt fencing

Each attempt of a unit SHALL have its own id. The step token of REQ-037 SHALL name the attempt. The system SHALL ignore and log a tool call, a report or a result of an attempt that is not the current attempt of its unit. Such a late result SHALL NOT change the state, the counts or the outputs of the run.

#### Scenario: Late report
- GIVEN attempt 1 of the step `build` stalled and attempt 2 runs
- WHEN attempt 1 sends `report` with the outcome done
- THEN the report is ignored, the log names attempt 1, and the step waits for attempt 2

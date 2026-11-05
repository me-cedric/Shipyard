Feature: factory

  @spec:factory#REQ-001
  Scenario: Main path: Forward path
    Given a run in `Queued` and a claim that succeeds
    When the engine starts it
    Then the run moves to `Claimed`, then `Planning`, and each move is in the run log

  @spec:factory#REQ-001
  Scenario: Main path: Refused transition
    Given a run in `Working`
    When a caller asks for `Merged`
    Then the run stays in `Working` and the log holds the refusal

  @spec:factory#REQ-001
  Scenario: Main path: No pull request step
    Given a run of the workflow `spike` in `Working`
    When its last step ends
    Then the run moves to `Done`

  @spec:factory#REQ-002
  Scenario: Return transitions: CI failure
    Given a run in `PROpen`
    When the pull request CI fails
    Then the run moves to `ChangesRequested`, then to `Working` in the same worktree

  @spec:factory#REQ-002
  Scenario: Return transitions: Merge during a fix
    Given a run in `Working` for a fix round of an open pull request
    When the pull request merges
    Then the agents stop, the run moves to `Merged` and then to `Done`, and a push that waits for a click is dropped

  @spec:factory#REQ-002
  Scenario: Return transitions: Plan rejected
    Given a run in `PlanReview`
    When the person rejects the plan with a comment
    Then the run returns to `Planning` with the comment in context

  @spec:factory#REQ-003
  Scenario: PlanReview gate: Gate on
    Given a workflow with the gate `human` on the plan step
    When the plan is ready
    Then the run waits in `PlanReview` and an approval shows in the Inbox

  @spec:factory#REQ-003
  Scenario: PlanReview gate: Gate off
    Given a workflow with no gate on the plan step
    When the plan is ready
    Then the run moves to `Working` and no approval shows

  @spec:factory#REQ-004
  Scenario: Side states: Question and budget
    Given a run in `Working`
    When the agent calls `ask_question`, or a hard budget stop applies
    Then the run moves to `WaitingForAnswer`, or to `Paused`

  @spec:factory#REQ-004
  Scenario: Side states: Failed step
    Given a run in `Working` with retries left
    When the step fails
    Then the run moves to `RetryQueued`

  @spec:factory#REQ-004
  Scenario: Side states: Rejected approval
    Given a run that waits for an approval
    When the person rejects it
    Then the run moves to `Blocked` and the log holds the reason

  @spec:factory#REQ-005
  Scenario: Return state: Return after wait
    Given a run in `Working` that enters `WaitingForAnswer`
    When the answer arrives
    Then the run returns to `Working`

  @spec:factory#REQ-005
  Scenario: Return state: Final state
    Given a run in `Failed`
    When a caller asks for any transition
    Then the run stays in `Failed`

  @spec:factory#REQ-005
  Scenario: Return state: Leave Paused
    Given a run in `Paused` after a hard budget stop
    When a person raises the budget and resumes the run
    Then the run returns to its stored state

  @spec:factory#REQ-005
  Scenario: Return state: Resume without budget
    Given a run in `Paused` with no budget left
    When a person resumes the run
    Then the run stays in `Paused`

  @spec:factory#REQ-006
  Scenario: Waiting pauses the clocks: Long wait
    Given a run with a stall timeout of 300 s in `WaitingForAnswer` for one hour
    When the answer arrives
    Then the run does not stall and no budget is spent for the hour

  @spec:factory#REQ-007
  Scenario: Retry backoff: Backoff steps
    Given a step that fails four times
    When the engine queues each retry
    Then the delays are 10 s, 20 s, 40 s and 80 s

  @spec:factory#REQ-007
  Scenario: Retry backoff: Backoff cap
    Given a step at retry number 7
    When the engine queues the retry
    Then the delay is 5 min

  @spec:factory#REQ-008
  Scenario: State to issue tracker mapping: Mapped status
    Given a mapping of `WaitingForAnswer` to the status `Needs info`
    When a run enters that state and the switch is on
    Then the ticket moves to `Needs info` with the mapped labels

  @spec:factory#REQ-008
  Scenario: State to issue tracker mapping: Missing row
    Given a mapping file without a row for a state
    When the file loads
    Then the state keeps its default row

  @spec:factory#REQ-008
  Scenario: State to issue tracker mapping: Invalid mapping
    Given a mapping file with a row for a name that is not a run state
    When the file loads
    Then the system shows an error and keeps the last valid mapping

  @spec:factory#REQ-009
  Scenario: Pickup and terminal tickets: Terminal ticket
    Given an active run
    When `add-sync` REQ-004 stops the run for a done ticket
    Then the run moves to `Cancelled` and its agent session stops

  @spec:factory#REQ-009
  Scenario: Pickup and terminal tickets: Workflow choice
    Given a claimed ticket with the label `wf:bug`
    When the engine creates the run
    Then the run uses the workflow `bug`, and a ticket with no such label uses the project default

  @spec:factory#REQ-009
  Scenario: Pickup and terminal tickets: No claim
    Given a ticket without a claim
    When the engine looks for work
    Then it creates no run

  @spec:factory#REQ-010
  Scenario: Workflow files: Hot reload
    Given a valid workflow
    When a person saves a valid change
    Then the next run uses the new version

  @spec:factory#REQ-010
  Scenario: Workflow files: Broken file
    Given a valid workflow
    When a person saves an invalid change
    Then the view shows the error and runs keep the last valid version

  @spec:factory#REQ-011
  Scenario: Default workflows: Defaults present
    Given a new project
    When a person opens Factory / Workflows
    Then the five workflows show and each one validates

  @spec:factory#REQ-012
  Scenario: Step fields: Needs order
    Given a step with `needs: [plan]`
    When the run starts
    Then the step starts only after `plan` ends

  @spec:factory#REQ-012
  Scenario: Step fields: Cycle
    Given two steps that need each other
    When the file loads
    Then the schema check rejects it and names both steps

  @spec:factory#REQ-013
  Scenario: Fan-out: Parallel limit
    Given a `for_each` over five items with `max_parallel` 2
    When the step runs
    Then two children run, the others wait, and each child has its own worktree

  @spec:factory#REQ-013
  Scenario: Fan-out: Collect
    Given all children ended
    When the last child ends
    Then the parent step holds the five outputs

  @spec:factory#REQ-013
  Scenario: Fan-out: Conflict
    Given two children that change the same line
    When the second child joins
    Then the run blocks, the event names the child and the file, and the run folder holds the first child only

  @spec:factory#REQ-013
  Scenario: Fan-out: Join
    Given three children that ended with a change each
    When the last child ends
    Then the system merges the three children into the run folder in child order
    And the three child worktrees are gone

  @spec:factory#REQ-013
  Scenario: Fan-out: Join conflict
    Given the change of the second child conflicts with the first
    When the last child ends
    Then the run moves to `Blocked` and the event names the second child and its files
    And the child worktrees stay until a person clicks and the join succeeds

  @spec:factory#REQ-014
  Scenario: Roles: Project role
    Given a file `.shipyard/roles/security.md`
    When a step names the role `security`
    Then the step runs with that profile

  @spec:factory#REQ-014
  Scenario: Roles: Unknown role
    Given a step names a role with no file
    When the file loads
    Then the schema check reports the missing role

  @spec:factory#REQ-015
  Scenario: Runners: Streamed events
    Given a step with a Claude Code runner
    When the agent works
    Then each streamed event appears in the run log in order

  @spec:factory#REQ-015
  Scenario: Runners: Secret
    Given a provider with a key in the keychain
    When a runner starts
    Then no argument and no log line holds the key

  @spec:factory#REQ-016
  Scenario: Agent tools: Invalid input
    Given an agent in a step
    When it calls a tool with a missing input
    Then the system returns an error to the agent and writes no event

  @spec:factory#REQ-016
  Scenario: Agent tools: Tool not allowed
    Given a step with `tools: [read_ref]`
    When the agent calls `report`
    Then the system refuses the call

  @spec:factory#REQ-016
  Scenario: Agent tools: Too many calls
    Given a step that has used its calls of the minute
    When the agent calls a tool again
    Then the system returns an error with the wait time and writes no event

  @spec:factory#REQ-017
  Scenario: ask_question tool: Valid question
    Given an agent in `Working`
    When it calls `ask_question` with three options
    Then the run moves to `WaitingForAnswer` and the question reaches the questions loop

  @spec:factory#REQ-017
  Scenario: ask_question tool: One option
    Given an agent
    When it calls `ask_question` with one option
    Then the system rejects the call

  @spec:factory#REQ-018
  Scenario: post_progress and report tools: Progress
    Given an agent in a step
    When it calls `post_progress`
    Then the text shows in the event tail

  @spec:factory#REQ-018
  Scenario: post_progress and report tools: Report
    Given an agent in a step
    When it calls `report` with the outcome `done`
    Then the step ends and its output goes to the steps that need it

  @spec:factory#REQ-019
  Scenario: handoff, message and spawn_subtask tools: Subtask
    Given a step with `max_parallel` 2 and two children running
    When an agent calls `spawn_subtask`
    Then the call returns an error that says the step runs 2 of 2 children, and no child starts

  @spec:factory#REQ-019
  Scenario: handoff, message and spawn_subtask tools: Subtask with a free slot
    Given a `for_each` step with a worktree workspace and one child running
    When an agent calls `spawn_subtask`
    Then a new child of the same step starts in its own worktree, and the step waits for it before the join

  @spec:factory#REQ-019
  Scenario: handoff, message and spawn_subtask tools: Subtask outside a fan-out
    Given a step with no `for_each`, or a step whose workspace is not `worktree`
    When an agent calls `spawn_subtask`
    Then the call returns an error and no child starts

  @spec:factory#REQ-019
  Scenario: handoff, message and spawn_subtask tools: Subtask over the budget
    Given a run at 80 % of its budget
    When an agent calls `spawn_subtask`
    Then the call returns an error and no child starts

  @spec:factory#REQ-019
  Scenario: handoff, message and spawn_subtask tools: Handoff
    Given a builder child and a reviewer step that has not started
    When the builder calls `handoff` with the role `reviewer` and a summary
    Then the builder ends, and the reviewer brief holds the summary

  @spec:factory#REQ-019
  Scenario: handoff, message and spawn_subtask tools: Message to a running step
    Given two children that run
    When one calls `message` for the other
    Then the other stops after its turn and starts again on its CLI session with the text

  @spec:factory#REQ-019
  Scenario: handoff, message and spawn_subtask tools: Message to person
    Given an agent in a step
    When it calls `message` for the person
    Then the text shows in Home / Inbox and the run does not wait

  @spec:factory#REQ-020
  Scenario: read_ticket and read_ref tools: Read a ref
    Given a ref `adr:0005`
    When an agent calls `read_ref`
    Then it receives the text of the ADR

  @spec:factory#REQ-020
  Scenario: read_ticket and read_ref tools: Unresolved ref
    Given a ref that no entity holds
    When an agent calls `read_ref`
    Then it receives an error

  @spec:factory#REQ-021
  Scenario: Run log: Append only
    Given a run log with ten events
    When any caller tries to change or delete event three
    Then the system refuses and the log still holds the ten events, with event three as it was

  @spec:factory#REQ-021
  Scenario: Run log: Same source
    Given a run with progress events
    When the UI and the ticket summary render
    Then both show the same events

  @spec:factory#REQ-022
  Scenario: Budgets: Alert
    Given a run with a budget of 5 USD
    When it spends 4 USD
    Then one alert shows in the Inbox

  @spec:factory#REQ-022
  Scenario: Budgets: Hard stop
    Given a run with a budget of 5 USD
    When it spends 5 USD
    Then the run moves to `Paused` and stops its agents

  @spec:factory#REQ-022
  Scenario: Budgets: No run budget
    Given a run of a workflow with no `budget_usd`
    When it spends 50 USD and no day, member or token budget is spent
    Then the run does not pause and no alert shows

  @spec:factory#REQ-023
  Scenario: Stall timeout and max turns: Stall
    Given a step with `stall_s` 300
    When no event arrives for 300 s
    Then the step stops and the run moves to `RetryQueued`

  @spec:factory#REQ-023
  Scenario: Stall timeout and max turns: Max turns
    Given a run with `max_turns` 40
    When the agent reaches turn 40
    Then the run moves to `Paused` with the reason max turns, and a resume gives it 40 more turns

  @spec:factory#REQ-024
  Scenario: Kill switches: Run switch
    Given an active run
    When the person uses its kill switch
    Then its agents stop and it moves to `Cancelled`

  @spec:factory#REQ-024
  Scenario: Kill switches: Global switch
    Given three active runs
    When the person uses the global kill switch
    Then all three move to `Cancelled` and no new run starts

  @spec:factory#REQ-025
  Scenario: Write switches: Default on
    Given a new project
    When a person reads the switches
    Then all four are on

  @spec:factory#REQ-025
  Scenario: Write switches: Admin turns off
    Given a project admin in Settings
    When they turn off `push`
    Then the next push of a run waits as an approval in Home / Inbox

  @spec:factory#REQ-025
  Scenario: Write switches: Force with lease
    Given `push` on and a push that rewrites history
    When the run sends it
    Then the push waits as an approval in Home / Inbox

  @spec:factory#REQ-026
  Scenario: Approvals: Approve
    Given a run that wants to push and `push` off
    When the person clicks Approve in the Inbox
    Then the push goes out once

  @spec:factory#REQ-026
  Scenario: Approvals: Reject
    Given a pending approval
    When the person rejects it
    Then the write does not go out and the run moves to `Blocked`

  @spec:factory#REQ-027
  Scenario: Runs view: Needs you lane
    Given a run in `WaitingForAnswer`
    When the person opens Runs
    Then the run shows in the lane Needs you

  @spec:factory#REQ-027
  Scenario: Runs view: Empty lane
    Given no run in Done
    When the person opens Runs
    Then the lane shows ghost rows

  @spec:factory#REQ-028
  Scenario: Run view: Live step
    Given a running step
    When an event arrives
    Then the DAG node and the event tail update

  @spec:factory#REQ-028
  Scenario: Run view: Diff
    Given a run with a worktree
    When the person opens the diff
    Then the changed files show

  @spec:factory#REQ-029
  Scenario: Workflows view: Edit
    Given a workflow
    When the person saves a valid edit in the view
    Then the file in `.shipyard/workflows/` changes

  @spec:factory#REQ-029
  Scenario: Workflows view: Error
    Given an invalid edit
    When the person saves
    Then the view shows the error and the line

  @spec:factory#REQ-030
  Scenario: Agents map: Live node
    Given a running agent
    When it reads a file
    Then a link from the agent to the file shows

  @spec:factory#REQ-030
  Scenario: Agents map: Open entity
    Given a ticket node
    When the person clicks it
    Then the inspector shows the ticket

  @spec:factory#REQ-031
  Scenario: Sessions view: Session row
    Given a live session
    When the person opens Sessions
    Then the row shows runner, model, run, state and tokens

  @spec:factory#REQ-031
  Scenario: Sessions view: Stop all
    Given live sessions
    When the person uses the global kill switch
    Then all sessions stop

  @spec:factory#REQ-032
  Scenario: Usage view: Per member
    Given two members with runs
    When the person opens Usage
    Then the view shows the spend of each member against its budget

  @spec:factory#REQ-032
  Scenario: Usage view: Set budget
    Given an admin
    When they set a daily budget
    Then the next run checks that budget

  @spec:factory#REQ-033
  Scenario: Interface rules: Keyboard
    Given any Factory view
    When the person uses only the keyboard
    Then they reach every action and see the focus ring

  @spec:factory#REQ-033
  Scenario: Interface rules: Reduced motion
    Given reduced motion is on
    When a run step changes state
    Then the view shows the change with no animation

  @spec:factory#REQ-034
  Scenario: Entities: Backlinks
    Given a run for `wi:SHIP-42`
    When the person opens the ticket in the inspector
    Then the run shows in its backlinks

  @spec:factory#REQ-035
  Scenario: Workflow limits: Limits apply
    Given a workflow with `limits: { max_turns: 40, budget_usd: 5, stall_s: 300 }`
    When a run of that workflow starts
    Then the run pauses at turn 40, pauses at 5 USD and stalls after 300 s with no event

  @spec:factory#REQ-035
  Scenario: Workflow limits: No run budget
    Given a workflow with `limits: { stall_s: 300 }`
    When a run of that workflow spends money
    Then the run shows its cost with no budget and does not pause for a run budget

  @spec:factory#REQ-035
  Scenario: Workflow limits: Bad limit
    Given a workflow with `budget_usd: -1`
    When the file loads
    Then the schema check rejects it

  @spec:factory#REQ-036
  Scenario: SelfReview: Clean review
    Given a run in `SelfReview`
    When the reviewer finds nothing
    Then the run moves to `PROpen`

  @spec:factory#REQ-036
  Scenario: SelfReview: Fix round
    Given a run in `SelfReview` with round 1 spent
    When the reviewer finds a defect
    Then the run returns to `Working` in the same worktree for round 2

  @spec:factory#REQ-036
  Scenario: SelfReview: Rounds spent
    Given a run with two fix rounds spent and a P0 or P1 finding left
    When the reviewer reports it
    Then the run moves to `Blocked` and Home / Inbox shows a card with the finding

  @spec:factory#REQ-036
  Scenario: SelfReview: Fresh context
    Given a run in `SelfReview`
    When the reviewer session starts
    Then it holds no context of the build sessions

  @spec:factory#REQ-037
  Scenario: Tool transports: Same tools
    Given one session on stdio and one on HTTP
    When each lists its tools
    Then both list the same eight tools

  @spec:factory#REQ-037
  Scenario: Tool transports: Remote caller
    Given the HTTP transport
    When a caller from another machine connects
    Then the system refuses the call

  @spec:factory#REQ-037
  Scenario: Tool transports: No token
    Given the HTTP transport
    When a local caller sends a call with no valid token
    Then the system answers 401 and runs no tool

  @spec:factory#REQ-037
  Scenario: Tool transports: Agent without HTTP entries
    Given a runner whose CLI reads no HTTP MCP entry
    When a step starts it
    Then the MCP file starts `shipyard --mcp-bridge`, the URL and the token are in the file, and no argument holds the token

  @spec:factory#REQ-037
  Scenario: Tool transports: App closed
    Given the bridge runs and the app is closed
    When the agent calls a tool
    Then the bridge answers with an error that says the app is not running

  @spec:factory#REQ-038
  Scenario: Run lanes: Ready to merge
    Given a run in `PROpen` with passing CI, no change request and no draft
    When the person opens Runs
    Then the run shows in the lane Ready to merge

  @spec:factory#REQ-038
  Scenario: Run lanes: Draft
    Given a run in `PROpen` with passing CI and a draft pull request
    When the person opens Runs
    Then the run shows in the lane In review

  @spec:factory#REQ-039
  Scenario: Restart: Resume a step
    Given a run in `Working` with an agent that has a CLI session
    When the app restarts
    Then the run is in `Working` with its cost and tokens, and the next pump starts the agent again on that session

  @spec:factory#REQ-039
  Scenario: Restart: Approvals and questions
    Given an approval that waits and a question that is open
    When the app restarts
    Then the approval keeps its id and one click sends it, and the answer of the question resumes the run

  @spec:factory#REQ-039
  Scenario: Restart: Write before the crash
    Given a question comment that went out and the app stopped before it saved the run
    When the app restarts and the agent asks the same question
    Then no second comment goes out

  @spec:factory#REQ-039
  Scenario: Restart: Write with no result
    Given the log shows the intent of a comment and no result
    When the app restarts and the same comment is due
    Then it is not sent, because it may have gone out, and a note says so

  @spec:factory#REQ-039
  Scenario: Restart: Run with no save
    Given a run in the log that has no save and no end
    When the app restarts
    Then the system names the run and does not guess its state

  @spec:factory#REQ-039
  Scenario: Restart: Kill switch
    Given the global kill switch is on
    When the app restarts
    Then the kill switch is still on

  @spec:factory#REQ-040
  Scenario: Scratch folder: Scratch inside the worktree
    Given a start whose scratch folder is inside the workspace
    When the runner starts
    Then the start fails and no process starts

  @spec:factory#REQ-041
  Scenario: Plan mode: Read tools only
    Given a step in `plan` mode on Claude Code
    When the runner starts
    Then the CLI gets `--tools` with `Read`, `Grep` and `Glob` and no write tool

  @spec:factory#REQ-042
  Scenario: Tool scope: Proxied tool not allowed
    Given a step with `tools: [read_ref]` and a connected server with the tool `search`
    When the agent lists the tools or calls `<server>__search`
    Then the list does not show it and the system refuses the call

  @spec:factory#REQ-042
  Scenario: Tool scope: Session ends
    Given a running step
    When the step ends
    Then its token is no longer valid

  @spec:factory#REQ-043
  Scenario: Untrusted text: Instruction in a ticket
    Given a ticket whose description holds an instruction and a closing `</untrusted-data>` tag
    When a step starts
    Then the brief holds the description inside one block and says that the block is data

  @spec:factory#REQ-044
  Scenario: Kill switch scope: Merged run
    Given a run in `Merged`
    When the person uses the global kill switch
    Then the run stays in `Merged` and goes on to `Done`

  @spec:factory#REQ-044
  Scenario: Kill switch scope: Questions withdrawn
    Given a run with an open ticket question
    When the person uses its kill switch
    Then the question is withdrawn

  @spec:factory#REQ-045
  Scenario: Approval guards: Run ended
    Given a push approval of a run that is then cancelled
    When the person clicks Approve
    Then the click is refused and the push does not go out

  @spec:factory#REQ-045
  Scenario: Approval guards: Kill switch on
    Given a pending approval and the global kill switch on
    When the person clicks Approve
    Then the click is refused and the approval stays

  @spec:factory#REQ-045
  Scenario: Approval guards: Side state
    Given a push approval of a run in `Blocked`
    When the person clicks Approve
    Then the click is refused, and after the unblock the click sends the push

  @spec:factory#REQ-046
  Scenario: Token resume: Token pause
    Given a run paused at its token limit
    When the person resumes it with money only
    Then the run stays in `Paused`, and with added tokens it goes back to `Working`

  @spec:factory#REQ-047
  Scenario: Request size: Request line with no end
    Given the HTTP transport
    When a caller sends more bytes than the limit with no line end
    Then the system answers 431 and reads no more

  @spec:factory#REQ-048
  Scenario: Slow calls outside the lock: Slow gate
    Given a gate command that runs for a long time
    When a view asks for the runs meanwhile
    Then the view gets its answer at once

  @spec:factory#REQ-048
  Scenario: Slow calls outside the lock: Run changed during the gate
    Given a gate command that runs and a person who cancels the run
    When the gate ends
    Then the system drops its verdict

  @spec:factory#REQ-049
  Scenario: Index of the project: Two projects
    Given two projects with different indexes
    When an agent of the second project calls `read_ref` for an entity of the first
    Then the answer is that the entity is broken

  @spec:factory#REQ-049
  Scenario: Index of the project: Scan in progress
    Given an index that a scan holds
    When a run calls `read_ref` and a view asks for the runs
    Then the view gets its answer while the call waits

  @spec:factory#REQ-050
  Scenario: One active run for each ticket: Two starts at once
    Given a click and a tick that start the same ticket at the same time
    When both reach the factory
    Then one run starts and the other start is refused

  @spec:factory#REQ-051
  Scenario: Start clean: Folder of an ended run
    Given a scratch folder of a run that ended before a crash
    When the app starts
    Then the folder is gone

  @spec:factory#REQ-051
  Scenario: Start clean: Run log that does not open
    Given a run log file that cannot open
    When the app starts
    Then the file stays as it was, the views read what the factory writes, and the command `run_log_degraded` gives the reason

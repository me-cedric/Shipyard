# Spec: factory (delta of update-run-resilience)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:update-run-resilience`

### Goal

A run never stays stuck and never loops. The run fixes what it can by itself, inside caps that the code keeps. When a person must act, the run stops its agents, writes why on the ticket once, and waits for one reply or one click.

### Why

An audit of the engine (2026-11-06) found that many causes move a run to `Blocked` with no report on the ticket. The review round cap and the retry counters start again at each round. The engine does not see the same failure again. A run can wait with no end: a merge in a side state, a shared budget, a start error.

### Users And Scenarios

- Developer: a review finding or a red gate gets a fix with no click. A run that cannot go on tells why on the ticket, and a reply on the ticket gives it one more round.
- PM: sees each run that needs a person in the lane Needs you with one cause. No run spends money in a loop.
- Tech lead: raises a cap of a workflow in its `limits` block.
- PO: reads on the ticket why a run stopped and what to do.

### Requirements

- REQ-002: A merge in any state that is not final moves the run to `Merged`, then `Done`.
- REQ-004: `Blocked` means that a person must act, and follows an escalation only. No new run enters `Failed`.
- REQ-005: An escalated wait or retry keeps its return state. A day budget pause leaves by itself.
- REQ-007: Spent retries escalate. A failed guard uses the backoff and is no retry.
- REQ-013: A second child conflict starts a fixer round.
- REQ-022: A day budget pause resumes the next day. A run or member budget pause escalates.
- REQ-023: A pause at max turns escalates. A stall is a failed attempt.
- REQ-026: A rejected tracker write is skipped. A rejected push or pull request escalates.
- REQ-035: The `limits` block holds the caps `review_rounds`, `feedback_rounds` and `fix_rounds`.
- REQ-036: Review rounds count for the whole run, default 4. The last round uses the top model tier.
- REQ-052: Attempt breaker: the third failed attempt of a step escalates.
- REQ-053: Escalation: agents stop, one record, one report, one notice, the label `shipyard:blocked`.
- REQ-054: Run caps that no round and no retry resets.
- REQ-055: Same failure twice in a row, or no fewer blocking findings, escalates.
- REQ-056: Guards before each attempt.
- REQ-057: Fixer round for a conflict or an empty branch.
- REQ-058: Stop report, once.
- REQ-059: Attempt fencing.

### Non-Goals

- A new run state. The run states stay sixteen (`adr:0022`).
- A cap over several runs of one ticket. `sync` REQ-018 stops the restart loop.
- An automatic merge, an automatic plan approval or an automatic answer to a question.
- A change of the gate commands or of the review axes.

### Acceptance Criteria

- [ ] A run with a P1 finding that comes again with the same fingerprint escalates after the second round, not after the fourth.
- [ ] A step that fails once in each of three rounds escalates at its third failure.
- [ ] An escalated run posts one ticket comment with the marker, and a restart posts no second one.
- [ ] A late report of an old attempt does not change the run.
- [ ] A run that waits in `RetryQueued` because the AI tool is missing does not use its retries.

### Existing References

- Existing code/docs/specs: `crates/shipyard-core/src/run.rs`, `docs/diagrams/run-state-machine.mmd`, `adr:0022`.
- Supersedes or extends: `spec:factory`. Questions: Q-025 (in part), Q-166, Q-167.

## MODIFIED Requirements

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

### Requirement: REQ-023 Stall timeout and max turns

The system SHALL stop a step that sends no event for the stall timeout, and SHALL count that step as a failed attempt (REQ-052). When the workflow sets `max_turns`, the system SHALL stop a run at its max turns, move it to `Paused` and escalate (REQ-053). A resume SHALL give the run one more set of max turns.

#### Scenario: Stall
- GIVEN a step with `stall_s` 300
- WHEN no event arrives for 300 s
- THEN the step stops, its failed attempts go up by one, and the run moves to `RetryQueued`

#### Scenario: Max turns
- GIVEN a run with `max_turns` 40
- WHEN the agent reaches turn 40
- THEN the run moves to `Paused` with the cause max turns and posts one stop report, and a resume gives it 40 more turns

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

### Requirement: REQ-035 Workflow limits

A workflow SHALL hold a `limits` block with `stall_s`, an optional `budget_usd`, an optional `max_turns` and the optional caps `review_rounds` (default 4), `feedback_rounds` (default 3) and `fix_rounds` (default 8, assumption `q:Q-167`). With no `budget_usd`, the run SHALL have no budget of its own. With no `max_turns`, the turns SHALL have no limit. The system SHALL reject a limit that is not a positive number. A resume and an unblock SHALL read the current limits.

#### Scenario: Limits apply
- GIVEN a workflow with `limits: { max_turns: 40, budget_usd: 5, stall_s: 300 }`
- WHEN a run of that workflow starts
- THEN the run pauses at turn 40, pauses at 5 USD and stalls after 300 s with no event

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

## ADDED Requirements

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

When a person must act, the run SHALL escalate. It SHALL stop its agents, keep its worktree, enter `Blocked` (or stay in `Paused` for a budget or max turns) and spend nothing more. The run SHALL keep one escalation record: the cause, the last findings or error lines (10 at most), what the run tried, and the action. The run SHALL post its stop report (REQ-058) and show one notice in the lane Needs you and the Inbox. The ticket SHALL get the labels of the state mapping.

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

Before each attempt, the system SHALL check that the project is open, that the workspace exists, and that the AI tool and the connections of the step are set up. A start error of the workspace or the AI tool SHALL be a failed guard. A failed guard SHALL move the run to `RetryQueued` with the delays of REQ-007, and SHALL NOT count as a retry or a failed attempt. After 30 min of failed guards, with one cause or with causes that change, the run SHALL escalate, except when the project is not open (`sync` REQ-020).

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

Each escalation and each end by a decision of a person SHALL be reported once, with the key run, cause and attempt. The report SHALL be one ticket comment with the marker `<!-- shipyard:stop <run> -->` when the tracker takes comments and `tracker_comment` is on; else the notice only, and no approval. The comment SHALL give the cause, the last lines, what the run tried and the action: reply on the ticket or use Unblock with a message. A last line with the shape of a secret SHALL be replaced by a note. It SHALL follow `delivery` REQ-031.

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

### Requirement: REQ-059 Attempt fencing

Each attempt of a unit SHALL have its own id. The step token of REQ-037 SHALL name the attempt. The system SHALL ignore and log a tool call, a report or a result of an attempt that is not the current attempt of its unit. Such a late result SHALL NOT change the state, the counts or the outputs of the run.

#### Scenario: Late report
- GIVEN attempt 1 of the step `build` stalled and attempt 2 runs
- WHEN attempt 1 sends `report` with the outcome done
- THEN the report is ignored, the log names attempt 1, and the step waits for attempt 2

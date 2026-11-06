# Spec: delivery (delta of update-run-resilience)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:update-run-resilience`

### Goal

Delivery fixes what it can with no click, inside the caps of the run, and ends plainly when a person decides. A merged pull request closes its issue.

### Why

The review round cap starts again at each feedback round, and feedback rounds have no cap. An empty branch and a rebase conflict wait for a click. A closed pull request leaves the run in `Blocked`. A rejected push leaves no report. A pull request body has no `Closes #N`, so the issue stays open and the sync starts a new run.

### Users And Scenarios

- Developer: a review finding, a red gate, a rebase conflict and an empty branch get one fix with no click.
- Tech lead: closes a pull request without a merge, and the run ends with a comment on the ticket.
- PO: sees the issue close when its pull request merges.

### Requirements

- REQ-004: Fix rounds start with no click and go on while the blocking findings get fewer, up to the run cap.
- REQ-010: The body holds `Closes #N` for each GitHub or GitLab issue of the run.
- REQ-014: A rejected push or pull request escalates the run.
- REQ-020: Feedback rounds have a run-wide cap and take all the feedback of a tick in one round.
- REQ-022: A merge applies from any state that is not final.
- REQ-026: A pull request closed without a merge cancels the run with one stop report.
- REQ-035: An empty branch starts one fixer round, then escalates.
- REQ-036: A rebase conflict starts one fixer round with no click, then escalates.

### Non-Goals

- A merge by Shipyard. A merge stays a person's action.
- A reopen of a closed pull request. A person starts a new run.

### Acceptance Criteria

- [ ] A run with four review rounds before and after its pull request opened escalates at the fifth, not later.
- [ ] A pull request of a run on a GitHub issue holds `Closes #<number>`.
- [ ] A pull request closed without a merge moves the run to `Cancelled`, and one comment goes on the ticket.

### Existing References

- Existing code/docs/specs: `crates/shipyard-engine/src/review.rs`, `feedback.rs`, `pull_request.rs`, `merge.rs`, `adr:0022`.
- Supersedes or extends: `spec:delivery`. Questions: Q-031.

## MODIFIED Requirements

### Requirement: REQ-004 Fix rounds

A P0 or P1 finding SHALL send the run back to `Working` for a fix round with no click, with all the blocking findings in one brief. A P2 finding SHALL NOT block the pull request, and the run log SHALL keep it. Rounds SHALL go on while the blocking findings get fewer, up to `review_rounds` (`factory` REQ-054, REQ-055). When the cap or the progress rule stops the rounds, the run SHALL escalate with the findings. An unblock SHALL start one more fix round with the findings and the message.

#### Scenario: One round
- GIVEN a review finds one defect
- WHEN the builder fixes it and the review runs again
- THEN the second review finds nothing and the run goes on

#### Scenario: P2 only
- GIVEN a review that finds one P2 finding and no P0 or P1 finding
- WHEN the gate is green
- THEN the run goes on to the pull request
- AND the run log keeps the P2 finding

#### Scenario: Batched findings
- GIVEN a review with three P1 findings
- WHEN the fix round starts
- THEN one builder brief holds the three findings

#### Scenario: Rounds spent
- GIVEN four fix rounds are spent and a P0 or P1 finding remains
- WHEN the fourth re-review ends
- THEN the run moves to `Blocked` with the cause review rounds spent
- AND the stop report lists the findings

#### Scenario: Unblock after the rounds
- GIVEN a run in `Blocked` after its review rounds are spent
- WHEN a person unblocks it with a message
- THEN the builder runs one more fix round with the findings and the message

### Requirement: REQ-010 Title and body

The title SHALL follow the commit. The body SHALL start with an opening paragraph, then the gate result, then one item for each ticket. For each GitHub or GitLab issue of the run, the body SHALL hold the line `Closes #<number>`, or `Closes <repository>#<number>` for an issue of another repository. The body MUST NOT hold a count or a verdict that the run log does not hold. No title, body or comment SHALL hold an AI attribution line.

#### Scenario: Body parts
- GIVEN a run that delivers two tickets
- WHEN the system writes the body
- THEN the body opens with one paragraph
- AND the body shows the gate result with its exact counts
- AND the body has one item for each of the two tickets

#### Scenario: Closes line
- GIVEN a run on the GitHub issue 42 of the same repository
- WHEN the system writes the body
- THEN the body holds the line `Closes #42`

#### Scenario: Jira ticket
- GIVEN a run on a Jira ticket
- WHEN the system writes the body
- THEN the body holds no `Closes` line

### Requirement: REQ-014 Push and pull request switches

The `push` and `pull_request` switches SHALL be off by default (`factory` REQ-025). An admin turns each one on per project. A write without its switch SHALL become an approval in Home / Inbox that names the exact write. One click SHALL send it. A rejection SHALL drop the write and escalate the run (`factory` REQ-026, REQ-053).

#### Scenario: Switch off
- GIVEN `push` off and a run ready to push
- WHEN the run reaches the push
- THEN an approval appears in the Inbox and nothing is pushed

#### Scenario: One click
- GIVEN an approval for a pull request
- WHEN the person clicks it
- THEN the system opens the pull request

#### Scenario: Switch on
- GIVEN `pull_request` on
- WHEN the run reaches the pull request step
- THEN the system opens it with no approval

#### Scenario: Rejected push
- GIVEN an approval for a push
- WHEN the person rejects it
- THEN nothing is pushed, the run moves to `Blocked` with the cause push rejected, and one stop report goes out

### Requirement: REQ-020 Feedback limits

Each move from `PROpen` to `ChangesRequested` SHALL be one feedback round. One round SHALL take all the failed checks and open threads that the tick found. The feedback rounds SHALL count against `feedback_rounds`, and their fix and review rounds against the run caps (`factory` REQ-054). No feedback round SHALL reset a count. A feedback round above the cap SHALL escalate. The budget and the max turns SHALL still apply (`factory` REQ-022, REQ-023).

#### Scenario: Feedback cap
- GIVEN a run with `feedback_rounds` 3 and three feedback rounds spent
- WHEN a new CI failure arrives
- THEN the run moves to `Blocked` with the cause feedback rounds spent, and the Inbox shows it

#### Scenario: One round for one tick
- GIVEN a tick that finds one failed check and two new threads
- WHEN the feedback round starts
- THEN one builder brief holds the check and the two threads, and the feedback count goes up by one

#### Scenario: Loop stops
- GIVEN a run at its max turns
- WHEN a new CI failure arrives
- THEN the run moves to `Paused` with the cause max turns and the Inbox shows it

#### Scenario: Budget stop
- GIVEN a run in a feedback loop at 100 % of its budget
- WHEN a new review comment arrives
- THEN the run moves to `Paused` and the Inbox shows it

### Requirement: REQ-022 Merge detection

When `sync` hands a merge event to delivery, the run SHALL move to `Merged` and then to `Done`, from any state that is not final, side states included. Delivery SHALL handle the event before `sync` stops runs for a terminal ticket (`sync` REQ-003, REQ-004). The run SHALL reach `Done` in the same step, also when a write of REQ-023 or REQ-024 waits for a click: that write goes out after the click.

#### Scenario: Merge
- GIVEN a `PROpen` run and a merged pull request
- WHEN a tick runs
- THEN the run moves to `Merged` and then `Done`
- AND the run does not move to `Cancelled`

#### Scenario: Merge during a fix
- GIVEN a run in a feedback round (`Working` or `SelfReview`) with its agents running and a push that waits for a click
- WHEN the pull request merges
- THEN the agents stop, the run moves to `Merged` and then `Done`, and the push approval is dropped

#### Scenario: Merge while blocked
- GIVEN a run in `Blocked` with an open pull request
- WHEN a person merges the pull request
- THEN the next tick moves the run to `Merged` and then `Done`

### Requirement: REQ-026 Closed without merge

When a pull request closes without a merge, in any state that is not final, the system SHALL stop the agents and move the run to `Cancelled` with the reason pull request closed. The worktree and the ticket SHALL stay as they are. The run SHALL post one stop report (`factory` REQ-058). The pickup SHALL NOT start a new run on the ticket before the ticket changes (`sync` REQ-018).

#### Scenario: Closed
- GIVEN a `PROpen` run
- WHEN a person closes the pull request
- THEN the run moves to `Cancelled` with the reason pull request closed
- AND the ticket gets one comment that names the closed pull request

#### Scenario: Unblock after the close
- GIVEN a run cancelled because its pull request closed
- WHEN a person comments on the ticket and a tick runs
- THEN a new run starts on the ticket and opens a new pull request

#### Scenario: Closed during a retry
- GIVEN a run in `RetryQueued` with an open pull request
- WHEN a person closes the pull request
- THEN the run moves to `Cancelled` and no retry starts

### Requirement: REQ-035 Nothing to deliver

When the run branch has no change against the base, the pull request step SHALL start one fixer round (`factory` REQ-057) with the note "The pull request step found no change to deliver." When the branch still has no change, the run SHALL escalate with the reason nothing to deliver. A person SHALL be able to close the run as `Done` from the run view (Close as done). The run log SHALL keep the reason.

#### Scenario: Fixer round
- GIVEN a run branch with no change against the base
- WHEN the pull request step runs
- THEN a builder step gets the note with no click, and the review and the pull request step run again

#### Scenario: Still nothing
- GIVEN a fixer round for an empty branch that ended with no change
- WHEN the pull request step runs again
- THEN the run moves to `Blocked` with the reason nothing to deliver

#### Scenario: Unblock with nothing to deliver
- GIVEN a run blocked because the run branch still has no change after its fixer round
- WHEN a person unblocks it with a message
- THEN the builder steps get the note and the message, and the review and the pull request step run again

#### Scenario: Close as done
- GIVEN a run blocked because the run branch has no change against the base
- WHEN a person clicks Close as done
- THEN the run moves to `Done`
- AND the run log keeps the reason

### Requirement: REQ-036 Rebase conflict

When the rebase onto the base conflicts, the pull request step SHALL start one fixer round (`factory` REQ-057) with the files, with no click. The fixer SHALL rebase the run branch onto the base in the run worktree, resolve the conflicts, keep the intent of both sides, run the checks and report. After the review, the pull request step SHALL run again. A second conflict SHALL escalate the run with the files.

#### Scenario: Rebase conflict
- GIVEN a rebase conflict in `src/a.rs`
- WHEN the pull request step finds it
- THEN a builder step gets a note that names `src/a.rs` and asks for the rebase in the run worktree, with no click
- AND after the review the pull request step runs again

#### Scenario: Second conflict
- GIVEN a fixer round for a rebase conflict that ended
- WHEN the rebase conflicts again
- THEN the run moves to `Blocked` with the files

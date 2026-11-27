# Spec: factory (delta of update-ux-declutter)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-12
Change: `change:update-ux-declutter`

### Goal

The Runs list shows five lanes of the runs that need attention. History lists every ended run.

### Why

The sixth lane (Done) grew with no limit and pushed the board off the screen. The ghost rows of an empty lane showed nothing useful (`ux-declutter` REQ-035, REQ-036).

### Users And Scenarios

- Any role: sees what works, what waits and what is in review, with no sideways scroll.
- Developer: opens History to find a run that ended, or an older run of a ticket.

### Requirements

- REQ-027: Factory / Runs SHALL show five lanes, each with a count, and a History view. The view SHALL have one primary action. Each run that is not ended, and the latest failed run of a ticket, SHALL sit in the lane that REQ-038 gives. History SHALL list every ended run.
- REQ-038: The lane Queued SHALL hold the states `Queued`, `Claimed` and `RetryQueued`. The lane Working SHALL hold `Planning`, `Working`, `SelfReview` and `ChangesRequested`. The lane Needs you SHALL hold `PlanReview`, `WaitingForAnswer`, `Blocked`, `Paused` and `Failed`. The lane Ready to merge SHALL hold a `PROpen` run with passing CI, no change request and no draft. The lane In review SHALL hold each other `PROpen` run. A run in `Merged`, `Done` or `Cancelled` SHALL sit in no lane: History lists it.

### Non-Goals

- A change of the states or of their transitions.

### Acceptance Criteria

- [ ] The Runs view shows the five lanes with counts, puts each state in its lane, shows a ready `PROpen` run in Ready to merge, and shows an empty lane with the empty pattern.
- [ ] A run in `Done` shows in History and in no lane.
- [ ] The latest run of a ticket in `Failed` shows in Needs you and in History.

### Existing References

- Existing code/docs/specs: `specs/factory` REQ-027, REQ-038, `changes/update-ux-declutter/specs/ux-declutter` REQ-027 to REQ-038.
- Supersedes or extends: `spec:factory#REQ-027`, `spec:factory#REQ-030`, `spec:factory#REQ-031`, `spec:factory#REQ-038`.

## MODIFIED Requirements

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

Factory / Sessions SHALL list the agent sessions. Each row SHALL show runner, model, run, state and tokens. The view SHALL show no stat tiles: the totals of tokens and cost SHALL be the last row of the table. The list SHALL include the AI tool sessions of the run units (Active, Previous, start time), and a click on a row SHALL open the run page at the unit. With no session, the view SHALL show the empty pattern with an action that opens Runs. The run page SHALL list its started units with Follow and, for a Claude Code unit with a session id, Open in terminal, which SHALL be off while the unit runs. The Agents switch (the global kill switch of REQ-024) SHALL stay as the header action of the view, and it SHALL stop every session.

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

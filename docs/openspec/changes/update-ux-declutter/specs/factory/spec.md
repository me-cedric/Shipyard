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

- Existing code/docs/specs: `specs/factory` REQ-027, REQ-038, `changes/update-ux-declutter/specs/ux-declutter` REQ-034 to REQ-037.
- Supersedes or extends: `spec:factory#REQ-027`, `spec:factory#REQ-038`.

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

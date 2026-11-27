# Spec: sync (delta of update-run-resilience)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:update-run-resilience`

### Goal

The pickup never starts a run again on a ticket that did not change. A run of a project that is not open does not hold its claim.

### Why

An open GitHub or GitLab issue counts as Todo, and the pickup label stays after `Done`. The sync starts a new run on the issue after each end, `Done` included. The runs of a project that is not open get no tick and keep their claim.

### Users And Scenarios

- Developer: a merged issue gets no second run. A comment on a cancelled ticket picks it up again.
- PM: a ticket with no change uses no money after its run ends.
- Tech lead: closes a project, and another machine can take its tickets after 10 min.

### Requirements

- REQ-018: No new run on a ticket whose last run ended, until the ticket changes or a person clicks Run.
- REQ-019: At `Done`, the pickup label goes from a GitHub or GitLab issue.
- REQ-020: A run of a project that is not open releases its claim after 10 min and takes it back at the open.

### Non-Goals

- A change of the pickup filter or of the concurrency.
- A run on a closed project. The run waits for the open.

### Acceptance Criteria

- [ ] A GitHub issue with the label `shipyard` whose run is `Done` gets no second run at the next tick.
- [ ] A new comment of a person on that issue picks it up again.
- [ ] A run of a closed project has no claim 10 min after the close.

### Existing References

- Existing code/docs/specs: `crates/shipyard-core/src/pickup.rs`, `crates/shipyard-engine/src/tick.rs`, `crates/shipyard-engine/src/claims.rs`, `adr:0022`.
- Supersedes or extends: `spec:sync`. Questions: Q-021.

## ADDED Requirements

### Requirement: REQ-018 No restart after an end

The pickup SHALL NOT start a run on a ticket whose last run ended (`Done`, `Cancelled` or `Failed`) unless the ticket changed after that end: a new comment of a person (`questions-loop` REQ-009), a pickup label added again, or a status moved back into the pickup filter. A click on Run SHALL start a run. The system SHALL keep the end of the last run of each ticket, with its labels and status after the end writes, in the local store.

#### Scenario: Done issue
- GIVEN a GitHub issue that stays open with the label `shipyard` after its run reached `Done`
- WHEN a tick runs
- THEN the pickup starts no run on it

#### Scenario: Cancelled by a person
- GIVEN a ticket whose run a person cancelled
- WHEN a tick runs and the ticket did not change
- THEN the pickup starts no run on it

#### Scenario: New comment
- GIVEN a ticket whose last run ended
- WHEN a person adds a comment and a tick runs
- THEN the pickup starts a new run on it

#### Scenario: Run click
- GIVEN a ticket whose last run ended and that did not change
- WHEN a person clicks Run
- THEN a new run starts

### Requirement: REQ-019 Pickup label at the end

When a run on a GitHub or GitLab issue reaches `Done`, the system SHALL remove the pickup label from the issue when `tracker_transition` is on. With the switch off, the label SHALL stay and no approval SHALL show: REQ-018 stops the restart.

#### Scenario: Label removed
- GIVEN `tracker_transition` on and a run on a GitHub issue with the label `shipyard`
- WHEN the run reaches `Done`
- THEN the issue loses the label `shipyard`

#### Scenario: Switch off
- GIVEN `tracker_transition` off
- WHEN the run reaches `Done`
- THEN the label stays, and no approval shows

### Requirement: REQ-020 Project not open

A run of a project that is not open SHALL keep its state and SHALL start no new unit. After a grace time of 10 min, the system SHALL release the claim and the stamp of the run. When the project opens, the system SHALL take the claim again before a unit starts. When another machine holds a live claim, the run SHALL stop with the reason claim lost (REQ-010).

#### Scenario: Release
- GIVEN a run in `Working` and its project closed
- WHEN 10 min pass
- THEN the claim and the stamp of the run are gone and the run is still in `Working`

#### Scenario: Open again
- GIVEN a run whose claim was released because its project was closed
- WHEN the project opens and no other machine holds the claim
- THEN the system takes the claim and the run goes on

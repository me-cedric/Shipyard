# Spec: factory (delta of update-app-redesign)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-19
Change: `change:update-app-redesign`

### Goal

Flow shows each feature once in five stages in place of the run lanes, and Crew shows the live work as rows in place of the agents map.

### Why

A person follows a feature, not a run (`spec:app-redesign#REQ-010`). The agents map had crossing lines that nobody could read (`spec:app-redesign#REQ-017`).

### Requirements

- REQ-027: Flow SHALL show each feature once in one of the stages Idea, Spec, Build, Review and Ready, each with a count, and SHALL have the views Flow, List, Done and Health. The view SHALL have one primary action. Each feature SHALL sit in the stage that REQ-038 gives. Done SHALL list every ended feature, newest end first.
- REQ-038: Each run state SHALL map to one stage and, when it applies, to one mark: needs you, blocked or stopped. `Queued`, `Claimed`, `Planning` and `PlanReview` SHALL be Spec. `Working` and `SelfReview` SHALL be Build. `PROpen` and `ChangesRequested` SHALL be Review. `Merged` and `Done` SHALL be Ready. `Failed` and `Cancelled` SHALL be Build with the mark stopped. A side state SHALL take the stage of its return state.
- REQ-030: Crew SHALL show the live work as rows. A row SHALL show the agent, the feature and its state, and the files and specs that the agent reads and changes, never a raw ref. The raw ref SHALL be the tooltip and the item Copy ref of the menu of the agent. The address of the agents map SHALL open this view.

### Non-Goals

- A change of the run states or of their transitions.
- A change of the page names in the other requirements of `factory`: each one keeps its ref at the new place of the map in `plan.md` of this change.

### Acceptance Criteria

- [ ] Each of the 16 run states shows in one stage of Flow, with the right mark.
- [ ] The live view shows one row for each agent at work, with no raw ref.

### Existing References

- Supersedes or extends: `spec:factory#REQ-027`, `spec:factory#REQ-030`, `spec:factory#REQ-038`, and the delta of `docs/openspec/changes/archive/2026-11-26-update-ux-declutter/` on the same three requirements.
- Existing code: `crates/shipyard-core/src/feature.rs` (`stage_of`), `src/features/flow/`, `src/features/crew/`.

## MODIFIED Requirements

### Requirement: REQ-027 Runs view

Flow SHALL show each feature once in one of the stages Idea, Spec, Build, Review and Ready, each with a count, and SHALL have the views Flow, List, Done and Health. The view SHALL have one primary action. Each feature SHALL sit in the stage that REQ-038 gives. Done SHALL list every ended feature, newest end first.

Screen: SCR-006

#### Scenario: Needs you lane
- GIVEN a feature whose run is in `WaitingForAnswer`
- WHEN the person opens Flow
- THEN the feature shows once, in its stage, with the mark needs you

#### Scenario: Empty lane
- GIVEN a filter that hides every card of a stage
- WHEN the person opens Flow
- THEN the stage shows as an empty column with the count 0

#### Scenario: One card for one feature
- GIVEN a feature with a ticket, a spec change and a run in `Working`
- WHEN the person opens Flow
- THEN the feature shows once, in Build

#### Scenario: Ended run
- GIVEN a feature whose run is in `Done`
- WHEN the person opens the view Done
- THEN the feature shows in the list

#### Scenario: Failed run
- GIVEN the latest run of a ticket is in `Failed`
- WHEN the person opens Flow
- THEN the feature shows in Build with the mark stopped, and its menu starts the run again
- AND the run shows in Done

### Requirement: REQ-038 Run lanes

Each run state SHALL map to one stage and, when it applies, to one mark: needs you, blocked or stopped. `Queued`, `Claimed`, `Planning` and `PlanReview` SHALL be Spec. `Working` and `SelfReview` SHALL be Build. `PROpen` and `ChangesRequested` SHALL be Review. `Merged` and `Done` SHALL be Ready. `Failed` and `Cancelled` SHALL be Build with the mark stopped. A side state SHALL take the stage of its return state.

Screen: SCR-006

#### Scenario: Ready to merge
- GIVEN a run in `PROpen` with passing CI, no change request and no draft
- WHEN the person opens Flow
- THEN the feature shows in Review and its card says Ready to merge

#### Scenario: Draft
- GIVEN a run in `PROpen` with passing CI and a draft pull request
- WHEN the person opens Flow
- THEN the feature shows in Review

#### Scenario: Cancelled run
- GIVEN a run that a person stopped
- WHEN the person opens the view Done
- THEN the run shows in the list

#### Scenario: A blocked run
- GIVEN a feature whose run is in `Blocked` and returns to `Working`
- WHEN the person opens Flow
- THEN the feature shows in Build with the mark blocked

#### Scenario: A failed run
- GIVEN a feature whose run is in `Failed`
- WHEN the person opens Flow
- THEN the feature shows in Build with the mark stopped

### Requirement: REQ-030 Agents map

Crew SHALL show the live work as rows. A row SHALL show the agent, the feature and its state, and the files and specs that the agent reads and changes, never a raw ref. The raw ref SHALL be the tooltip and the item Copy ref of the menu of the agent. The address of the agents map SHALL open this view.

Screen: SCR-007

#### Scenario: Live node
- GIVEN a running agent
- WHEN it reads a file
- THEN the row of the agent names the file

#### Scenario: Open entity
- GIVEN a row that names a file or a spec
- WHEN the person clicks that ref
- THEN the inspector shows the entity

#### Scenario: Open run
- GIVEN the row of an agent of a run
- WHEN the person clicks the agent
- THEN the feature page opens at the unit of that agent

#### Scenario: Plain label
- GIVEN the row of an agent of a run
- WHEN the live view shows
- THEN the row shows the ticket key and title and no `run:` ref

#### Scenario: Old address
- GIVEN the address of the agents map of before this change
- WHEN the person opens it
- THEN the live view of Crew opens

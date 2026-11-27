# Spec: runs-recipes

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-20
Change: `docs/openspec/changes/archive/2026-11-26-add-redesign-functions/`

### Goal

A person can pause an agent, take a run over, attach a file to the agent chat, add a document and a limit to a new feature, and set the budget choices, the stage limits and the roles of a recipe, as the redesign shows.

### Why

The design of the redesign shows nine controls of runs and recipes that the app does not have (`change:update-app-redesign`). The owner asked to build them (`q:Q-173`).

### Requirement list

- REQ-001: The Agent card SHALL have Pause beside Talk and Stop. Pause SHALL let the agent finish its current turn, then move the run to `Paused` with the cause Person. A paused run SHALL keep its slot in the run limits. Resume SHALL start a new turn in the same worktree and SHALL continue the session of the AI tool when the tool can resume. The stop card SHALL show "Paused by a person" with Stop it and Resume.
- REQ-002: The blocked card SHALL have Take it over beside Unblock. Take it over SHALL end the run as `Cancelled` with the reason "Taken over by <person>", SHALL keep the branch and the worktree, SHALL set the person as assignee of the ticket and SHALL open the worktree in the editor.
- REQ-003: The chat with the agent SHALL have a "+" button. The button SHALL copy the chosen file into the run folder as context for the next turn, with the limits of `assistant_attach`. The chat SHALL refuse a file over the limits and SHALL say why.
- REQ-004: New feature SHALL have Add a document. It SHALL accept Markdown, PDF and Word files, SHALL copy the file into `docs/openspec/changes/<id>/inputs/` as input for the spec writer, and SHALL refuse another kind.
- REQ-005: New feature SHALL show "Limit" beside the recipe. The limit SHALL cover all runs of the feature, SHALL sit in `.shipyard/automation.yaml` by ticket key, and SHALL act as a budget with the choice of REQ-006 when the spend of the feature reaches it.
- REQ-006: Spend SHALL let a person edit Warn at, one percent for each project, default 80 %. Budgets SHALL have a row Then for each budget with the choices Stop and ask (default), Pause, Ask me and Go on. Go on SHALL turn the budget into a warning only, and SHALL NOT remove Stop all agents or the stall timeout. A run has no turn limit (`adr:0025`).
- REQ-007: Automation SHALL show stage limits for the fixed stages Plan, Build and Review beside the limits by status. The engine SHALL count the active runs of each stage and SHALL keep a run queued while its stage is at its limit. Planning and PlanReview SHALL be Plan, Working and SelfReview SHALL be Build, and PROpen and ChangesRequested SHALL be Review.
- REQ-008: A human step of a recipe SHALL have an optional role. Only a person with that role SHALL approve the step. Only that role SHALL get the card on Today.
- REQ-009: The page of a step SHALL show the rows Kind, Runs beside other steps, Child steps run side by side and Mode, and in People the row May write with Asks first and Alone. Kind SHALL come from the step: agent, person or check. Alone SHALL be the approval "Do not ask again for this recipe".

### Non-Goals

- A change of the run states other than the new transition of Pause.
- A hard cap of spend: the budget choices of REQ-006 are the controls.

### Acceptance Criteria

- [x] Pause an agent (F02): each scenario below passes.
- [x] Take it over (F03): each scenario below passes.
- [x] Attach a file in the agent chat (F05): each scenario below passes.
- [x] Add a document to a new feature (F07): each scenario below passes.
- [x] Limit of a new feature (F08): each scenario below passes.
- [x] Warn at and Then of budgets (F16): each scenario below passes.
- [x] Stage limits of Automation (F17): each scenario below passes.
- [x] Role of a human step (F18): each scenario below passes.
- [x] Rows of a recipe step (F19): each scenario below passes.

### Existing References

- Extends: `change:update-app-redesign`, which kept the Non-Goal "No new function". This change lifts that Non-Goal for these controls (`adr:0023`).
- Existing: `spec:factory#REQ-004`, `spec:factory#REQ-022`, `spec:factory#REQ-035`, `spec:factory#REQ-046`. Code: `crates/shipyard-engine/`, `crates/shipyard-core/src/{run,workflow,pickup}.rs`, `crates/shipyard-app/src/{factory,specs}.rs`, `src/features/flow/`, `src/features/crew/`, `src/features/sync/`.

## Requirements

### Requirement: REQ-001 Pause an agent

The Agent card SHALL have Pause beside Talk and Stop. Pause SHALL let the agent finish its current turn, then move the run to `Paused` with the cause Person. A paused run SHALL keep its slot in the run limits. Resume SHALL start a new turn in the same worktree and SHALL continue the session of the AI tool when the tool can resume. The stop card SHALL show "Paused by a person" with Stop it and Resume.

Design control: F02

Screen: SCR-026
Screen: SCR-122

#### Scenario: Pause at the end of a turn

- GIVEN a run in `Working` with a turn in progress
- WHEN the person selects Pause
- THEN the turn ends, no work is lost, and the run is `Paused` with the cause Person

#### Scenario: Resume

- GIVEN a run paused by a person
- WHEN the person selects Resume
- THEN a new turn starts in the same worktree and the AI tool session continues when the tool can resume

#### Scenario: Slot kept

- GIVEN a paused run and a project at its run limit
- WHEN the engine looks for a free slot
- THEN the paused run still holds its slot

### Requirement: REQ-002 Take it over

The blocked card SHALL have Take it over beside Unblock. Take it over SHALL end the run as `Cancelled` with the reason "Taken over by <person>", SHALL keep the branch and the worktree, SHALL set the person as assignee of the ticket and SHALL open the worktree in the editor.

Design control: F03

Screen: SCR-122
Screen: SCR-120

#### Scenario: Take over a blocked run

- GIVEN a run in `Blocked`
- WHEN the person selects Take it over
- THEN the run is `Cancelled` with the reason "Taken over by Ada", the branch and the worktree stay, and Ada is the assignee

#### Scenario: Editor opens

- GIVEN a run that a person took over
- WHEN the run ends
- THEN the worktree opens in the editor

### Requirement: REQ-003 Attach a file in the agent chat

The chat with the agent SHALL have a "+" button. The button SHALL copy the chosen file into the run folder as context for the next turn, with the limits of `assistant_attach`. The chat SHALL refuse a file over the limits and SHALL say why.

Design control: F05

Screen: SCR-088

#### Scenario: Attach a file

- GIVEN a run with an open chat
- WHEN the person attaches a file within the limits
- THEN the file is in the run folder and the next turn reads it as context

#### Scenario: File too large

- GIVEN a file over the limit of `assistant_attach`
- WHEN the person attaches it
- THEN the chat refuses it and says the limit

### Requirement: REQ-004 Add a document to a new feature

New feature SHALL have Add a document. It SHALL accept Markdown, PDF and Word files, SHALL copy the file into `docs/openspec/changes/<id>/inputs/` as input for the spec writer, and SHALL refuse another kind.

Design control: F07

Screen: SCR-040

#### Scenario: Add a Word file

- GIVEN a new feature that makes the change `add-export`
- WHEN the person adds a Word file
- THEN the file is in `docs/openspec/changes/add-export/inputs/`

#### Scenario: Other kind

- GIVEN a new feature
- WHEN the person adds an image
- THEN the page refuses it and names the three kinds

### Requirement: REQ-005 Limit of a new feature

New feature SHALL show "Limit" beside the recipe. The limit SHALL cover all runs of the feature, SHALL sit in `.shipyard/automation.yaml` by ticket key, and SHALL act as a budget with the choice of REQ-006 when the spend of the feature reaches it.

Design control: F08

Screen: SCR-040

#### Scenario: Set a limit

- GIVEN a new feature with the recipe Feature
- WHEN the person sets the limit to $3.00
- THEN `.shipyard/automation.yaml` holds the limit for the ticket key

#### Scenario: Sum of runs

- GIVEN a feature with two runs that spend $1.50 each and a limit of $3.00
- WHEN the second run ends
- THEN the limit is reached and the choice of REQ-006 applies

### Requirement: REQ-006 Warn at and Then of budgets

Spend SHALL let a person edit Warn at, one percent for each project, default 80 %. Budgets SHALL have a row Then for each budget with the choices Stop and ask (default), Pause, Ask me and Go on. Go on SHALL turn the budget into a warning only, and SHALL NOT remove Stop all agents or the stall timeout. A run has no turn limit (`adr:0025`).

Design control: F16. Decision: `adr:0024`.

Screen: SCR-032
Screen: SCR-144

#### Scenario: Edit Warn at

- GIVEN a project with Warn at 80 %
- WHEN the person sets Warn at to 70 %
- THEN the alert shows at 70 % of a budget

#### Scenario: Go on

- GIVEN a budget with Then set to Go on
- WHEN the spend passes the budget
- THEN the run goes on and the alert shows once

#### Scenario: Default

- GIVEN a budget with no choice set
- WHEN the spend reaches the budget
- THEN the run moves to `Paused` and waits for a person

#### Scenario: Kill switch stays

- GIVEN a run over a budget set to Go on
- WHEN the person selects Stop all agents
- THEN every run stops

### Requirement: REQ-007 Stage limits of Automation

Automation SHALL show stage limits for the fixed stages Plan, Build and Review beside the limits by status. The engine SHALL count the active runs of each stage and SHALL keep a run queued while its stage is at its limit. Planning and PlanReview SHALL be Plan, Working and SelfReview SHALL be Build, and PROpen and ChangesRequested SHALL be Review.

Design control: F17

Screen: SCR-182

#### Scenario: Stage at its limit

- GIVEN the Build limit is 2 and two runs are in Build
- WHEN a third run is ready for Build
- THEN the third run stays queued

### Requirement: REQ-008 Role of a human step

A human step of a recipe SHALL have an optional role. Only a person with that role SHALL approve the step. Only that role SHALL get the card on Today.

Design control: F18

Screen: SCR-020

#### Scenario: Role limits approval

- GIVEN a human step with the role Tech lead
- WHEN a person with the role Developer opens the step
- THEN the person cannot approve it and gets no card on Today

### Requirement: REQ-009 Rows of a recipe step

The page of a step SHALL show the rows Kind, Runs beside other steps, Child steps run side by side and Mode, and in People the row May write with Asks first and Alone. Kind SHALL come from the step: agent, person or check. Alone SHALL be the approval "Do not ask again for this recipe".

Design control: F19

Screen: SCR-141

#### Scenario: Kind of a step

- GIVEN a recipe with a person step
- WHEN the person opens the step
- THEN Kind shows person

#### Scenario: May write alone

- GIVEN a step with May write set to Asks first
- WHEN the person sets Alone
- THEN the approval "Do not ask again for this recipe" is on

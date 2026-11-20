# Spec: shell-setup-rights

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-20
Change: `change:add-redesign-functions`

### Goal

A person can sign out, take control of a session, see the load of the machine, set a Plan right, choose a model for each agent role and use the other controls of the shell and Setup that the redesign shows.

### Why

The design shows twelve controls of the shell, Setup, sessions and rights that the app does not have. The owner asked to build them (`q:Q-173`). Sign out removes the tokens of the code host and the issue tracker (`q:Q-175`).

### Requirements

- REQ-001: The account menu SHALL end with a red Sign out row, and the Me card SHALL have Sign out beside the name. After a confirmation, Sign out SHALL remove the tokens of the code host and of the issue tracker from the keychain of this computer. It SHALL NOT remove the sign-in of an AI tool or of OpenRouter. It SHALL list what it removes in the confirmation.
- REQ-002: A session row SHALL have Read only, Take control and Stop. Take control SHALL stop the session and resume it in the Shipyard terminal with the resume command of the tool (Claude Code or Codex). The pane SHALL show the live output when the tool writes a history file that Shipyard can read.
- REQ-003: How agents do SHALL show Processor and Memory bars for the agent processes only. The runner SHALL record the tool calls of each step in the run log, and each step of a run SHALL show them.
- REQ-004: Rights SHALL have the area Plan with the levels No, See and Change. The Plan right SHALL gate `estimate_save`, `apply_run` and `plan_calendar_save`. Time entries SHALL stay personal. The default Plan level of a role SHALL be the Work level of that role. Code and merge SHALL be one row that sets two rights.
- REQ-005: Time SHALL have Fill from my work. It SHALL make rows from the runs of my tickets and my commits of the day. The sheet SHALL have no Save button and SHALL save when the person leaves a field.
- REQ-006: Agent roles SHALL show the description and the model tier of each role, and a person SHALL change the tier. A change of a bundled role that has no project file SHALL write the project file of that role.
- REQ-007: Me SHALL have the notification "A budget reaches Warn at", a Sound switch and a Release channel with Stable and Preview. The budget notice SHALL follow Warn at of `spec:runs-recipes#REQ-006`. Preview SHALL use the pre-releases of the same release address. This requirement SHALL wait for `spec:runs-recipes#REQ-006`.
- REQ-008: Look and layout SHALL have Change beside the data folder and a Portable mode switch. Change SHALL move the data to the new place after a confirmation, then restart the app. The Portable switch SHALL write or remove the `portable` marker next to the app.
- REQ-009: Feedback SHALL have Attach a file. The app SHALL still send nothing. Attach a file SHALL show the file in the file manager beside the text of the feedback.
- REQ-010: The card "Shipyard needs N permissions" SHALL show at the first launch and each time a permission is missing. It SHALL list the missing permissions of the kinds Notifications and Files of your projects, each with Allow, with Later and Allow all. It SHALL NOT probe the keychain.
- REQ-011: Rights SHALL have a setting for each role that lists the places the role sees. A place that a role does not see SHALL be hidden. The default rights SHALL NOT change.
- REQ-012: When a person closes a project while agents work, the app SHALL ask with Cancel, Stop them and close, and Keep them working. Keep them working SHALL let the runs go on with no project open.

### Non-Goals

- A Shipyard account.
- A probe of the keychain.
- A change of the default rights of the roles.

### Acceptance Criteria

- [ ] Sign out (F01): each scenario below passes.
- [ ] Take control and live output of a session (F20): each scenario below passes.
- [ ] Processor, Memory and tool calls (F21): each scenario below passes.
- [ ] Plan right and the levels of Rights (F22): each scenario below passes.
- [ ] Fill from my work (F25): each scenario below passes.
- [ ] A model for each agent role (F40): each scenario below passes.
- [ ] Budget notice, Sound and Release channel (F41): each scenario below passes.
- [ ] Data folder and Portable mode (F42): each scenario below passes.
- [ ] Attach a file to feedback (F43): each scenario below passes.
- [ ] The permissions moment (F44): each scenario below passes.
- [ ] Places hidden for each role (F45): each scenario below passes.
- [ ] Ask before a project closes (F46): each scenario below passes.

### Existing References

- Extends: `change:update-app-redesign`, which kept the Non-Goal "No new function". This change lifts that Non-Goal for these controls (`adr:0023`).
- Existing: `spec:connections#REQ-011`, `spec:connections#REQ-014`, `adr:0019`. Code: `src/features/{shell,settings,onboarding}/`, `crates/shipyard-core/src/rights.rs`, `crates/shipyard-app/src/{rights,permissions,window,machine,connections}.rs`, `crates/shipyard-secrets/`.

## ADDED Requirements

### Requirement: REQ-001 Sign out

The account menu SHALL end with a red Sign out row, and the Me card SHALL have Sign out beside the name. After a confirmation, Sign out SHALL remove the tokens of the code host and of the issue tracker from the keychain of this computer. It SHALL NOT remove the sign-in of an AI tool or of OpenRouter. It SHALL list what it removes in the confirmation.

Design control: F01

Screen: SCR-028
Screen: SCR-063

#### Scenario: Sign out

- GIVEN a computer with a code host token and an issue tracker token
- WHEN the person selects Sign out and confirms
- THEN both tokens leave the keychain and the AI tools stay signed in

#### Scenario: Cancel

- GIVEN the confirmation shows
- WHEN the person cancels
- THEN no token is removed

### Requirement: REQ-002 Take control and live output of a session

A session row SHALL have Read only, Take control and Stop. Take control SHALL stop the session and resume it in the Shipyard terminal with the resume command of the tool (Claude Code or Codex). The pane SHALL show the live output when the tool writes a history file that Shipyard can read.

Design control: F20

Screen: SCR-068

#### Scenario: Take control

- GIVEN a running Claude Code session
- WHEN the person selects Take control
- THEN the session stops and the Shipyard terminal runs the resume command of Claude Code

#### Scenario: No history file

- GIVEN a session of a tool with no readable history file
- WHEN the person opens the pane
- THEN the pane shows no live output

### Requirement: REQ-003 Processor, Memory and tool calls

How agents do SHALL show Processor and Memory bars for the agent processes only. The runner SHALL record the tool calls of each step in the run log, and each step of a run SHALL show them.

Design control: F21

Screen: SCR-143

#### Scenario: Bars

- GIVEN two agent processes at work
- WHEN the person opens How agents do
- THEN the bars show the sum of the two processes, not the whole computer

#### Scenario: Tool calls

- GIVEN a step that read a ticket
- WHEN the person opens the step
- THEN the step lists the tool call that read the ticket

### Requirement: REQ-004 Plan right and the levels of Rights

Rights SHALL have the area Plan with the levels No, See and Change. The Plan right SHALL gate `estimate_save`, `apply_run` and `plan_calendar_save`. Time entries SHALL stay personal. The default Plan level of a role SHALL be the Work level of that role. Code and merge SHALL be one row that sets two rights.

Design control: F22

Screen: SCR-025

#### Scenario: Plan See

- GIVEN a member with Plan See
- WHEN the member saves an estimate
- THEN the command is refused

#### Scenario: Plan Change

- GIVEN a member with Plan Change
- WHEN the member saves an estimate
- THEN the estimate is saved

#### Scenario: Time stays personal

- GIVEN a member with Plan No
- WHEN the member writes a time entry
- THEN the entry is saved

### Requirement: REQ-005 Fill from my work

Time SHALL have Fill from my work. It SHALL make rows from the runs of my tickets and my commits of the day. The sheet SHALL have no Save button and SHALL save when the person leaves a field.

Design control: F25

Screen: SCR-067

#### Scenario: Fill

- GIVEN a person with one run on their ticket and two commits today
- WHEN the person selects Fill from my work
- THEN rows show for the run and the commits

### Requirement: REQ-006 A model for each agent role

Agent roles SHALL show the description and the model tier of each role, and a person SHALL change the tier. A change of a bundled role that has no project file SHALL write the project file of that role.

Design control: F40

Screen: SCR-092

#### Scenario: Change a tier

- GIVEN the bundled role Scout with no project file
- WHEN the person sets the tier Standard
- THEN the project file of Scout exists with the tier Standard

### Requirement: REQ-007 Budget notice, Sound and Release channel

Me SHALL have the notification "A budget reaches Warn at", a Sound switch and a Release channel with Stable and Preview. The budget notice SHALL follow Warn at of `spec:runs-recipes#REQ-006`. Preview SHALL use the pre-releases of the same release address. This requirement SHALL wait for `spec:runs-recipes#REQ-006`.

Design control: F41

Screen: SCR-063

#### Scenario: Budget notice

- GIVEN Warn at is 70 % and the notice is on
- WHEN a budget reaches 70 %
- THEN a notification shows

#### Scenario: Preview

- GIVEN the channel is Preview
- WHEN the app checks for an update
- THEN it considers the pre-releases of the release address

### Requirement: REQ-008 Data folder and Portable mode

Look and layout SHALL have Change beside the data folder and a Portable mode switch. Change SHALL move the data to the new place after a confirmation, then restart the app. The Portable switch SHALL write or remove the `portable` marker next to the app.

Design control: F42

Screen: SCR-183

#### Scenario: Move

- GIVEN a data folder and a new folder
- WHEN the person confirms Change
- THEN the data is in the new folder and the app restarts

#### Scenario: Cancel

- GIVEN the confirmation shows
- WHEN the person cancels
- THEN the data stays

### Requirement: REQ-009 Attach a file to feedback

Feedback SHALL have Attach a file. The app SHALL still send nothing. Attach a file SHALL show the file in the file manager beside the text of the feedback.

Design control: F43

Screen: SCR-095

#### Scenario: Reveal

- GIVEN the Feedback page
- WHEN the person selects Attach a file
- THEN the file manager shows the file and the app sends nothing

### Requirement: REQ-010 The permissions moment

The card "Shipyard needs N permissions" SHALL show at the first launch and each time a permission is missing. It SHALL list the missing permissions of the kinds Notifications and Files of your projects, each with Allow, with Later and Allow all. It SHALL NOT probe the keychain.

Design control: F44

Screen: SCR-017

#### Scenario: First launch

- GIVEN a first launch with two permissions missing
- WHEN the app starts
- THEN the card shows "Shipyard needs 2 permissions"

#### Scenario: Allow all

- GIVEN the card shows
- WHEN the person selects Allow all
- THEN each listed permission is asked

### Requirement: REQ-011 Places hidden for each role

Rights SHALL have a setting for each role that lists the places the role sees. A place that a role does not see SHALL be hidden. The default rights SHALL NOT change.

Design control: F45

Screen: SCR-103
Screen: SCR-025

#### Scenario: Hide a place

- GIVEN the role Designer
- WHEN the admin hides Code for Designer
- THEN a Designer does not see Code

#### Scenario: Defaults

- GIVEN a project with no change
- WHEN the person opens Rights
- THEN the default rights are as before

### Requirement: REQ-012 Ask before a project closes

When a person closes a project while agents work, the app SHALL ask with Cancel, Stop them and close, and Keep them working. Keep them working SHALL let the runs go on with no project open.

Design control: F46

Screen: SCR-096

#### Scenario: Stop them

- GIVEN 2 agents work
- WHEN the person closes the project and selects Stop them and close
- THEN the runs stop and the project closes

#### Scenario: Keep them

- GIVEN 2 agents work
- WHEN the person selects Keep them working
- THEN the project closes and the runs go on

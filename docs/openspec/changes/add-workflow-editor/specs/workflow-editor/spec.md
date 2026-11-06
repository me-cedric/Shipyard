# Spec: workflow-editor

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-05
Change: `change:add-workflow-editor`

### Goal

A person changes the options of the runs (the model, the effort, the turn limit, the budget and each step) in a form, with no YAML. An agent proposes a workflow change, and a person applies it.

### Why

The options of a run live in the workflow files. Factory / Workflows edits them as YAML text only, and the outside tools of an agent cannot reach `.shipyard/`.

### Users And Scenarios

- PM: makes a workflow for the bugs of the team from the preset `bug`, and turns on a budget of 2 USD.
- Developer: sets the effort of the review step to high and adds a turn limit of 40.
- Junior: picks the tools of a step from a list, and the form says at once when a step needs a step that does not exist.
- Architect: asks a Claude Code in a terminal to add a security review step. The agent proposes the change, and the architect reads the diff and applies it.

### Requirements

- REQ-001: Factory / Workflows SHALL open a valid workflow in a form, with the text view as the other choice. Both views SHALL edit the same text. An invalid text SHALL open in the text view.
- REQ-002: The form SHALL edit each field of a step: id, role or action, model, effort, mode, skill, needs, gate, workspace, for_each, max_parallel, retry, timeout, budget, tools, fresh_context and max_rounds. It SHALL add, remove and move a step up or down.
- REQ-003: The form SHALL offer a list for the role (the default roles and the files of `.shipyard/roles`), the model tier, the effort, the skill, the tools and the needs (the ids of the other steps).
- REQ-004: The form SHALL edit the limits of the run: `stall_s`, and the optional `budget_usd` and `max_turns`. The budget and the turn limit SHALL be off until the person turns them on.
- REQ-005: The form SHALL check the workflow at each change with the workflow check of the Factory (`factory` REQ-012, REQ-035), show the first issue, and keep Save off while an issue remains.
- REQ-006: A save from the form SHALL write the file through the shared YAML writer. It SHALL keep the comment lines at the top of the file and leave out a field that has its default value. A form save with no change SHALL keep each field of the workflow.
- REQ-007: A person SHALL create a workflow from a preset (the bundled workflows `feature`, `bug`, `spike`, `docs-update`, `review-only`, `spec-split`, `bootstrap`) or as a copy of a workflow, with a new id.
- REQ-008: A person SHALL rename and delete a workflow. A delete SHALL ask for a confirmation. Shipyard SHALL refuse to rename or delete the default workflow of the project or a workflow that a run uses.
- REQ-009: The Shipyard MCP server SHALL offer an outside agent the tools `workflow_list`, `workflow_read`, `workflow_validate` and `workflow_propose`, in the group `workflows`, off by default. A read-only project SHALL refuse `workflow_propose`.
- REQ-010: `workflow_propose` SHALL refuse an invalid text and SHALL NOT write the project. Factory / Workflows SHALL show each proposal with its diff, and a person SHALL apply or discard it.

### Non-Goals

- A form for the role files (`.shipyard/roles/*.md`).
- A free model id in the form: the text view edits it, and the form keeps it.
- A change of the run engine or of the workflow fields.

### Acceptance Criteria

- [ ] Each of the six presets opens in the form, and a save with no change gives the same workflow.
- [ ] A step added in the form with a need on a missing step shows the issue and keeps Save off.
- [ ] The budget and the turn limit are off for a new workflow and write `budget_usd` and `max_turns` only when they are on.
- [ ] A new workflow from the preset `bug` shows in the list with the new id.
- [ ] Delete of the default workflow is refused with a reason.
- [ ] An outside agent with the group `workflows` on proposes a text, and the file changes only after Apply.

## ADDED Requirements

### Requirement: REQ-001 Form and text views

Factory / Workflows SHALL open a valid workflow in a form, with the text view as the other choice. Both views SHALL edit the same text. An invalid text SHALL open in the text view.

Screen: SCR-020

#### Scenario: Switch view
- GIVEN the workflow `feature` is open in the form
- WHEN the person sets the effort of the step `build` to high and opens the text view
- THEN the text shows `effort: high` under the step `build`

#### Scenario: Invalid text
- GIVEN the file of the workflow `bug` does not parse
- WHEN the person opens it
- THEN it opens in the text view with its issue and its line

### Requirement: REQ-002 Step fields

The form SHALL edit each field of a step: id, role or action, model, effort, mode, skill, needs, gate, workspace, for_each, max_parallel, retry, timeout, budget, tools, fresh_context and max_rounds. It SHALL add, remove and move a step up or down.

Screen: SCR-020

#### Scenario: Add a step
- GIVEN the workflow `spike` is open in the form
- WHEN the person adds a step `check` with the role `tester` and moves it up once
- THEN the step `check` comes before the step `report` in the text

### Requirement: REQ-003 Pickers

The form SHALL offer a list for the role (the default roles and the files of `.shipyard/roles`), the model tier, the effort, the skill, the tools and the needs (the ids of the other steps).

Screen: SCR-020

#### Scenario: Pick the needs
- GIVEN the workflow `feature` is open in the form
- WHEN the person opens the needs of the step `review`
- THEN the list offers `grill`, `plan`, `build` and `pr`, and not `review`

### Requirement: REQ-004 Run limits

The form SHALL edit the limits of the run: `stall_s`, and the optional `budget_usd` and `max_turns`. The budget and the turn limit SHALL be off until the person turns them on.

Screen: SCR-020

#### Scenario: Turn limit
- GIVEN the workflow `feature` has no `max_turns`
- WHEN the person turns on the turn limit and sets 40
- THEN the text holds `max_turns: 40` under `limits`

#### Scenario: Budget
- GIVEN the workflow `bug` has no `budget_usd`
- WHEN the person turns on the budget and sets 2
- THEN the text holds `budget_usd: 2` under `limits`

### Requirement: REQ-005 Live check

The form SHALL check the workflow at each change with the workflow check of the Factory (`factory` REQ-012, REQ-035), show the first issue, and keep Save off while an issue remains.

Screen: SCR-020

#### Scenario: Unknown need
- GIVEN a step `build` that needs `plan`
- WHEN the person renames the step `plan` to `design`
- THEN the form shows that `build` needs an unknown step and Save is off

### Requirement: REQ-006 Form save

A save from the form SHALL write the file through the shared YAML writer. It SHALL keep the comment lines at the top of the file and leave out a field that has its default value. A form save with no change SHALL keep each field of the workflow.

#### Scenario: Round trip
- GIVEN each of the six bundled workflows
- WHEN the form writes it with no change
- THEN the workflow read from the new text is equal to the first one, and the top comment stays

### Requirement: REQ-007 Presets and copies

A person SHALL create a workflow from a preset (the bundled workflows `feature`, `bug`, `spike`, `docs-update`, `review-only`, `spec-split`, `bootstrap`) or as a copy of a workflow, with a new id.

Screen: SCR-020

#### Scenario: New from a preset
- GIVEN a project with no workflow `hotfix`
- WHEN the person makes a new workflow `hotfix` from the preset `bug`
- THEN the file `.shipyard/workflows/hotfix.yaml` holds the steps of `bug` and the id `hotfix`

#### Scenario: Id in use
- GIVEN a project with a workflow `bug`
- WHEN the person makes a copy of `feature` with the id `bug`
- THEN Shipyard refuses and the file `bug.yaml` does not change

### Requirement: REQ-008 Rename and delete

A person SHALL rename and delete a workflow. A delete SHALL ask for a confirmation. Shipyard SHALL refuse to rename or delete the default workflow of the project or a workflow that a run uses.

Screen: SCR-020

#### Scenario: Delete the default workflow
- GIVEN `feature` is the default workflow of the project
- WHEN the person deletes `feature` and confirms
- THEN Shipyard refuses and says that `feature` is the default workflow

#### Scenario: Rename
- GIVEN a workflow `hotfix` that no run uses
- WHEN the person renames it to `urgent`
- THEN the file `urgent.yaml` holds the id `urgent` and `hotfix.yaml` is gone

### Requirement: REQ-009 Agent tools

The Shipyard MCP server SHALL offer an outside agent the tools `workflow_list`, `workflow_read`, `workflow_validate` and `workflow_propose`, in the group `workflows`, off by default. A read-only project SHALL refuse `workflow_propose`.

#### Scenario: Group off
- GIVEN the group `workflows` is off
- WHEN an outside agent lists the tools
- THEN no workflow tool is in the list

#### Scenario: Read-only project
- GIVEN the group `workflows` is on and the profile of the project is read only
- WHEN an outside agent calls `workflow_propose`
- THEN the call is refused

### Requirement: REQ-010 Proposals

`workflow_propose` SHALL refuse an invalid text and SHALL NOT write the project. Factory / Workflows SHALL show each proposal with its diff, and a person SHALL apply or discard it.

Screen: SCR-020

#### Scenario: Apply a proposal
- GIVEN an outside agent proposed a new text for `bug`
- WHEN the person opens `bug`, reads the diff and clicks Apply
- THEN the file `bug.yaml` holds the new text and the proposal is gone

#### Scenario: Invalid proposal
- GIVEN an outside agent sends a text with a `needs` cycle
- WHEN it calls `workflow_propose`
- THEN the call returns the issue with its line and nothing is stored

# Spec: shell (delta of add-team-rights)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:add-team-rights`

### Goal

Give the roles of `team-rights` a home view, a first tab and a sidebar order, and make the rule on hidden tabs match the code: a person hides a tab for themselves, a project or a role never does.

### Why

REQ-016 says that a project cannot hide a tab, but the project profile of a machine hides tabs for a role. The roles of REQ-009 have no PO, no tech lead, no designer and no viewer.

### Requirements

- REQ-009: Each role of `team-rights` SHALL have a home view, a first tab and a sidebar order. No role SHALL lose access to a view. A role SHALL change the order, the home view, the Today panels and the rights. A right SHALL turn a control off, never hide a view.
- REQ-016: No tour and no help text. A project, a role or a right MUST NOT hide a tab or a space. A person MAY hide a tab for themselves on this machine. The palette SHALL still open it, and Settings SHALL never hide.

### Non-Goals

- A change of the tour rule. `add-onboarding-tour` owns it.

### Acceptance Criteria

- [ ] A person with the role `viewer` sees each space in the sidebar.
- [ ] A tab that a person hides opens from the palette.

## MODIFIED Requirements

### Requirement: REQ-009 Role home

Each role of `team-rights` (PO, PM, architect, tech lead, BA, developer, QA, designer, viewer) SHALL have a home view, a first tab and a sidebar order, as `team-rights` REQ-013 lists. No role SHALL lose access to a view. A role SHALL change the order, the home view, the Today panels and the rights of `team-rights`. A right SHALL turn a control off, never hide a view.

#### Scenario: Junior sidebar
- GIVEN the migration of `team-rights` REQ-015 gave a former junior the role `developer` with `-code.merge`
- WHEN the app opens
- THEN the main area shows Factory / Runs
- AND the sidebar still lists all seven spaces and Settings

#### Scenario: Viewer sidebar
- GIVEN the person has the role `viewer`
- WHEN the app opens
- THEN the main area shows Home / Today
- AND the sidebar still lists all seven spaces and Settings

### Requirement: REQ-016 No tour, no hidden tab

The app SHALL NOT show a tour, a help bubble or an onboarding text. A project, a role or a right MUST NOT hide a tab or a space from a person. A person MAY hide a tab or a space for themselves, on this machine. The palette SHALL still open a hidden tab, and Settings SHALL never hide. The first run SHALL be the first-run view of `add-projects` (REQ-001), which owns the role choice and the primary action (Q-008, option 1).

#### Scenario: First run
- GIVEN the app starts for the first time
- WHEN the first screen renders
- THEN it shows the first-run view of `add-projects`
- AND it shows no tour or help text

#### Scenario: Personal hidden tab
- GIVEN the person hid Code / Terminal for themselves
- WHEN the person runs Open Code / Terminal from the palette
- THEN the main area shows Code / Terminal

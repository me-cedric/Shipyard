# Spec: shell (delta of update-app-redesign)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-19
Change: `change:update-app-redesign`

### Goal

The shell shows the six places and Setup, the Ask bar holds the palette, and each role opens on its first page.

### Why

`adr:0023` replaces the eight spaces with six places. The Ask bar replaces the command palette (`spec:app-redesign#REQ-004`). The menu keeps one order for every role (`spec:app-redesign#REQ-006`).

### Requirements

- REQ-001: The sidebar SHALL list the places Today, Flow, Plan, Crew, Library and Code, and then Setup. The sidebar SHALL be 48 px wide when collapsed and 220 px wide when open. Each entry SHALL carry an icon and a noun.
- REQ-005: The palette shortcut SHALL move the focus to the Ask bar from any view. The Ask bar SHALL search the refs of every entity and SHALL run every action of the app. Each action SHALL show its shortcut.
- REQ-009: Each role of `team-rights` SHALL open on its first page, as `team-rights` REQ-013 lists. The menu SHALL keep its order for every role. A role MAY hide a place or a view with the level `none` of `team-rights` REQ-018. A role SHALL change the first page, the Today panels and the rights of `team-rights`. A right SHALL turn a control off, never hide a view.

### Non-Goals

- A change of the notifications, the inspector or the status bar rules of `shell`.

### Acceptance Criteria

- [ ] The sidebar lists the six places and Setup.
- [ ] The palette shortcut moves the focus to the Ask bar, and an action runs from it.
- [ ] A role opens on its first page, and the menu order is the same for every role.

### Existing References

- Supersedes or extends: `spec:shell#REQ-001`, `spec:shell#REQ-005`, `spec:shell#REQ-009`.
- Decision: `adr:0023`.

## MODIFIED Requirements

### Requirement: REQ-001 Sidebar

The sidebar SHALL list the places Today, Flow, Plan, Crew, Library and Code, and then Setup. The sidebar SHALL be 48 px wide when collapsed and 220 px wide when open. Each entry SHALL carry an icon and a noun.

Screen: SCR-036

#### Scenario: Open a space
- GIVEN the sidebar is open
- WHEN the person selects Plan
- THEN the main area shows Plan
- AND the Plan entry shows as current

### Requirement: REQ-005 Command palette

The palette shortcut SHALL move the focus to the Ask bar from any view. The Ask bar SHALL search the refs of every entity and SHALL run every action of the app. Each action SHALL show its shortcut.

Screen: SCR-038

#### Scenario: Jump to a ref
- GIVEN the Ask bar has the focus
- WHEN the person types a ref such as `wi:KEY-1`
- THEN the Ask bar lists the matching entity
- AND Enter opens it

#### Scenario: Run an action
- GIVEN the Ask bar has the focus
- WHEN the person types the name of an action and presses Enter
- THEN the action runs and the list closes

### Requirement: REQ-009 Role home

Each role of `team-rights` (PO, PM, architect, tech lead, BA, developer, QA, designer, viewer) SHALL open on its first page, as `team-rights` REQ-013 lists. The menu SHALL keep its order for every role. A role MAY hide a place or a view with the level `none` of `team-rights` REQ-018. A role SHALL change the first page, the Today panels and the rights of `team-rights`. A right SHALL turn a control off, never hide a view.

Screen: SCR-036

#### Scenario: Junior sidebar
- GIVEN the migration of `team-rights` REQ-015 gave a former junior the role `developer` with `-code.merge`
- WHEN the app opens
- THEN the main area shows Flow
- AND the sidebar still lists the six places and Setup

#### Scenario: Viewer sidebar
- GIVEN the person has the role `viewer` with no level `none`
- WHEN the app opens
- THEN the main area shows Today
- AND the sidebar still lists the six places and Setup

# Spec: projects (delta of update-app-redesign)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-19
Change: `change:update-app-redesign`

### Goal

The health dot is on the Health item of the account menu. The first run asks the role, then offers three starts as equal tiles, and shows at a first launch only.

### Why

Look pass 1 removed the status bar (`spec:shell#REQ-021`). The project health moved to the account menu (`spec:shell#REQ-018`). Look pass 2 rebuilt the first run from the design: it has no primary action, and it lists the recent projects (`spec:app-redesign#REQ-003`).

### Requirements

- REQ-001: The system SHALL ask the role on first launch, with "I only look" for the viewer, and then offer three starts as equal tiles: open a folder, clone a repository and new project, with the recent projects under them. The first run SHALL show at a first launch only. New project SHALL open a page with its own address, `/projects/new`, which makes the project at its end.
- REQ-013: The system SHALL show a health dot on the Health item of the account menu. The dot SHALL reflect the worst finding with a shape and a colour. The item SHALL open the Health page of the scope of the worst finding.

### Non-Goals

- A change of the health checks or of their findings.

### Acceptance Criteria

- [x] The first run shows the role question, then the three starts and the recent projects.
- [ ] The dot of the Health item changes colour and shape with the worst finding.

### Existing References

- Supersedes or extends: `spec:projects#REQ-001`, `spec:projects#REQ-013`.
- Related: `spec:shell#REQ-018` (the account menu).

## MODIFIED Requirements

### Requirement: REQ-001 First run

The system SHALL ask the role on first launch, with "I only look" for the viewer, and then offer three starts as equal tiles: open a folder, clone a repository and new project, with the recent projects under them. The first run SHALL show at a first launch only. New project SHALL open a page with its own address, `/projects/new`, which makes the project at its end. The `shell` capability defers to this requirement for the first run.

#### Scenario: Empty install
- GIVEN no project in the registry
- WHEN a person starts Shipyard
- THEN the first run asks the role, then shows the three starts with icon and noun labels

#### Scenario: Return start
- GIVEN at least one project in the registry
- WHEN a person starts Shipyard
- THEN the last active project opens

#### Scenario: Saved role
- GIVEN a saved role and no active project
- WHEN the first run shows
- THEN it shows the three starts at once

### Requirement: REQ-013 Health dot

The system SHALL show a health dot on the Health item of the account menu. The dot SHALL reflect the worst finding with a shape and a colour. The item SHALL open the Health page of the scope of the worst finding.

#### Scenario: Worst finding
- GIVEN one warning and one error
- WHEN the person opens the account menu
- THEN the dot of the Health item shows the error shape and colour

#### Scenario: Assistive label
- GIVEN a screen reader
- WHEN focus lands on the dot
- THEN it announces the worst state and the finding count

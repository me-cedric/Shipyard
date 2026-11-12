# Spec: projects (delta of update-ux-declutter)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-12
Change: `change:update-ux-declutter`

### Goal

The first run asks for the role first, then shows the three ways to start.

### Why

A person who picks a role by mistake has no way to confirm it: the role saved on the click (`ux-declutter` REQ-005).

### Users And Scenarios

- Junior: picks a role, clicks Continue, then opens a folder.
- A person with a saved role and no project: sees the three starts at once.

### Requirements

- REQ-001: The first run SHALL offer the role choice with a Continue action, then three starts: open a local folder, clone a remote repository, create a new project. Open a local folder is the one primary action of the starts.

### Non-Goals

- A change of the three starts or of their order.

### Acceptance Criteria

- [ ] With no saved role and no project, the first run shows the role choice and Continue, then the three starts.
- [ ] With a saved role or a project in the registry, the first run shows the three starts at once.

### Existing References

- Existing code/docs/specs: `specs/projects` REQ-001, `changes/update-ux-declutter/specs/ux-declutter` REQ-005.
- Supersedes or extends: `spec:projects#REQ-001`.

## MODIFIED Requirements

### Requirement: REQ-001 First run

The system SHALL offer the role choice with a Continue action on first run, then three starts: open a local folder, clone a remote repository, create a new project. The starts MUST show one primary action, Open a local folder. Clone and create SHALL be secondary actions. A person with a saved role or a project in the registry SHALL see the three starts at once. The `shell` capability defers to this requirement for the first run.

#### Scenario: Empty install

- GIVEN no project in the registry and no saved role
- WHEN a person starts Shipyard
- THEN the first run shows the role choice and Continue
- AND after Continue it shows the three starts with icon and noun labels
- AND only Open a local folder is a primary action

#### Scenario: Saved role

- GIVEN a saved role and no active project
- WHEN the first run shows
- THEN it shows the three starts at once

#### Scenario: Return start

- GIVEN at least one project in the registry
- WHEN a person starts Shipyard
- THEN the last active project opens

# Spec: projects (delta of update-app-redesign)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-19
Change: `change:update-app-redesign`

### Goal

The health dot is on the Health item of the account menu.

### Why

Look pass 1 removed the status bar (`spec:shell#REQ-021`). The project health moved to the account menu (`spec:shell#REQ-018`).

### Requirements

- REQ-013: The system SHALL show a health dot on the Health item of the account menu. The dot SHALL reflect the worst finding with a shape and a colour. The item SHALL open the Health page of the scope of the worst finding.

### Non-Goals

- A change of the health checks or of their findings.

### Acceptance Criteria

- [ ] The dot of the Health item changes colour and shape with the worst finding.

### Existing References

- Supersedes or extends: `spec:projects#REQ-013`.
- Related: `spec:shell#REQ-018` (the account menu).

## MODIFIED Requirements

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

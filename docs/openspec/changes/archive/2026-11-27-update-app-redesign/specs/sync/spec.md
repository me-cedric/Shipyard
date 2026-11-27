# Spec: sync (delta of update-app-redesign)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-19
Change: `change:update-app-redesign`

### Goal

The sync action is in the card of the sync mark.

### Why

Look pass 1 removed the status bar and the top bar (`spec:shell#REQ-021`). The sync action moved to the card that the sync mark opens.

### Requirements

- REQ-013: The system SHALL show one sync action in the card of the sync mark. The action SHALL run one tick at once, then the git fetch and fast-forward of `spec:code#REQ-014` (`q:Q-041`). The system SHALL show the sync state of each connection: idle, running, failed, with the time of the last good tick.
- REQ-017: Each sync view SHALL have no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path, a focus ring, assistive labels, enough contrast and no motion under reduced motion.

### Non-Goals

- A change of the tick, the mirror or the pickup.

### Acceptance Criteria

- [x] One sync action in the card of the sync mark starts one tick. Only the card and the Ask bar offer it.

### Existing References

- Supersedes or extends: `spec:sync#REQ-013`, `spec:sync#REQ-017`.
- Related: `spec:shell#REQ-021` (the card of the sync mark holds the sync action).

## MODIFIED Requirements

### Requirement: REQ-013 Sync action and state

The system SHALL show one sync action in the card of the sync mark. The action SHALL run one tick at once, then the git fetch and fast-forward of `add-code` REQ-014 (`q:Q-041`). The system SHALL show the sync state of each connection in Settings / Connections: idle, running, failed, with the time of the last good tick.

#### Scenario: Run at once
- GIVEN the next tick is in 40 s
- WHEN a person activates the sync action
- THEN a tick runs now
- AND the timer restarts

#### Scenario: Git fetch
- GIVEN a project with a remote and a clean working copy
- WHEN a person activates the sync action
- THEN the tick runs, then the working branch fetches and fast-forwards

#### Scenario: No second control
- GIVEN any view of the app
- WHEN a person looks for a sync control
- THEN only the card of the sync mark and the Ask bar offer it

### Requirement: REQ-017 Interface rules

Each sync view SHALL have no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path, a focus ring, assistive labels, enough contrast and no motion under reduced motion. The state of a connection SHALL use shape and colour together. Its text SHALL exist in French and English.

#### Scenario: Keyboard only
- GIVEN the open card of the sync mark
- WHEN a person focuses the sync action and presses Enter
- THEN a tick runs

#### Scenario: Language
- GIVEN the language is French
- WHEN a person reads the sync state
- THEN every label is in French

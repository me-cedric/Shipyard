# Spec: ux-declutter (delta of update-app-redesign)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-19
Change: `change:update-app-redesign`

### Goal

The requirements of `change:update-ux-declutter` on the top bar and the status bar name the new homes of their controls.

### Why

Look pass 1 removed the top bar and the status bar (`spec:shell#REQ-021`). The account row of the rail opens the menu of the avatar, the card of the sync mark shows the state of the repository, and the page area starts with one top row.

### Requirements

- REQ-010: The account row of the rail SHALL open a menu with Setup / Me, Theme (light, dark, system), Manual, Shortcuts, What's new and Replay the tour. F1 SHALL still open the manual.
- REQ-012: The Sync button SHALL show the ahead and behind counts. The card of the sync mark SHALL show the count of changed files.
- REQ-013: At a window width of 1100 px or more, the top row of the page SHALL show 13 controls or fewer.

### Non-Goals

- A change of REQ-009 (Activity button) and REQ-011 (Ask split button) of `ux-declutter`: their requirement text names no bar.

### Acceptance Criteria

- [ ] The top row shows 13 controls or fewer at 1100 px.
- [ ] The card of the sync mark shows the count of changed files, and Sync shows the ahead and behind counts.

### Existing References

- Supersedes or extends: `spec:ux-declutter#REQ-010`, `spec:ux-declutter#REQ-012`, `spec:ux-declutter#REQ-013`.
- Depends on: `change:update-ux-declutter` adds the capability `ux-declutter`. Archive that change first.
- Related: `spec:shell#REQ-018`, `spec:shell#REQ-021`.

## MODIFIED Requirements

### Requirement: REQ-010 Avatar menu

The account row of the rail SHALL open a menu with Setup / Me, Theme, Manual, Shortcuts, What's new and Replay the tour. F1 SHALL still open the manual.

#### Scenario: Theme from the menu

- GIVEN the dark theme
- WHEN the person picks Light in the account menu
- THEN the app shows the light theme

### Requirement: REQ-012 Repository state

The Sync button SHALL show the ahead and behind counts, and the card of the sync mark SHALL show the count of changed files.

#### Scenario: Changed files

- GIVEN five changed files and two commits ahead
- WHEN the person opens the sync mark
- THEN Sync shows 2 ahead and the card shows 5 changed files

### Requirement: REQ-013 Top bar size

At a window width of 1100 px or more, the top row of the page SHALL show 13 controls or fewer.

#### Scenario: Count

- GIVEN a window of 1100 px
- WHEN the top row of the page shows
- THEN it holds 13 controls or fewer

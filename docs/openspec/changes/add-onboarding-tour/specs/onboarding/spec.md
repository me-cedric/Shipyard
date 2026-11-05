# Spec: onboarding

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-05
Change: `change:add-onboarding-tour`

### Goal

A new person learns in one minute what Shipyard does and what to set up, and turns on the permissions that Shipyard needs, from one place.

### Why

The first-run page shows no picture of the loop, and the system asks for permissions at random moments.

### Users And Scenarios

- Junior: opens Shipyard for the first time, reads six short steps, and opens the manual at the end.
- PM: skips the tour, then replays it from the Help menu before a demo.
- Developer on macOS: turns on the notifications and the Documents folder in the tour, so no system prompt stops a later run.
- QA on Windows: sees that the files need no permission, and sends a test notification.

### Requirements

- REQ-001: At the first launch, Shipyard SHALL open the tour. When the person closes the tour or ends it, Shipyard SHALL NOT open it again by itself.
- REQ-002: The tour SHALL have six steps in this order: what Shipyard does, open a project, connect the issue tracker and the code host, choose the AI tool, the permissions, the first run on a ticket. Each step SHALL show a title, one sentence and a picture made from the icons and the colours of the app.
- REQ-003: The tour SHALL offer Back, Next and Close at each step, and Left and Right arrow keys. Escape SHALL close it. The tour SHALL keep the focus inside it and SHALL tell a screen reader the step number.
- REQ-004: The Help menu, the palette and Settings / Me SHALL offer Replay the tour.
- REQ-005: The last step SHALL offer to open the manual (Knowledge / Manual).
- REQ-006: The permissions list SHALL show each permission that Shipyard uses on this computer, with one state: on, off, not asked, not needed or unknown. Each state that a person can change SHALL have one action: Allow, Open System Settings or Send a test.
- REQ-007: On macOS, Shipyard SHALL ask for the notifications and for the Documents, Desktop and Downloads folders only after a click on Allow. Shipyard SHALL NOT read a protected folder to check its state before that click. Open System Settings SHALL open the matching privacy pane.
- REQ-008: On Windows and Linux, the files permission SHALL show not needed. The notifications SHALL offer Send a test, and on Windows Open System Settings.
- REQ-009: Settings / Me SHALL show the same permissions list.
- REQ-010: The tour and the permissions list SHALL ship in English and French.

### Non-Goals

- Full Disk Access, the camera, the microphone and the location: Shipyard does not use them.
- A replacement of the manual (Q-136).
- Actions that open, clone or connect from inside the tour: the first-run page and Settings already do them.

### Acceptance Criteria

- [ ] A fresh install opens the tour once.
- [ ] Close at step 2 keeps the tour closed at the next launch.
- [ ] Help / Replay the tour opens it at step 1.
- [ ] The last step opens Knowledge / Manual.
- [ ] On macOS, Allow on the folders shows the system prompt, then the state.
- [ ] On Windows, the files show not needed.
- [ ] Settings / Me shows the permissions.
- [ ] Each text exists in English and French.

## ADDED Requirements

### Requirement: REQ-001 First launch

At the first launch, Shipyard SHALL open the tour. When the person closes the tour or ends it, Shipyard SHALL NOT open it again by itself.

#### Scenario: Fresh install
- GIVEN Shipyard starts with no saved preferences
- WHEN the window opens
- THEN the tour opens at step 1

#### Scenario: Skipped
- GIVEN the person closed the tour at step 2
- WHEN Shipyard starts again
- THEN the tour does not open

### Requirement: REQ-002 Six steps

The tour SHALL have six steps in this order: what Shipyard does, open a project, connect the issue tracker and the code host, choose the AI tool, the permissions, the first run on a ticket. Each step SHALL show a title, one sentence and a picture made from the icons and the colours of the app.

#### Scenario: Steps
- GIVEN the tour is open
- WHEN the person clicks Next five times
- THEN the tour shows the six steps in order, each with a title, one sentence and a picture

### Requirement: REQ-003 Keyboard and screen reader

The tour SHALL offer Back, Next and Close at each step, and Left and Right arrow keys. Escape SHALL close it. The tour SHALL keep the focus inside it and SHALL tell a screen reader the step number.

#### Scenario: Keyboard
- GIVEN the tour is open at step 1
- WHEN the person presses the Right arrow, then Escape
- THEN the tour shows step 2, then closes

### Requirement: REQ-004 Replay

The Help menu, the palette and Settings / Me SHALL offer Replay the tour.

#### Scenario: Replay
- GIVEN the person closed the tour
- WHEN the person chooses Replay the tour in the palette
- THEN the tour opens at step 1

### Requirement: REQ-005 Manual

The last step SHALL offer to open the manual (Knowledge / Manual).

#### Scenario: Open the manual
- GIVEN the tour is at the last step
- WHEN the person clicks Open the manual
- THEN the tour closes and Knowledge / Manual opens

### Requirement: REQ-006 Permission states

The permissions list SHALL show each permission that Shipyard uses on this computer, with one state: on, off, not asked, not needed or unknown. Each state that a person can change SHALL have one action: Allow, Open System Settings or Send a test.

#### Scenario: Not asked
- GIVEN the notifications were never asked on macOS
- WHEN the person opens the permissions step
- THEN the notifications show not asked and the action Allow

#### Scenario: Off
- GIVEN the person refused the Documents folder
- WHEN the list shows the files
- THEN the files show off and the action Open System Settings

### Requirement: REQ-007 Ask after a click on macOS

On macOS, Shipyard SHALL ask for the notifications and for the Documents, Desktop and Downloads folders only after a click on Allow. Shipyard SHALL NOT read a protected folder to check its state before that click. Open System Settings SHALL open the matching privacy pane.

#### Scenario: Allow the folders
- GIVEN the files show not asked
- WHEN the person clicks Allow
- THEN macOS asks for each folder and the list shows the new state

#### Scenario: No early prompt
- GIVEN the files were never asked
- WHEN the permissions list loads
- THEN macOS shows no prompt

### Requirement: REQ-008 Windows and Linux

On Windows and Linux, the files permission SHALL show not needed. The notifications SHALL offer Send a test, and on Windows Open System Settings.

#### Scenario: Windows
- GIVEN Shipyard runs on Windows
- WHEN the permissions list loads
- THEN the files show not needed and the notifications offer Send a test and Open System Settings

### Requirement: REQ-009 Settings

Settings / Me SHALL show the same permissions list.

#### Scenario: Settings
- GIVEN the person skipped the tour
- WHEN the person opens Settings / Me
- THEN the permissions show with their states and actions

### Requirement: REQ-010 Languages

The tour and the permissions list SHALL ship in English and French.

#### Scenario: French
- GIVEN the language is French
- WHEN the tour opens
- THEN each step and each permission shows in French

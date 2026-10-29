# Spec: shell

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-shell`

### Goal

Give Shipyard one frame: seven spaces and Settings, one place for each action, and one home view per role.

### Why

Legacy has 40 routes, 12 sidebar groups and four stacked filters that hide pages. The same action (commit, pull) sits in many places. People need to find their work without a map.

### Users And Scenarios

- PM: opens on Work and sees assigned items and approvals in Home.
- Architect: opens on Design and jumps to any ref from the palette.
- Developer: opens on Factory, sees active runs in the status bar and commits from one place.
- QA: opens on Specs and finds questions and test plans in the Inbox and the palette.
- BA: answers questions from the Inbox.
- Functional lead: approves writes from the Inbox with one click.
- Junior: opens on Knowledge and uses the inspector to read backlinks.

### Requirements

- REQ-001: The sidebar lists the seven spaces and Settings.
- REQ-002: The shell has a main area and an inspector panel.
- REQ-003: Home has three views: Inbox, My work and Activity. My work and Activity show the tiles that the person pinned (`add-knowledge` REQ-024).
- REQ-004: The Inbox lists questions and approvals.
- REQ-005: The command palette searches refs and runs every action.
- REQ-006: The inspector shows the selected entity and its backlinks.
- REQ-007: The status bar has one commit action, one sync action, the project health and the active runs.
- REQ-008: One source list of events feeds the notification centre and the system notifications.
- REQ-009: Each role has a home view and a sidebar order. No role loses a view.
- REQ-010: Settings / Me holds the settings that follow the person.
- REQ-011: The app ships in French and English, and the person switches the language.
- REQ-012: The native menu offers the global actions.
- REQ-013: Context menus offer the actions of the entity under the pointer.
- REQ-014: The app checks for updates and tells the person. After an update, the app shows the changelog sections of the new version.
- REQ-015: The app reopens the last view of each project.
- REQ-016: The app has no tour and no per-project hidden tab.
- REQ-017: Every shell action has a keyboard path, a focus ring and an assistive label.

### Non-Goals

- No page content of a space. Each space capability owns its views.
- No second commit or sync control in a view.
- No setting that hides a view.
- A team editor. Work / Team (`add-work`) is the one team editor. Settings / Team, if shown, opens Work / Team and holds no second editor.
- Project overrides of a personal preference. `add-projects` owns them, in the project registry (Q-016).

### Acceptance Criteria

- [ ] The sidebar shows Home, Design, Specs, Work, Factory, Code, Knowledge and Settings, in that order for the default role.
- [ ] The Inbox shows a question and an approval, and one click on the approval sends the write.
- [ ] The palette finds a ref and runs an action from the keyboard.
- [ ] The inspector shows backlinks for each entity kind.
- [ ] The commit control and the sync control exist once, in the status bar. The palette and the native menu run the same actions.
- [ ] A new event appears once in the notification centre and once as a system notification.
- [ ] For each role, every view is still reachable.
- [ ] A change in Settings / Me applies in all projects.
- [ ] After a restart, each project opens on its last view.
- [ ] No tour, helper text or tagline shows on first run.
- [ ] Every label shows in French and in English.
- [ ] The native menu lists the global actions, and each item runs the palette action.
- [ ] A context menu opens from the pointer and from the keyboard, and Escape returns focus to the row.
- [ ] A new version appears once in the notification centre.
- [ ] Every shell action has a keyboard path, a focus ring and an assistive label.

### Links

- Consumes: `add-design-system` (Shell template, CommandPalette, Inspector), `add-refs` (search and backlinks), events of `add-sync`, `add-factory`, `add-questions-loop` and `add-delivery`, the commit operation of `add-code`, the sync operation of `add-sync`, the health of `add-projects`, the assistant panel of `add-assistant`.
- Produces: navigation, the palette action registry, the inspector, the notification centre, Home and Settings / Me.

### Legacy parity

| Legacy feature | Shipyard view | REQ ids |
| --- | --- | --- |
| Sidebar and routes | Sidebar, seven spaces and Settings | REQ-001, REQ-009 |
| Top bar | Status bar and palette | REQ-005, REQ-007 |
| Notifications centre | Notification centre | REQ-008 |
| Préférences | Settings / Me | REQ-010 |
| i18n FR and EN | Language in Settings / Me | REQ-011 |
| Tours | Not kept (Q-008) | REQ-016 |
| Context menus | Context menus | REQ-013 |
| Native menu | Native menu | REQ-012 |
| Update check | Update check | REQ-014 |
| Nouveautés (changelog after an update) | Update check, changelog sections | REQ-014 |
| Home widgets of Dashboards | Home / My work and Activity | REQ-003 |
| Reopen last page | Last view per project | REQ-015 |

### Existing References

- `docs/plan/MASTER-PLAN.md` sections 4, 6 and 8.
- `docs/openspec/constitution.md` sections 2, 3 and 4.
- `docs/decisions/0004-seven-spaces-information-architecture.md`
- `docs/delivery/questions/Q-002.md`
- `docs/delivery/questions/Q-008.md`
- `docs/delivery/questions/Q-009.md`

## ADDED Requirements

### Requirement: REQ-001 Sidebar

The sidebar SHALL list the spaces Home, Design, Specs, Work, Factory, Code and Knowledge, and then Settings. The sidebar SHALL be 48 px wide when collapsed and 220 px wide when open. Each entry SHALL carry an icon and a noun.

#### Scenario: Open a space
- GIVEN the sidebar is open
- WHEN the person selects Work
- THEN the main area shows the Work space
- AND the Work entry shows as current

### Requirement: REQ-002 Main area and inspector

The shell SHALL have a main area and an inspector panel. The inspector SHALL open and close without losing the main area state.

#### Scenario: Toggle inspector
- GIVEN a view with a selected item
- WHEN the person closes the inspector
- THEN the main area keeps its scroll position and selection

### Requirement: REQ-003 Home views

The Home space SHALL have the views Inbox, My work and Activity. Inbox SHALL carry the heading "Needs you". My work SHALL list the items assigned to the person. Activity SHALL list recent events of the project. My work and Activity SHALL show the tiles that the person pinned (`add-knowledge` REQ-024).

#### Scenario: Open Home
- GIVEN the person opens Home
- WHEN Home renders
- THEN the three views are available as tabs
- AND Inbox is the first tab

#### Scenario: Pinned tile
- GIVEN the person pinned a tile in Knowledge
- WHEN My work renders
- THEN the tile shows in My work and in Activity

### Requirement: REQ-004 Inbox content

The Inbox SHALL list the open questions of the questions loop and the approvals of factory and delivery. A write without its switch SHALL appear as an approval. One click on the approval SHALL send the write. The default for the switches is all off (working assumption: Q-002, option 1). [NEEDS CLARIFICATION: Q-002 What is the default for automation writes?]

#### Scenario: Approve a pull request write
- GIVEN the switch `pull_request` is off and a run is ready to open a pull request
- WHEN the run asks for the write
- THEN the Inbox shows an approval
- AND one click on it sends the write

#### Scenario: Answer a question
- GIVEN an agent asked a question
- WHEN the person opens the Inbox
- THEN the question shows as a card with its options

### Requirement: REQ-005 Command palette

The command palette SHALL open with a shortcut from any view. It SHALL search the refs of every entity and SHALL run every action of the app. Each action SHALL show its shortcut.

#### Scenario: Jump to a ref
- GIVEN the palette is open
- WHEN the person types a ref such as `wi:KEY-1`
- THEN the palette lists the matching entity
- AND Enter opens it

#### Scenario: Run an action
- GIVEN the palette is open
- WHEN the person types the name of an action and presses Enter
- THEN the action runs and the palette closes

### Requirement: REQ-006 Inspector and backlinks

The inspector SHALL show the selected entity and the list of entities that link to it. Activating a backlink SHALL select that entity.

#### Scenario: Follow a backlink
- GIVEN the inspector shows a spec requirement with two backlinks
- WHEN the person activates a backlink
- THEN the inspector shows the linked entity

### Requirement: REQ-007 Status bar

The status bar SHALL show one commit action, one sync action, the project health and the active runs. No view SHALL show a second commit or sync control. The palette and the native menu run the same action.

#### Scenario: Sync from the status bar
- GIVEN a project is open
- WHEN the person activates the sync action
- THEN the app starts one sync
- AND the action shows its running state

#### Scenario: Health and runs
- GIVEN two runs are active and one health check fails
- WHEN the status bar renders
- THEN it shows the count 2 for runs and a failed health shape and colour

### Requirement: REQ-008 Notifications

One list of event sources SHALL feed both the notification centre and the system notifications. An event SHALL appear once in each. The person SHALL choose in Settings / Me which sources notify.

#### Scenario: New approval
- GIVEN the app is in the background and approval notifications are on
- WHEN a run needs an approval
- THEN a system notification shows
- AND the notification centre lists the event once

### Requirement: REQ-009 Role home

Each role (PM, architect, developer, QA, BA, functional lead, junior) SHALL have a default home view and a sidebar order. The defaults are: PM opens Work, architect opens Design, developer opens Factory, QA, BA and functional lead open Specs, junior opens Knowledge. No role SHALL lose access to a view. A role SHALL change the order and the home view only.

#### Scenario: Junior sidebar
- GIVEN the person has the role junior
- WHEN the app opens
- THEN the main area shows Knowledge
- AND the sidebar still lists all seven spaces and Settings

### Requirement: REQ-010 Settings / Me

Settings / Me SHALL hold theme, contrast, density, fonts, reduced motion, language, shortcuts, notifications and the detected agent CLIs. These values SHALL follow the person and not the project.

#### Scenario: Setting applies everywhere
- GIVEN two projects are known
- WHEN the person chooses the dark theme in Settings / Me
- THEN both projects show the dark theme

### Requirement: REQ-011 Language

The app SHALL ship in French and English. The person SHALL switch the language in Settings / Me. The switch SHALL apply without a restart.

#### Scenario: Switch to French
- GIVEN the language is English
- WHEN the person chooses French
- THEN the sidebar, the palette and the menus show French

### Requirement: REQ-012 Native menu

The native menu SHALL offer the global actions: open project, switch project, sync, commit, open palette, toggle inspector, check for updates and quit. Each item SHALL run the same action as the palette.

#### Scenario: Menu runs an action
- GIVEN a project is open
- WHEN the person chooses sync in the native menu
- THEN the app runs the same sync as the status bar

### Requirement: REQ-013 Context menus

A context menu SHALL open on a secondary click or a keyboard shortcut on an entity. It SHALL list the actions of that entity, each with its shortcut, and no other text.

#### Scenario: Keyboard context menu
- GIVEN a row has focus
- WHEN the person presses the context-menu key
- THEN the menu opens with the actions of that entity
- AND Escape closes it and returns focus to the row

### Requirement: REQ-014 Update check

The app SHALL check for a new version at start and on request. When a new version exists, the app SHALL tell the person through the notification centre. After an update, the app SHALL show the changelog sections of the versions since the last one that ran. The install behaviour is open (working assumption: Q-009, option 1). [NEEDS CLARIFICATION: Q-009 Does the app install an update by itself?]

#### Scenario: New version found
- GIVEN a newer version exists
- WHEN the app starts
- THEN the notification centre lists the update once

#### Scenario: After an update
- GIVEN the app starts on a newer version than the last run
- WHEN the app opens
- THEN it shows the changelog sections of the new versions once

### Requirement: REQ-015 Reopen last view

The app SHALL store the last view of each project on the machine. On open, the app SHALL show that view. When the view no longer exists, the app SHALL show the role home.

#### Scenario: Restart
- GIVEN project A was last on Code / Pull requests
- WHEN the person restarts and opens project A
- THEN the main area shows Code / Pull requests

#### Scenario: Missing view
- GIVEN the stored view no longer exists
- WHEN the person opens the project
- THEN the main area shows the role home

### Requirement: REQ-016 No tour, no hidden tab

The app SHALL NOT show a tour, a help bubble or an onboarding text. The app MUST NOT let a project hide a tab or a space. The first run SHALL be the first-run view of `add-projects` (REQ-001), which owns the role choice and the primary action (working assumption: Q-008, option 1). [NEEDS CLARIFICATION: Q-008 Does Shipyard keep the Legacy tours and the per-project visible tabs?]

#### Scenario: First run
- GIVEN the app starts for the first time
- WHEN the first screen renders
- THEN it shows the first-run view of `add-projects`
- AND it shows no tour or help text

### Requirement: REQ-017 Shell accessibility

Every shell action SHALL be reachable with the keyboard, SHALL show a focus ring and SHALL have a label for assistive technology. The person SHALL move between spaces with a shortcut.

#### Scenario: Keyboard navigation
- GIVEN the app is open
- WHEN the person uses the space shortcuts and Tab
- THEN focus reaches the sidebar, the main area, the inspector and the status bar
- AND each focused item shows a focus ring

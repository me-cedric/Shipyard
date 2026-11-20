# Spec: shell (delta of update-app-redesign)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-19
Change: `change:update-app-redesign`

### Goal

The shell is a rail and a page area. The rail shows the project switch, the six places, Setup and the account row. The page area starts with one top row that holds the Ask bar and the sync mark. Each role opens on its first page.

### Why

`adr:0023` replaces the eight spaces with six places. The Ask bar replaces the command palette (`spec:app-redesign#REQ-004`). The menu keeps one order for every role (`spec:app-redesign#REQ-006`). The review of 2026-11-16 found four layers of controls before the content: look pass 1 removes the top bar and the status bar, and moves each of their controls to the rail, the top row, the card of the sync mark, the account menu or the Ask bar.

### Requirements

- REQ-001: The rail SHALL list the places Today, Flow, Plan, Crew, Library and Code, and then Setup. Each entry SHALL carry an icon and a noun. The project switch SHALL sit at the top of the rail, and the account row SHALL sit at its foot. Today SHALL show the count of the things that need the person, Flow the count of the live runs, and Code the count of the changed files. The rail SHALL be 72 px wide when collapsed and 216 px wide when open, and the person SHALL be able to set the open width from 180 px to 320 px. A collapsed rail SHALL show icons only, and each control SHALL keep its spoken name.
- REQ-005: The palette shortcut SHALL move the focus to the Ask bar from any view. The Ask bar SHALL search the refs of every entity and SHALL run every action of the app. Each action SHALL show its shortcut. The open Ask bar SHALL show as one centred column over the page area. The Ask bar SHALL list Files and Terminal with its actions.
- REQ-009: Each role of `team-rights` SHALL open on its first page, as `team-rights` REQ-013 lists. The menu SHALL keep its order for every role. A role MAY hide a place or a view with the level `none` of `team-rights` REQ-018. A role SHALL change the first page, the Today panels and the rights of `team-rights`. A right SHALL turn a control off, never hide a view.
- REQ-012: The native menu SHALL offer the global actions: open project, switch project, sync, commit, open palette, toggle inspector, check for updates and quit. Each item SHALL run the same action as the Ask bar.
- REQ-017: Every shell action SHALL be reachable with the keyboard, SHALL show a focus ring and SHALL have a label for assistive technology. The person SHALL move between places with a shortcut.
- REQ-018: The account row SHALL open the account menu. The menu SHALL hold a header row with the name and the role of the person that opens Setup / Me, the theme (Light, Dark, System), the language, the manual of the page, the keyboard shortcuts, What's new, Replay the tour, Check for updates, the version of the app, and the project health with the count of its findings. F1 SHALL still open the manual.
- REQ-019: The first run and the page "No project is open" SHALL show alone: no rail and no top row. The skip link, the shortcuts, the folder drop, the close guard and the dialogs SHALL stay active on these pages. The first run SHALL show at a first launch only; after Close project, "No project is open" SHALL show as one card.
- REQ-020: Each control of the top bar and of the status bar of before this change SHALL stay reachable in its new home, with the same role and the same name. An inventory test SHALL find each control.
- REQ-021: The shell SHALL NOT have a top bar or a status bar. The page area SHALL start with one top row: the rail toggle, Back, Forward, the Ask bar and the sync mark. The sync mark SHALL say the state of the repository in words. It SHALL open a card with what waits (the changed files, the lines added and removed, the watch notice, the sync failure with its retry action), the working branch, and the actions Sync, Fetch only, Push and Commit. Sync SHALL show the ahead and behind counts. While the card is closed, the top row SHALL still announce the watch notice and the sync failure. The card, the Ask bar and the native menu SHALL run the same commit action and the same sync action. The rail SHALL show the count of the live runs on Flow, and the account menu SHALL show the project health.
- REQ-007 (removed): the status bar. REQ-021 replaces it.

### Homes of the moved controls

| Control of before | New home |
| --- | --- |
| Hide sidebar, Back, Forward, the Ask bar | Top row |
| Project picture, project switch and its menu | Rail, top |
| Account | Rail, foot: the account row |
| Sync state | Top row, right end: the sync mark |
| Working branch | Card of the sync mark, and the action row of Code / Now |
| Sync with the ahead and behind counts, Fetch only, Push | Card of the sync mark |
| Commit, the changed files, the lines added and removed | Card of the sync mark. The commit box of Code / Now stays |
| Watch notice, sync failure and its retry action | Card of the sync mark, and hidden text in the top row while the card is closed |
| Files | Ask bar, and a door on Code / Now |
| Terminal | Ask bar, and the action row of Code / Now |
| More (Files and Terminal under 1100 px) | Removed: the Ask bar holds its two items |
| Setup / Me, Theme, the manual, Keyboard shortcuts, What's new, Replay the tour | Account menu |
| Version | Account menu, row "About Shipyard" |
| Health | Account menu, last item |

### Non-Goals

- A change of the notifications or the inspector rules of `shell`.
- A Sign out action: the app has no sign-out action.
- The pages of a place: later passes rebuild them on the shared parts.

### Acceptance Criteria

- [ ] The rail lists the six places and Setup, with the project switch at its top and the account row at its foot.
- [ ] The shell has no top bar and no status bar, and the page area starts with the top row.
- [ ] The sync mark opens a card with what waits and the sync actions.
- [ ] The palette shortcut moves the focus to the Ask bar, and an action runs from it.
- [ ] A role opens on its first page, and the menu order is the same for every role.
- [ ] The first run and "No project is open" show without the rail and the top row.
- [ ] The inventory test finds each control of the old top bar and of the old status bar. Test: `src/features/shell/inventory.test.tsx`.

### Existing References

- Supersedes or extends: `spec:shell#REQ-001`, `spec:shell#REQ-005`, `spec:shell#REQ-009`, `spec:shell#REQ-012`, `spec:shell#REQ-017`.
- Removes: REQ-007 of `shell` (the status bar). `spec:shell#REQ-021` replaces it.
- Supersedes the top bar and status bar requirements of `change:update-ux-declutter` (its REQ-009 to REQ-013).
- Decision: `adr:0023`.

## MODIFIED Requirements

### Requirement: REQ-001 Sidebar

The rail SHALL list the places Today, Flow, Plan, Crew, Library and Code, and then Setup. Each entry SHALL carry an icon and a noun. The project switch SHALL sit at the top of the rail, and the account row SHALL sit at its foot. Today SHALL show the count of the things that need the person, Flow the count of the live runs, and Code the count of the changed files. The rail SHALL be 72 px wide when collapsed and 216 px wide when open, and the person SHALL be able to set the open width from 180 px to 320 px. A collapsed rail SHALL show icons only, and each control SHALL keep its spoken name.

Screen: SCR-036

#### Scenario: Open a space
- GIVEN the sidebar is open
- WHEN the person selects Plan
- THEN the main area shows Plan
- AND the Plan entry shows as current

#### Scenario: Collapsed rail
- GIVEN the rail is open
- WHEN the person activates "Hide sidebar" in the top row
- THEN the rail is 72 px wide and shows icons only
- AND the project switch and the account row keep their spoken names

#### Scenario: Switch the project
- GIVEN two projects are known
- WHEN the person opens the project switch at the top of the rail and selects the other project
- THEN the app opens that project

### Requirement: REQ-005 Command palette

The palette shortcut SHALL move the focus to the Ask bar from any view. The Ask bar SHALL search the refs of every entity and SHALL run every action of the app. Each action SHALL show its shortcut. The open Ask bar SHALL show as one centred column over the page area. The Ask bar SHALL list Files and Terminal with its actions.

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

#### Scenario: Open the terminal
- GIVEN the Ask bar has the focus
- WHEN the person types "Terminal" and presses Enter
- THEN the terminal drawer opens

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

### Requirement: REQ-012 Native menu

The native menu SHALL offer the global actions: open project, switch project, sync, commit, open palette, toggle inspector, check for updates and quit. Each item SHALL run the same action as the Ask bar.

#### Scenario: Menu runs an action
- GIVEN a project is open
- WHEN the person chooses sync in the native menu
- THEN the app runs the same sync as the card of the sync mark

### Requirement: REQ-017 Shell accessibility

Every shell action SHALL be reachable with the keyboard, SHALL show a focus ring and SHALL have a label for assistive technology. The person SHALL move between places with a shortcut.

#### Scenario: Keyboard navigation
- GIVEN the app is open
- WHEN the person uses the place shortcuts and Tab
- THEN focus reaches the rail, the top row, the main area and the inspector
- AND each focused item shows a focus ring

## ADDED Requirements

### Requirement: REQ-018 Account menu

The account row SHALL open the account menu. The menu SHALL hold a header row with the name and the role of the person that opens Setup / Me, the theme (Light, Dark, System), the language, the manual of the page, the keyboard shortcuts, What's new, Replay the tour, Check for updates, the version of the app, and the project health with the count of its findings. F1 SHALL still open the manual.

Screen: SCR-028

#### Scenario: Open the account menu
- GIVEN a project is open
- WHEN the person activates the account row at the foot of the rail
- THEN the menu shows the theme, the language, the manual, the keyboard shortcuts, What's new, Replay the tour and Check for updates
- AND the menu shows the version of the app and the Health item

#### Scenario: Change the theme
- GIVEN the account menu is open
- WHEN the person selects Dark in the theme row
- THEN the interface shows in the Dark theme

### Requirement: REQ-019 Pages without the shell

The first run and the page "No project is open" SHALL show alone: no rail and no top row. The skip link, the shortcuts, the folder drop, the close guard and the dialogs SHALL stay active on these pages. The first run SHALL show at a first launch only; after Close project, "No project is open" SHALL show as one card.

Screen: SCR-030

#### Scenario: First run
- GIVEN the app starts for the first time
- WHEN the first screen renders
- THEN the page shows no rail and no top row

#### Scenario: Close project
- GIVEN the person has opened a project before
- WHEN the person closes the project
- THEN the card "No project is open" shows and the first run does not

#### Scenario: No project is open
- GIVEN the person closed the project
- WHEN the page "No project is open" renders
- THEN the page shows no rail and no top row
- AND the page offers to make a new project, to clone a repository, to open a local folder and to open the Projects page

### Requirement: REQ-020 Moved controls

Each control of the top bar and of the status bar of before this change SHALL stay reachable in its new home, with the same role and the same name. An inventory test SHALL find each control.

#### Scenario: Inventory
- GIVEN the fixed list of the controls of the top bar and of the status bar of before this change
- WHEN the inventory test runs
- THEN it finds each control by its role and its name in its new home

### Requirement: REQ-021 Top row and sync mark

The shell SHALL NOT have a top bar or a status bar. The page area SHALL start with one top row: the rail toggle, Back, Forward, the Ask bar and the sync mark. The sync mark SHALL say the state of the repository and SHALL open a card with what waits, the working branch and the actions Sync, Fetch only, Push and Commit. The card, the Ask bar and the native menu SHALL run the same commit action and the same sync action.

Screen: SCR-097

#### Scenario: No bars
- GIVEN a project is open
- WHEN the shell renders
- THEN the shell shows no top bar and no status bar
- AND the page area starts with the rail toggle, Back, Forward, the Ask bar and the sync mark

#### Scenario: Sync from the sync mark
- GIVEN a project is open
- WHEN the person opens the sync mark and activates Sync
- THEN the app starts one sync
- AND the action shows its running state

#### Scenario: What waits
- GIVEN five changed files and two commits ahead
- WHEN the person opens the sync mark
- THEN the card shows the count 5 as a link to Code / Now
- AND Sync shows 2 ahead

#### Scenario: Sync failure
- GIVEN a sync failed
- WHEN the top row renders
- THEN the sync mark says "Sync failed"
- AND the card shows the failure and its retry action

#### Scenario: Health and runs
- GIVEN two runs are active and one health check fails
- WHEN the person opens the account menu
- THEN the rail shows the count 2 on Flow
- AND the Health item shows the count 1 and a failed health shape and colour

## REMOVED Requirements

### Requirement: REQ-007 Status bar

**Reason**: Look pass 1 of the redesign removed the status bar and the top bar. Their controls have new homes.

**Migration**: `spec:shell#REQ-021` holds the commit action, the sync action and the active runs. `spec:shell#REQ-018` holds the project health. `spec:shell#REQ-020` keeps each moved control reachable.

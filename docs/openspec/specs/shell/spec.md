# Spec: shell

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `docs/openspec/changes/archive/2026-10-31-add-shell/`

### Goal

Give Shipyard one frame: seven spaces and Settings, one place for each action, and one home view per role.

### Why

The earlier tool has 40 routes, 12 sidebar groups and four stacked filters that hide pages. The same action (commit, pull) sits in many places. People need to find their work without a map.

### Users And Scenarios

- PM: opens on Work and sees assigned items and approvals in Home.
- Architect: opens on Design and jumps to any ref from the palette.
- Developer: opens on Factory, sees active runs in the status bar and commits from one place.
- QA: opens on Specs and finds questions and test plans in the Inbox and the palette.
- BA: answers questions from the Inbox.
- Functional lead: approves writes from the Inbox with one click.
- Junior: opens on Knowledge and uses the inspector to read backlinks.

### Requirement list

- REQ-001: The rail SHALL list the places Today, Flow, Plan, Crew, Library and Code, and then Setup. Each entry SHALL carry an icon and a noun. The project switch SHALL sit at the top of the rail, and the account row SHALL sit at its foot. Today SHALL show the count of the things that need the person, Flow the count of the live runs, and Code the count of the changed files. The rail SHALL be 72 px wide when collapsed and 216 px wide when open, and the person SHALL be able to set the open width from 180 px to 320 px. A collapsed rail SHALL show icons only, and each control SHALL keep its spoken name.
- REQ-002: The shell has a main area and an inspector panel.
- REQ-003: Home has two views: Today and Projects (`home-today` REQ-001). Today holds Needs you, the person's tickets and agents, and what changed since the last visit.
- REQ-004: The Inbox lists questions and approvals.
- REQ-005: The palette shortcut SHALL move the focus to the Ask bar from any view. The Ask bar SHALL search the refs of every entity and SHALL run every action of the app. Each action SHALL show its shortcut. The open Ask bar SHALL show as one centred column over the page area. The Ask bar SHALL list Files and Terminal with its actions.
- REQ-006: The inspector shows the selected entity and its backlinks.
- REQ-007 (removed): the status bar. REQ-021 replaces it.
- REQ-008: One source list of events feeds the notification centre and the system notifications.
- REQ-009: Each role of `team-rights` SHALL open on its first page, as `team-rights` REQ-013 lists. The menu SHALL keep its order for every role. A role MAY hide a place or a view with the level `none` of `team-rights` REQ-018. A role SHALL change the first page, the Today panels and the rights of `team-rights`. A right SHALL turn a control off, never hide a view.
- REQ-010: Settings / Me holds the settings that follow the person.
- REQ-011: The app ships in French and English, and the person switches the language.
- REQ-012: The native menu SHALL offer the global actions: open project, switch project, sync, commit, open palette, toggle inspector, check for updates and quit. Each item SHALL run the same action as the Ask bar.
- REQ-013: Context menus offer the actions of the entity under the pointer.
- REQ-014: The app checks for updates and tells the person. After an update, the app shows the changelog sections of the new version.
- REQ-015: The app reopens the last view of each project.
- REQ-016: No tour and no help text. A project or a right MUST NOT hide a tab or a space. Only the level `none` of a role hides an area (`team-rights` REQ-018). A person MAY hide a tab for themselves on this machine. The palette SHALL still open it, and Settings / Me SHALL never hide.
- REQ-017: Every shell action SHALL be reachable with the keyboard, SHALL show a focus ring and SHALL have a label for assistive technology. The person SHALL move between places with a shortcut.
- REQ-018: The account row SHALL open the account menu. The menu SHALL hold a header row with the name and the role of the person that opens Setup / Me, the theme (Light, Dark, System), the language, the manual of the page, the keyboard shortcuts, What's new, Replay the tour, Check for updates, the version of the app, and the project health with the count of its findings. F1 SHALL still open the manual.
- REQ-019: The first run and the page "No project is open" SHALL show alone: no rail and no top row. The skip link, the shortcuts, the folder drop, the close guard and the dialogs SHALL stay active on these pages. The first run SHALL show at a first launch only; after Close project, "No project is open" SHALL show as one card.
- REQ-020: Each control of the top bar and of the status bar of before this change SHALL stay reachable in its new home, with the same role and the same name. An inventory test SHALL find each control.
- REQ-021: The shell SHALL NOT have a top bar or a status bar. The page area SHALL start with one top row: the rail toggle, Back, Forward, the Ask bar, the sync mark, and the Assistant and Terminal buttons. The sync mark SHALL say the state of the repository in words. It SHALL open a card with what waits (the changed files, the lines added and removed, the watch notice, the sync failure with its retry action), the working branch, and the actions Sync, Fetch only, Push and Commit. Sync SHALL show the ahead and behind counts. While the card is closed, the top row SHALL still announce the watch notice and the sync failure. The card, the Ask bar and the native menu SHALL run the same commit action and the same sync action. The rail SHALL show the count of the live runs on Flow, and the account menu SHALL show the project health.

### Non-Goals

- No page content of a space. Each space capability owns its views.
- No second commit or sync control in a view.
- No setting that hides a view.
- A team editor. Work / Team (`add-work`) is the one team editor. Settings / Team does not exist: the path `/settings/team` redirects to Work / Team and holds no second editor.
- Project overrides of a personal preference. `add-projects` owns them, in the project registry (Q-016).

### Acceptance Criteria

- [x] The sidebar shows Home, Design, Specs, Work, Factory, Code, Knowledge and Settings, in that order for the default role. Test: `src/features/shell/routes.test.tsx`, `e2e/smoke.spec.ts`.
- [x] The Inbox shows a question and an approval, and one click on the approval sends the write. Test: `src/features/home/home.test.tsx`.
- [x] The palette finds a ref and runs an action from the keyboard. Test: `src/features/shell/palette.test.tsx`, `src/features/shell/refs.test.tsx`, `e2e/smoke.spec.ts`.
- [x] The inspector shows backlinks for each entity kind. Test: `src/features/shell/refs.test.tsx`, `src/features/shell/inspector.test.tsx`.
- [x] The commit control and the sync control exist once, in the status bar. The palette and the native menu run the same actions. Test: `src/features/shell/statusbar.test.tsx`, `src/features/shell/notifications.test.tsx`.
- [x] A new event appears once in the notification centre and once as a system notification. Test: `src/features/shell/notifications.test.tsx`, `src/features/shell/needs-you.test.tsx`.
- [x] For each role, every view is still reachable. Test: `src/features/shell/routes.test.tsx`.
- [x] A change in Settings / Me applies in all projects. Test: `src/features/settings/me/me.test.tsx`.
- [x] After a restart, each project opens on its last view. Test: `e2e/shell.spec.ts`.
- [x] No tour, helper text or tagline shows on first run. Test: `e2e/shell.spec.ts`, `src/features/shell/routes.test.tsx`.
- [x] Every label shows in French and in English. Test: `src/lib/i18n/i18n.test.tsx`, `src/features/shell/notifications.test.tsx`.
- [x] The native menu lists the global actions, and each item runs the palette action. Test: `src/features/shell/notifications.test.tsx`.
- [x] A context menu opens from the pointer and from the keyboard, and Escape returns focus to the row. Test: `e2e/shell-events.spec.ts`.
- [x] A new version appears once in the notification centre. Test: `src/features/shell/notifications.test.tsx`, `e2e/shell-events.spec.ts`.
- [x] Every shell action has a keyboard path, a focus ring and an assistive label. Test: `e2e/shell.spec.ts`, `e2e/a11y.spec.ts`.

### Links

- Consumes: `add-design-system` (Shell template, CommandPalette, Inspector), `add-refs` (search and backlinks), events of `add-sync`, `add-factory`, `add-questions-loop` and `add-delivery`, the commit operation of `add-code`, the sync operation of `add-sync`, the health of `add-projects`, the assistant panel of `add-assistant`.
- Produces: navigation, the palette action registry, the inspector, the notification centre, Home and Settings / Me.

### Feature list

| Feature | Shipyard view | REQ ids |
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
| Home views | Home / Today and Projects | REQ-003 |
| Reopen last page | Last view per project | REQ-015 |

### Existing References

- `docs/plan/MASTER-PLAN.md` sections 4, 6 and 8.
- `docs/openspec/constitution.md` sections 2, 3 and 4.
- `docs/decisions/0004-seven-spaces-information-architecture.md`
- `docs/delivery/questions/Q-002.md`
- `docs/delivery/questions/Q-008.md`
- `docs/delivery/questions/Q-009.md`

### Clarifications

- Q-002 What is the default for automation writes?: All off. Each write waits for one click in Home / Inbox. An admin turns each one on per project.
- Q-009 Does the app install an update by itself?: Tell the person only. The person starts the install.
- Q-008 Does Shipyard keep the tours and the per-project visible tabs?: Drop both. First run shows the project picker and the role choice only.

## Requirements

### Requirement: REQ-001 Sidebar

The rail SHALL list the places Today, Flow, Plan, Crew, Library and Code, and then Setup. Each entry SHALL carry an icon and a noun. The project switch SHALL sit at the top of the rail, and the account row SHALL sit at its foot. Today, Flow and Code SHALL show a count. The rail SHALL be collapsible, and a collapsed rail SHALL show icons only with a spoken name for each control.

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

#### Scenario: Rail counts
- GIVEN two things need the person, three runs are live and four files changed
- WHEN the rail shows
- THEN Today shows 2, Flow shows 3 and Code shows 4

#### Scenario: Rail widths
- GIVEN the rail is collapsed or open
- WHEN the person sets the open width
- THEN the collapsed rail is 72 px wide and the open rail is 216 px wide by default
- AND the open width ranges from 180 px to 320 px

#### Scenario: Switch the project
- GIVEN two projects are known
- WHEN the person opens the project switch at the top of the rail and selects the other project
- THEN the app opens that project

### Requirement: REQ-002 Main area and inspector

The shell SHALL have a main area and an inspector panel. The inspector SHALL open and close without losing the main area state.

#### Scenario: Toggle inspector
- GIVEN a view with a selected item
- WHEN the person closes the inspector
- THEN the main area keeps its scroll position and selection

### Requirement: REQ-003 Home views

The Home space SHALL have the views Today and Projects, as `home-today` REQ-001 to REQ-008 describe. Today SHALL carry the "Needs you" section of the Inbox (REQ-004).

#### Scenario: Open Home
- GIVEN the person opens Home
- WHEN Home renders
- THEN the tabs are Today and Projects
- AND Today is open

### Requirement: REQ-004 Inbox content

The Inbox SHALL list the open questions of the questions loop and the approvals of factory and delivery. A write without its switch SHALL appear as an approval. One click on the approval SHALL send the write. The default for the switches is all off (working assumption: Q-002, option 1). All off. Each write waits for one click in Home / Inbox. An admin turns each one on per project.

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

### Requirement: REQ-006 Inspector and backlinks

The inspector SHALL show the selected entity and the list of entities that link to it. Activating a backlink SHALL select that entity.

#### Scenario: Follow a backlink
- GIVEN the inspector shows a spec requirement with two backlinks
- WHEN the person activates a backlink
- THEN the inspector shows the linked entity

### Requirement: REQ-008 Notifications

One list of event sources SHALL feed both the notification centre and the system notifications. An event SHALL appear once in each. The person SHALL choose in Settings / Me which sources notify.

#### Scenario: New approval
- GIVEN the app is in the background and approval notifications are on
- WHEN a run needs an approval
- THEN a system notification shows
- AND the notification centre lists the event once

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

### Requirement: REQ-010 Settings / Me

Settings / Me SHALL hold theme, contrast, density, fonts, reduced motion, language, shortcuts, notifications and the detected agent CLIs. These values SHALL follow the person and not the project.

#### Scenario: Setting applies everywhere
- GIVEN two projects are known
- WHEN the person chooses the dark theme in Settings / Me
- THEN both projects show the dark theme

### Requirement: REQ-011 Language

The app SHALL ship in English, French, German and Spanish. The person SHALL switch the language in Settings / Me. The switch SHALL apply without a restart. A language pack MAY add a language (spec `languages`).

#### Scenario: Switch to French
- GIVEN the language is English
- WHEN the person chooses French
- THEN the sidebar, the palette and the menus show French

#### Scenario: Switch to German
- GIVEN the language is English
- WHEN the person chooses German
- THEN the sidebar, the palette and the menus show German

### Requirement: REQ-012 Native menu

The native menu SHALL offer the global actions: open project, switch project, sync, commit, open palette, toggle inspector, check for updates and quit. Each item SHALL run the same action as the Ask bar.

#### Scenario: Menu runs an action
- GIVEN a project is open
- WHEN the person chooses sync in the native menu
- THEN the app runs the same sync as the card of the sync mark

### Requirement: REQ-013 Context menus

A context menu SHALL open on a secondary click or a keyboard shortcut on an entity. It SHALL list the actions of that entity, each with its shortcut, and no other text.

#### Scenario: Keyboard context menu
- GIVEN a row has focus
- WHEN the person presses the context-menu key
- THEN the menu opens with the actions of that entity
- AND Escape closes it and returns focus to the row

### Requirement: REQ-014 Update check

The app SHALL check for a new version at start and on request. When a new version exists, the app SHALL tell the person through the notification centre. After an update, the app SHALL show the changelog sections of the versions since the last one that ran. The install behaviour is open (working assumption: Q-009, option 1). Tell the person only. The person starts the install.

#### Scenario: New version found
- GIVEN a newer version exists
- WHEN the app starts
- THEN the notification centre lists the update once

#### Scenario: Release address
- GIVEN the person set a release address in Settings / Me
- WHEN the app checks for a new version
- THEN it reads that address, and the default is the latest release of the Shipyard repository

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

The app SHALL NOT show a tour, a help bubble or an onboarding text. A project or a right MUST NOT hide a tab or a space from a person. Only the level `none` of a role hides an area (`team-rights` REQ-018). A person MAY hide a tab or a space for themselves, on this machine. The palette SHALL still open a tab that the person hid, and Settings / Me SHALL never hide. The first run SHALL be the first-run view of `projects` REQ-001, which owns the role choice (Q-008, option 1).

#### Scenario: First run
- GIVEN the app starts for the first time
- WHEN the first screen renders
- THEN it shows the first-run view of `add-projects`
- AND it shows no tour or help text

#### Scenario: Personal hidden tab
- GIVEN the person hid Code / Terminal for themselves
- WHEN the person runs Open Code / Terminal from the palette
- THEN the main area shows Code / Terminal

### Requirement: REQ-017 Shell accessibility

Every shell action SHALL be reachable with the keyboard, SHALL show a focus ring and SHALL have a label for assistive technology. The person SHALL move between places with a shortcut.

#### Scenario: Keyboard navigation
- GIVEN the app is open
- WHEN the person uses the place shortcuts and Tab
- THEN focus reaches the rail, the top row, the main area and the inspector
- AND each focused item shows a focus ring

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

The shell SHALL NOT have a top bar or a status bar. The page area SHALL start with one top row: the rail toggle, Back, Forward, the Ask bar, the sync mark, and the Assistant and Terminal buttons. The sync mark SHALL say the state of the repository and SHALL open a card with what waits, the working branch and the actions Sync, Fetch only, Push and Commit. The card, the Ask bar and the native menu SHALL run the same commit action and the same sync action.

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

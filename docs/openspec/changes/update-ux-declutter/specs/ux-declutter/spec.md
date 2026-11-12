# Spec: ux-declutter

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-12
Change: `change:update-ux-declutter`

### Goal

A person finds each thing in one place, a new person knows the next step at the first launch, and each screen uses the same patterns and the same quiet motion.

### Why

The same counts, lists and actions show in two or three places, the first launch shows two guides at once, and the pages do not share their patterns. No feature is removed.

### Users And Scenarios

- Junior with little technical knowledge: opens Shipyard for the first time, opens a project, follows one checklist, and reads a term's meaning on hover.
- PM: reads what waits in one Activity panel, not in three counters.
- Developer: toggles the terminal and the assistant from a shorter top bar, and keeps every shortcut.
- A person with the motion preference set to reduced: sees no movement anywhere.

### Requirements

First run

- REQ-001: One "Get started" checklist SHALL replace the Setup card and the Get started card. Its items, in order: project, AI tool, models, issue tracker, code host, team, permissions, first decision, first spec, first assigned ticket, first run.
- REQ-002: Each checklist item SHALL have one rule for "done", in one module. The AI tool is done when a default tool is set, installed, and not signed out. The issue tracker and the code host are done when the project is linked to a connection. The team is done when the team file has an admin. The action label SHALL name the real next step (Install, Sign in, Choose, Connect).
- REQ-003: Home / Today SHALL show the checklist as one card while an item is to do. Settings / Me SHALL show the same card. The card SHALL hide on Today when no item is to do.
- REQ-004: The tour SHALL NOT open at the first launch. It SHALL open once, when the first project is open. Each way to leave the tour, a setup action included, SHALL mark it as seen.
- REQ-005: The role step of the first-run page SHALL have a Continue button.
- REQ-006: One no-project page SHALL serve every space. It SHALL offer Open a folder, Clone a repository and New project.
- REQ-007: An empty page that needs a missing set-up step SHALL name the step and give its action: Factory / Runs with no AI tool, Work / Backlog with no issue tracker. The permissions list SHALL show the loading pattern while it loads. Install of an AI tool SHALL ask for a click on a confirmation that names what it installs.
- REQ-008: A glossary SHALL explain these terms in the checklist, the tour and the empty pages: issue tracker, code host, AI tool, model, spec, decision, run, pull request. Hover or keyboard focus on a marked term SHALL show one sentence and a link to the manual.

Top bar and duplicates

- REQ-009: One Activity button SHALL replace the live runs, sessions and needs-you controls of the top bar. It SHALL show the needs-you count and a mark while a run or a session is active. Its panel SHALL have three parts: Needs you (link to Home / Today), Runs (stop, link to Factory / Runs), Sessions (stop, link to Factory / Sessions).
- REQ-010: The avatar SHALL open a menu with Settings / Me, Theme (light, dark, system), Manual, Shortcuts, What's new and Replay the tour. The "?" button and the theme button SHALL leave the top bar. F1 SHALL still open the manual.
- REQ-011: One Ask split button SHALL replace the assistant button and the Ask menu. The main part SHALL toggle the assistant panel. The chevron SHALL open the Ask items.
- REQ-012: The Sync button SHALL show the ahead and behind counts. The status bar SHALL show the count of changed files beside Commit. The repository chip SHALL leave the top bar.
- REQ-013: At a window width of 1100 px or more, the top bar SHALL show 13 controls or fewer.
- REQ-014: Code / Terminal and Knowledge / Manual SHALL leave the tab bars. The address of Code / Terminal SHALL open the terminal drawer. The address of Knowledge / Manual SHALL still show the manual. The palette and the native menu SHALL keep their entries.
- REQ-015: Home / Today SHALL show no stat tiles. The count of the person's items and the spend of today SHALL show in the headings of their panels.
- REQ-016: Each action and each view that a person reaches before this change SHALL stay reachable from a visible control and from the palette.

Shared patterns

- REQ-017: Each tab of each space SHALL show a visible page header with its icon and its title, also while it loads.
- REQ-018: A page that loads SHALL show the shared loading pattern. A page with no content SHALL show the shared empty pattern. No page SHALL show nothing or bare text in these states.
- REQ-019: Each Settings page with two sections or more SHALL show the section list.
- REQ-020: The team rights tables, the Work / Team members table and the learning paths table SHALL use the shared data table.
- REQ-021: Each tab in a tab bar SHALL show an icon and its name.
- REQ-022: An inner tab row SHALL move its selection mark with the same sliding pill and the same timing as the main tab bar.

Motion

- REQ-023: One source SHALL tell each animation whether to move: the system reduced-motion setting or the motion preference of the person stops all of them, CSS, script, scroll and canvas included.
- REQ-024: A toast SHALL slide in and out. A removed list row SHALL leave with motion. Loaded content SHALL fade in over its loading pattern. The sidebar, the inspector and the drawers SHALL move on the shared springs.
- REQ-025: Each transition SHALL take its timing from the shared springs or the duration tokens.

Languages

- REQ-026: Each new text SHALL ship in English, French, German and Spanish.

### Non-Goals

- A new feature, a new page or a new setting.
- A change of the seven spaces or of the order of the sidebar.
- Decorative motion: shared-element moves, celebrations, page entrance effects.
- The per-project picks and overrides of Settings / Project, fetch and push in Code / Branches, the project actions of Home / Projects: they stay.

### Acceptance Criteria

- [ ] Today shows one checklist; an item is done on Today and in Settings / Me at the same time.
- [ ] A fresh install shows the first-run page and no tour; the tour opens once after the first project opens, and never again after a setup action.
- [ ] Each space with no project offers Open a folder, Clone and New project.
- [ ] Focus on a marked term shows its sentence and a link to the manual.
- [ ] The top bar shows 13 controls or fewer at 1100 px.
- [ ] The Activity panel stops a run and a session.
- [ ] The avatar menu changes the theme and opens the manual, the shortcuts, What's new and the tour.
- [ ] `/code/terminal` opens the terminal drawer; `/knowledge/manual` shows the manual; neither is a tab.
- [ ] Today shows no stat tiles; the two numbers show in panel headings.
- [ ] An inventory test lists each palette action and each route that exists before the change and finds it after.
- [ ] Each tab shows a header while it loads; the a11y end-to-end tests pass.
- [ ] With the motion preference on reduced, no element moves (count-up, graph, section scroll included).
- [ ] A toast and a removed run row move in and out.
- [ ] Each new text exists in the four languages.

### Existing References

- Existing code/docs/specs: `specs/shell`, `specs/home-today`, `specs/design-system`, `changes/add-onboarding-tour`, `changes/add-visual-cues` (tab icons were "later" there), adr:0014 (visual language v2, the three springs).
- Supersedes or extends: `add-onboarding-tour` REQ-001, REQ-005 and REQ-013.

## ADDED Requirements

### Requirement: REQ-001 One checklist

One "Get started" checklist SHALL replace the Setup card and the Get started card, with eleven items in a fixed order.

#### Scenario: One card

- GIVEN a project with nothing set up
- WHEN the person opens Home / Today
- THEN one checklist shows the eleven items in order

### Requirement: REQ-002 One rule for done

Each checklist item SHALL have one rule for "done", and its action label SHALL name the real next step.

#### Scenario: Same state in both places

- GIVEN the project is linked to an issue tracker connection
- WHEN the person opens Today and then Settings / Me
- THEN the issue tracker item is done in both

#### Scenario: Label follows the state

- GIVEN the default AI tool is installed and signed out
- WHEN the checklist shows
- THEN the AI tool action says Sign in

### Requirement: REQ-003 Where the checklist shows

Home / Today SHALL show the checklist while an item is to do, and Settings / Me SHALL show the same card.

#### Scenario: All done

- GIVEN no item is to do
- WHEN the person opens Home / Today
- THEN the checklist does not show

### Requirement: REQ-004 Tour after the first project

The tour SHALL NOT open at the first launch. It SHALL open once when the first project is open, and each way to leave it SHALL mark it as seen.

#### Scenario: Fresh install

- GIVEN a fresh install with no project
- WHEN the app starts
- THEN the first-run page shows and the tour does not

#### Scenario: First project

- GIVEN the tour was never seen
- WHEN the first project opens
- THEN the tour opens at step 1

#### Scenario: Left by a setup action

- GIVEN the tour is open
- WHEN the person clicks a setup action in a step
- THEN the tour does not open at the next launch

### Requirement: REQ-005 Continue on the role step

The role step of the first-run page SHALL have a Continue button.

#### Scenario: Continue

- GIVEN the role step
- WHEN the person picks a role and clicks Continue
- THEN the open-a-project step shows

### Requirement: REQ-006 One no-project page

One no-project page SHALL serve every space and SHALL offer Open a folder, Clone a repository and New project.

#### Scenario: Any space

- GIVEN no project is open
- WHEN the person opens Work, Specs, Code, Design, Factory or Knowledge
- THEN the page offers the three ways to open a project

### Requirement: REQ-007 Empty pages name the missing step

An empty page that needs a missing set-up step SHALL name the step and give its action. Install of an AI tool SHALL ask for a confirmation that names what it installs.

#### Scenario: Runs with no AI tool

- GIVEN a project with no AI tool
- WHEN the person opens Factory / Runs
- THEN the page names the AI tool as missing and offers to set it up

#### Scenario: Install asks first

- GIVEN an AI tool that is not installed
- WHEN the person clicks Install
- THEN a confirmation names what it installs before anything runs

### Requirement: REQ-008 Glossary

A glossary SHALL explain the marked terms on hover and on keyboard focus, with one sentence and a link to the manual.

#### Scenario: Focus on a term

- GIVEN the checklist shows "Code host"
- WHEN the term gets the keyboard focus
- THEN one sentence and a link to the manual show

### Requirement: REQ-009 Activity button

One Activity button SHALL replace the live runs, sessions and needs-you controls, with a panel of three parts.

#### Scenario: Stop from the panel

- GIVEN one live run and one active session
- WHEN the person opens the Activity panel
- THEN each has a stop action and a link to its page

### Requirement: REQ-010 Avatar menu

The avatar SHALL open a menu with Settings / Me, Theme, Manual, Shortcuts, What's new and Replay the tour. F1 SHALL still open the manual.

#### Scenario: Theme from the menu

- GIVEN the dark theme
- WHEN the person picks Light in the avatar menu
- THEN the app shows the light theme

### Requirement: REQ-011 Ask split button

One Ask split button SHALL toggle the assistant panel, and its chevron SHALL open the Ask items.

#### Scenario: Toggle

- GIVEN the assistant panel is closed
- WHEN the person clicks Ask
- THEN the panel opens

### Requirement: REQ-012 Repository state

The Sync button SHALL show the ahead and behind counts, and the status bar SHALL show the count of changed files beside Commit.

#### Scenario: Changed files

- GIVEN five changed files and two commits ahead
- WHEN the shell shows
- THEN Sync shows 2 ahead and the status bar shows 5 beside Commit

### Requirement: REQ-013 Top bar size

At a window width of 1100 px or more, the top bar SHALL show 13 controls or fewer.

#### Scenario: Count

- GIVEN a window of 1100 px
- WHEN the top bar shows
- THEN it holds 13 controls or fewer

### Requirement: REQ-014 Twin tabs

Code / Terminal and Knowledge / Manual SHALL leave the tab bars, and their addresses, palette entries and menu entries SHALL keep working.

#### Scenario: Terminal address

- GIVEN a link to `/code/terminal`
- WHEN the person follows it
- THEN the terminal drawer opens

#### Scenario: Manual address

- GIVEN a link to `/knowledge/manual`
- WHEN the person follows it
- THEN the manual shows

### Requirement: REQ-015 No Home tiles

Home / Today SHALL show no stat tiles, and the two numbers that only the tiles held SHALL show in panel headings.

#### Scenario: Numbers kept

- GIVEN three assigned items and a spend today
- WHEN the person opens Today
- THEN the items heading shows 3 and the agents heading shows the spend

### Requirement: REQ-016 Nothing lost

Each action and each view that a person reaches before this change SHALL stay reachable from a visible control and from the palette.

#### Scenario: Inventory

- GIVEN the list of palette actions and routes before the change
- WHEN the inventory test runs
- THEN each one still exists

### Requirement: REQ-017 Page header on every tab

Each tab of each space SHALL show a visible page header with its icon and its title, also while it loads.

#### Scenario: While loading

- GIVEN a tab whose data loads
- WHEN the tab shows
- THEN its header shows

### Requirement: REQ-018 Loading and empty patterns

A page that loads SHALL show the shared loading pattern, and a page with no content SHALL show the shared empty pattern.

#### Scenario: Loading

- GIVEN a page that waits for its data
- WHEN it shows
- THEN the shared loading pattern shows

### Requirement: REQ-019 Section list in Settings

Each Settings page with two sections or more SHALL show the section list.

#### Scenario: Extensions

- GIVEN Settings / Extensions
- WHEN the page shows
- THEN the section list shows

### Requirement: REQ-020 Shared data table

The team rights tables, the Work / Team members table and the learning paths table SHALL use the shared data table.

#### Scenario: Team members

- GIVEN team members
- WHEN the person opens Work / Team
- THEN the members show in the shared data table

### Requirement: REQ-021 Tab icons

Each tab in a tab bar SHALL show an icon and its name.

#### Scenario: Icons

- GIVEN the Work space
- WHEN the tab bar shows
- THEN each tab has an icon and a name

### Requirement: REQ-022 Inner tab rows

An inner tab row SHALL move its selection mark with the same sliding pill and timing as the main tab bar.

#### Scenario: Slide

- GIVEN an inner tab row
- WHEN the person picks another tab
- THEN the pill slides to it

### Requirement: REQ-023 One motion source

The system reduced-motion setting or the motion preference of the person SHALL stop every animation, CSS, script, scroll and canvas included.

#### Scenario: Preference on reduced

- GIVEN the motion preference on reduced and the system setting off
- WHEN a number changes, a graph lays out and a section list scrolls
- THEN none of them animates

### Requirement: REQ-024 Motion gaps

A toast SHALL slide in and out, a removed list row SHALL leave with motion, loaded content SHALL fade in, and the panels SHALL move on the shared springs.

#### Scenario: Toast

- GIVEN motion is allowed
- WHEN a toast shows and then goes
- THEN it slides in and out

### Requirement: REQ-025 Shared timing

Each transition SHALL take its timing from the shared springs or the duration tokens.

#### Scenario: No local timing

- GIVEN the source files of the interface
- WHEN the tokens test runs
- THEN no transition has a local duration

### Requirement: REQ-026 Languages

Each new text SHALL ship in English, French, German and Spanish.

#### Scenario: Four languages

- GIVEN the new text keys
- WHEN the language test runs
- THEN each key exists in the four languages

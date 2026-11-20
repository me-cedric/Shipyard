# Spec: app-redesign

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-16
Change: `change:update-app-redesign`

### Goal

A person with little technical knowledge sees what to do next, follows one feature from the idea to the release on one page, and finds each thing in one place. The app keeps every function that it has today.

### Why

The app is organised by the kind of file. Eight spaces hold about 45 tabs, four layers of controls stand before the content, and each card shows many numbers with the same weight. The owner asked for a new interface that is more visual and more simple, and that improves a weak feature instead of copying it.

### Users And Scenarios

- PO: opens Today, answers the open question of a spec with one click, and sees when the release ends.
- PM: reads the plan as one sentence and one timeline, and applies a proposal that moves work from a person with too much work.
- BA: writes what a feature must do on the Brief of the feature, and sees which requirement has a test.
- Architect: opens Library, sees the decision that waits, and accepts or refuses it.
- Tech lead: approves "Send it for review?" once, and allows the same action for the next features of the recipe.
- Developer: follows the agent in the Chat of the feature, opens Code for the commit and the branches, and merges.
- QA: opens Flow / Health, and sees which gate needs a fix.
- Designer: links a Figma screen to a feature and sees which screen the code does not have yet.
- Viewer: reads Today and Flow, and cannot change a thing.

### Requirements

Places and navigation

- REQ-001: The main menu SHALL show six places in this order: Today, Flow, Plan, Crew, Library, Code. Setup SHALL sit at the end of the menu. A page SHALL show one section switch at most under its title.
- REQ-002: The address of each page that exists before this change SHALL open the new place of that page.
- REQ-003: Each action and each view that a person reaches before this change SHALL stay reachable from a visible control and from the Ask bar. A fixed inventory list SHALL prove it in a test.
- REQ-004: One bar, "Ask or tell Shipyard", SHALL replace the search field, the command palette and the Ask button. The palette shortcut SHALL move the focus to it. It SHALL answer a question, open a place and start an action. An answer that names a problem SHALL give the action that solves it.
- REQ-005: The full assistant SHALL keep threads (new, rename, delete), the modes, the model, the effort, the permission level, the context items, the context and quota gauges, the trace, the changed-file diff with keep and undo, the actions on a selection (Explain, Fix, Send to an agent) and the side and width of the panel.
- REQ-006: A role with the level `none` for an area SHALL NOT see the place or the view of that area. A right SHALL turn a control off, never a view. Each role SHALL open on its own first page.

Today

- REQ-007: Today SHALL show the things that need the person one at a time. The card SHALL name who asks and for which feature, and SHALL hold the controls of the answer. The title of the page SHALL give the count. A short queue SHALL show the next things.
- REQ-008: Today SHALL hold three views: Needs you, News and Activity. The menu bar panel SHALL show the same things that need the person. No other screen SHALL hold a second list of notifications.
- REQ-009: Today SHALL show the panels of the role of the person, the person's work (in progress, to do, done in 7 days), what happened since the last visit, and the reminder to log time.

Flow and one feature

- REQ-010: Flow SHALL show each feature once, in one of five stages: Idea, Spec, Build, Review, Ready. Each run state of the engine SHALL map to one stage and, when it applies, to one mark: needs you, blocked or stopped. Flow SHALL have four views: Flow, List, Done and Health.
- REQ-011: A feature card in Flow SHALL show three facts at most: the title, who works on it, and its state. The attention colour SHALL show only where a person must act.
- REQ-012: One feature page SHALL join the ticket, the spec change, the agent work, the pull request and the checks of the feature. It SHALL show the stage line and the sections Story, Brief, Design, Changes, Checks and Chat.
- REQ-013: When an agent needs approvals for one intent, the feature page and Today SHALL show one question that names each effect. The person SHALL be able to approve each effect alone. "Do not ask again for this recipe" SHALL store a durable permission for that recipe.
- REQ-014: Each state in which an agent does not work (waits for an answer, blocked, budget reached, failed, paused by a person, finished outside Shipyard) SHALL show one main action: Reply, Unblock, Add budget, Try again, Resume or Close as done.
- REQ-015: The Story of a feature SHALL show the events in plain sentences. All events, the requests with their cost and the live terminal SHALL open on demand.

Crew and Plan

- REQ-016: Crew SHALL show the people and the agents of the project on one page, and SHALL have the sections Recipes, Sessions, Spend and Rights. It SHALL hold the switch that turns the agents on and off and the action that stops all agents.
- REQ-017: Crew SHALL show the live work as rows: the agent, the feature, and the files and specs that it reads and changes. Each ref SHALL be copyable. This view SHALL replace the agents map.
- REQ-018: Plan SHALL say in its title when the release ends. It SHALL have the views Timeline, People, Estimates and Time. A capacity problem SHALL show as one card with proposals that the person can apply.
- REQ-019: Plan SHALL keep the estimate sheets, the costing with its seal, the import from Excel, the dates and days off, the time sheet, and the preview before the plan goes to the issue tracker.

Library

- REQ-020: Library SHALL open on four doors: what the product must do, how it is built, why it is so, learn and share. Each view of Design, of Knowledge and of the spec reference that exists before this change SHALL open from one door. A door SHALL show the items that wait for a person.
- REQ-021: A reader of a model, a diagram, a spec, a test plan or a decision SHALL show the picture or the plain form first. The text form SHALL show on demand.

Code and health

- REQ-022: Code SHALL have the sections Now, History, Branches and Terminal. Now SHALL show the files to commit and the pull requests. One mark SHALL show the sync state on each page.
- REQ-023: The quality gates and the scanners SHALL show as the Health view of Flow. The impacts of a change SHALL open from the Checks of its feature.

Setup

- REQ-024: Setup SHALL have a guided start with every item of the start checklist, and three scopes: This project, This computer, Me. Each setting SHALL have one place.

Visual language and words

- REQ-025: The interface SHALL use one accent colour and one attention colour. The attention colour SHALL mean "a person must act" and nothing else. It SHALL show only on the attention card, on the tag "you", on a meter that is over its budget and on the count of Today. The themes Light, Dark, OLED and System SHALL stay. Light SHALL be the default for a person who has not chosen a theme. A theme that a person chose before this change SHALL stay.
- REQ-026: Each control that a person clicks SHALL be 44 px high or more. No page SHALL scroll sideways at the minimum window size of 960 by 600.
- REQ-027: The interface SHALL use plain words for the places and the objects, complete in English, French, German and Spanish. In English the places SHALL be Today, Flow, Plan, Crew, Library, Code and Setup, a workflow SHALL be a "recipe", and the people and the agents together SHALL be the "crew". It SHALL say "issue tracker" and "code host".
- REQ-028: Each new shared component SHALL live in the atomic layers of `src/ui/` and SHALL show in the gallery. A page SHALL NOT define a new primitive.

Delivery

- REQ-029: The change SHALL arrive in waves on the main branch, with no switch between an old and a new interface. Each wave SHALL replace its pages. The old pages of a wave SHALL go only when its new pages pass the inventory test. After each wave each function SHALL be reachable in the old place or in the new place, never in neither.

New agent actions

- REQ-030: Plan / Estimates SHALL offer "Ask an agent to estimate" for the selected tasks. The agent SHALL propose a best, a likely and a worst value with its assumptions for each task. A value SHALL enter the sheet only when the person accepts it. A sealed sheet SHALL refuse the action.
- REQ-031: The health of the project SHALL offer "Fix all with an agent". The action SHALL create one feature in Flow that fixes the listed findings. The changes of that feature SHALL pass the same review and the same approvals as any other feature.
- REQ-032: Library / Dashboards SHALL offer "Build a tile for me". The person SHALL describe the tile in words, and the agent SHALL propose one tile. The tile SHALL enter the dashboard only when the person accepts it.
- REQ-033: Each of these three actions SHALL run with a budget, SHALL show in Crew while it runs, and SHALL stop when the person stops it.

Look pass 2, Library

- REQ-034: Each page of Library that the design shows as a full page with a back link SHALL have its own address under `/library/` and a back link to the page that it comes from. These pages are What is tested (`/library/test-plans/coverage`), Map of the code (`/library/graph?source=code`), Flow matrix (`/library/flows/matrix`), Edit a dashboard (`/library/dashboards/<name>/edit`) and the report forms (`/library/reports/<form>`). A dialog or a side panel SHALL NOT replace one of them.
- REQ-035: A control that a Library page does not show SHALL stay reachable from the More menu of the page, from a sub-page or from the Ask bar, and SHALL NOT be deleted. The reference and the file name of an item SHALL be in the More menu (Copy the reference, Copy the file name), not in the header.
- REQ-036: The forms of Change request and Work done SHALL open as pages of Library / Reports. A required field that is empty SHALL give an error line and SHALL write nothing. Write the report SHALL write each file and show it with Show in folder and Open.

### Non-Goals

- No change to the engine, the run states, the sync, the stores or the command surface, except what a new view needs to read.
- No new function other than the three agent actions of REQ-030 to REQ-033 (`q:Q-170`). The design shows some controls that the app does not have, for example Sign out, Pause, Take it over and the PDF switch of the dossier. This change does not build them. `.agents/progress/app-redesign.md` lists each one. Each one needs a change of its own.
- No change to the files of a project in the repository.
- No mobile layout. The window keeps its minimum size.

### Acceptance Criteria

- [ ] The menu shows the six places and Setup, and no page shows two section switches.
- [ ] The inventory test passes: each route and each palette action of today opens or runs.
- [ ] The Ask bar answers "what blocks MVP 1" with the blocked features and one action for each.
- [ ] A viewer sees no Code place. A tester opens Flow / Health.
- [ ] Today shows one question with its answer controls, and the count in its title.
- [ ] Each of the 16 run states shows in one stage of Flow, with the right mark.
- [ ] One approval sends a feature for review, and names the pull request and the ticket move.
- [ ] Each stop state shows its one action.
- [ ] Crew shows people and agents, and the live work has no crossing lines.
- [ ] Plan shows the end date in its title and one card for the capacity problems.
- [ ] Each view of Design and Knowledge opens from a Library door.
- [ ] Health shows the gates to a role with no code right.
- [ ] Setup shows the three scopes, and a search of the settings finds no setting in two places.
- [ ] The accessibility run finds no control under 44 px and no sideways scroll at 960 by 600.
- [ ] The four languages are complete, and no text says "tracker" or "forge" alone.
- [ ] An agent proposes an estimate, a fix feature and a dashboard tile, and nothing changes before the person accepts.
- [ ] Each Library sub-page of REQ-034 opens at its own address with a back link, and each control that moved is in the More menu, a sub-page or the Ask bar.

### Existing References

- Design source: `docs/designs/redesign/README.md` (index of the 101 screens, pictures and sources), and the private canvas <https://claude.ai/artifact/1uHi9aggUnnnUDchTWGYA2>.
- Existing code: `src/features/`, `src/app/router.tsx`, `src/ui/`.
- Extends: `change:update-ux-declutter` (one checklist, shared patterns). Supersedes its top bar and status bar requirements: look pass 1 removed both bars (`spec:shell#REQ-021`).
- Rules: `docs/openspec/constitution.md` sections 2, 3 and 4.
- Look pass 2, Library: the pages of `spec:knowledge`, `spec:design` and `spec:specs` take the layout of the design. Their requirement refs and their behavior stay (`spec:specs#REQ-008` still filters the questions by kind, state and owner, from the More menu; `spec:knowledge#REQ-004` still filters the graph by kind). No requirement ref moves.
- Decision: `adr:0023` (six places and one flow), accepted. It replaces `adr:0004`.
- Other capabilities: the deltas of this change hold the requirements whose behavior changes: `spec:shell#REQ-001`, `spec:shell#REQ-005`, `spec:shell#REQ-009`, `spec:shell#REQ-012`, `spec:shell#REQ-017`, `spec:design-system#REQ-003`, `spec:factory#REQ-027`, `spec:factory#REQ-030`, `spec:factory#REQ-038`, `spec:code#REQ-026`, `spec:code#REQ-027`, `spec:code#REQ-029`. `spec:team-rights#REQ-013` has its new first pages in `change:add-team-rights`. Each other requirement that names a page of before this change keeps its ref and its behavior at the new place of the map in `plan.md`. One requirement ref moves: `spec:shell#REQ-021` (the top row and the sync mark) replaces the status bar requirement, REQ-007 of `shell`, which this change removes. The delta of `shell` also adds `spec:shell#REQ-018` to `spec:shell#REQ-020`.

## ADDED Requirements

### Requirement: REQ-001 Six places

The main menu SHALL show Today, Flow, Plan, Crew, Library and Code in this order, with Setup at the end, and a page SHALL show one section switch at most.

Screen: SCR-036

#### Scenario: The menu

- GIVEN an open project and a role that sees every area
- WHEN the person looks at the main menu
- THEN it shows Today, Flow, Plan, Crew, Library, Code, and Setup at the end

#### Scenario: One switch

- GIVEN any page of the app
- WHEN the page shows
- THEN one section switch at most shows under its title

### Requirement: REQ-002 Old addresses

The address of each page that exists before this change SHALL open the new place of that page.

#### Scenario: A run address

- GIVEN the address of a run page of before this change
- WHEN the person opens it
- THEN the feature page of that run opens

### Requirement: REQ-003 Nothing lost

Each action and each view of before this change SHALL stay reachable from a visible control and from the Ask bar, and a fixed inventory list SHALL prove it in a test.

#### Scenario: Inventory

- GIVEN the fixed list of the routes and the palette actions of before this change
- WHEN the inventory test runs
- THEN each route opens a page and each action runs

### Requirement: REQ-004 Ask bar

One bar SHALL replace the search field, the command palette and the Ask button, and SHALL answer, open a place and start an action.

Screen: SCR-038

#### Scenario: Shortcut

- GIVEN any page
- WHEN the person presses the palette shortcut
- THEN the focus moves to the Ask bar

#### Scenario: An answer with its action

- GIVEN two blocked features in the release
- WHEN the person asks what blocks the release
- THEN the answer names the two features and gives one action for each

### Requirement: REQ-005 Full assistant

The full assistant SHALL keep its threads, modes, model, effort, permission level, context items, gauges, trace, changed-file diff, selection actions and panel placement.

Screen: SCR-014

#### Scenario: A selection

- GIVEN a selected text on a page
- WHEN the person opens the actions of the selection
- THEN Explain, Fix and Send to an agent show

### Requirement: REQ-006 Role view

A role with the level `none` for an area SHALL NOT see its place or view, a right SHALL turn a control off and never a view, and each role SHALL open on its own first page.

Screen: SCR-036

#### Scenario: A viewer

- GIVEN a person with the role viewer
- WHEN the app opens
- THEN Today opens and the menu shows no Code place

### Requirement: REQ-007 One thing at a time

Today SHALL show the things that need the person one at a time, with the answer controls on the card, the count in the title and a short queue.

Screen: SCR-001

#### Scenario: An agent question

- GIVEN three things that need the person, the first a question of an agent
- WHEN the person opens Today
- THEN the title gives the count three, the card shows the question with its answers, and the queue shows the two others

### Requirement: REQ-008 One list of news

Today SHALL hold the views Needs you, News and Activity, the menu bar panel SHALL show the same things that need the person, and no other screen SHALL hold a second list of notifications.

Screen: SCR-037
Screen: SCR-012

#### Scenario: Same list

- GIVEN three things that need the person
- WHEN the person opens the menu bar panel
- THEN it shows the same three things as Today

### Requirement: REQ-009 Role panels on Today

Today SHALL show the panels of the person's role, the person's work, what happened since the last visit and the reminder to log time.

Screen: SCR-001

#### Scenario: A tech lead

- GIVEN a person with the role tech lead and no time logged today
- WHEN the person opens the panels of Today
- THEN the panels of the tech lead show, with the person's work and the reminder to log time

### Requirement: REQ-010 Five stages

Flow SHALL show each feature once in one of the stages Idea, Spec, Build, Review and Ready, SHALL map each run state to a stage and a mark, and SHALL have the views Flow, List, Done and Health.

Screen: SCR-006

#### Scenario: A blocked run

- GIVEN a feature whose run is in the state Blocked
- WHEN the person opens Flow
- THEN the feature shows once, in Build, with the mark blocked

### Requirement: REQ-011 Three facts on a card

A feature card in Flow SHALL show three facts at most, and the attention colour SHALL show only where a person must act.

Screen: SCR-006

#### Scenario: A working feature

- GIVEN a feature on which an agent works and that needs no person
- WHEN the person looks at its card
- THEN the card shows its title, the agent and its state, and no attention colour

### Requirement: REQ-012 One feature page

One feature page SHALL join the ticket, the spec change, the agent work, the pull request and the checks, with the stage line and the sections Story, Brief, Design, Changes, Checks and Chat.

Screen: SCR-026

#### Scenario: From Flow

- GIVEN a feature in Build with a spec change and a run
- WHEN the person opens its card
- THEN one page shows the stage line and the six sections

### Requirement: REQ-013 One approval for one intent

Approvals that an agent needs for one intent SHALL show as one question that names each effect, each effect SHALL stay approvable alone, and "Do not ask again for this recipe" SHALL store a durable permission.

Screen: SCR-026

#### Scenario: Send for review

- GIVEN an agent that asks to open a pull request and to move the ticket
- WHEN the person opens the feature
- THEN one question shows with the two effects named

#### Scenario: Durable permission

- GIVEN the same question
- WHEN the person ticks "Do not ask again for this recipe" and approves
- THEN the next feature of that recipe does not ask for these two effects

### Requirement: REQ-014 One action when an agent stops

Each state in which an agent does not work SHALL show one main action.

Screen: SCR-026

#### Scenario: Budget reached

- GIVEN a feature whose agent stopped at its budget limit
- WHEN the person opens the feature
- THEN the main action is Add budget

### Requirement: REQ-015 Plain story

The Story of a feature SHALL show its events in plain sentences, and all events, the requests and the live terminal SHALL open on demand.

Screen: SCR-026

#### Scenario: Story first

- GIVEN a feature with ten events
- WHEN the person opens its Story
- THEN the plain events show and a control opens all ten

### Requirement: REQ-016 Crew

Crew SHALL show people and agents on one page with the sections Recipes, Sessions, Spend and Rights, the agents switch and the action that stops all agents. The agents switch SHALL sit in the header of Crew and SHALL stop every agent and new runs. The action SHALL sit on Spend and SHALL stop each running agent and leave the agents on.

Screen: SCR-041

#### Scenario: People and agents

- GIVEN a project with five people and three agent roles
- WHEN the person opens Crew
- THEN both groups show on one page with their current work

#### Scenario: Stop all agents

- GIVEN two agents at work and the agents on
- WHEN the person stops all agents on Spend
- THEN both agents stop and the agents stay on

### Requirement: REQ-017 Live work

Crew SHALL show the live work as rows of agent, feature and touched files and specs, with copyable refs, in place of the agents map.

Screen: SCR-007

#### Scenario: Six agents

- GIVEN six agents at work
- WHEN the person opens the live view
- THEN six rows show, each with its agent, its feature and what it touches

### Requirement: REQ-018 Plan

Plan SHALL give the end date of the release in its title, SHALL have the views Timeline, People, Estimates and Time, and SHALL show a capacity problem as one card with proposals to apply.

Screen: SCR-005

#### Scenario: Too much work

- GIVEN three people over their capacity
- WHEN the person opens Plan
- THEN one card names the problem and offers proposals to apply

### Requirement: REQ-019 Plan keeps its tools

Plan SHALL keep the estimate sheets, the costing with its seal, the import from Excel, the dates and days off, the time sheet and the preview before the plan goes to the issue tracker.

Screen: SCR-005
Screen: SCR-043

#### Scenario: Preview before the send

- GIVEN a plan with new and changed tasks
- WHEN the person asks to send it to the issue tracker
- THEN a preview lists what it creates, what it changes and what stays

### Requirement: REQ-020 Library doors

Library SHALL open on four doors, each current view of Design, Knowledge and the spec reference SHALL open from one door, and a door SHALL show the items that wait for a person.

Screen: SCR-044

#### Scenario: A waiting decision

- GIVEN one proposed decision
- WHEN the person opens Library
- THEN the door "why it is so" shows that one decision waits

### Requirement: REQ-021 Picture first

A reader SHALL show the picture or the plain form first, and the text form on demand.

Screen: SCR-003

#### Scenario: An architecture model

- GIVEN an architecture model
- WHEN the person opens it
- THEN the picture shows, and a switch shows the text

### Requirement: REQ-022 Code

Code SHALL have the sections Now, History, Branches and Terminal, Now SHALL show the files to commit and the pull requests, and one mark SHALL show the sync state.

Screen: SCR-008

#### Scenario: Now

- GIVEN five changed files and four open pull requests
- WHEN the person opens Code
- THEN Now shows the five files with the commit box, and the four pull requests

### Requirement: REQ-023 Health for every role

The quality gates and the scanners SHALL show as the Health view of Flow, and the impacts of a change SHALL open from the Checks of its feature.

Screen: SCR-065
Screen: SCR-066

#### Scenario: A tester

- GIVEN a tester with no right on code
- WHEN the tester opens Flow / Health
- THEN the gates show with their state

### Requirement: REQ-024 Setup scopes

Setup SHALL have a guided start with every item of the start checklist and the scopes This project, This computer and Me, with one place for each setting.

Screen: SCR-061

#### Scenario: The issue tracker

- GIVEN a project with no issue tracker
- WHEN the person opens Setup
- THEN the guided start shows the issue tracker step, and the connection lives under This project only

#### Scenario: Pages from pills and rows

- GIVEN the scope This project
- WHEN the person opens Setup
- THEN the pills are Details, Agents may do alone, Automation and Extensions, and Tickets, Plugins and rule packs and the health of the project open from a row or a link, with a back link (`adr:0023`)

#### Scenario: A missing required tool

- GIVEN a required program is missing on this computer
- WHEN the person opens the health of this computer
- THEN the title counts it as a problem and the page offers Fix it

### Requirement: REQ-025 Two colours with a meaning

The interface SHALL use one accent colour and one attention colour that means "a person must act", SHALL show the attention colour only on the attention card, on the tag "you", on a meter that is over its budget and on the count of Today, SHALL keep the themes Light, Dark, OLED and System, and SHALL open in Light for a person who has not chosen a theme.

Screen: SCR-002

#### Scenario: Attention only for an action

- GIVEN a page with no thing that needs the person
- WHEN the page shows
- THEN no element uses the attention colour

#### Scenario: The four uses of the attention colour

- GIVEN one thing that needs the person and one feature that is over its budget
- WHEN the person opens Today and then Crew / Spend
- THEN the count of Today in the rail, the attention card and the tag "you" use the attention colour
- AND the meter of the feature uses the attention colour

#### Scenario: Default theme

- GIVEN a person who has not chosen a theme
- WHEN the app opens
- THEN the interface shows in the Light theme

#### Scenario: A chosen theme stays

- GIVEN a person who chose the Dark theme before this change
- WHEN the app opens after this change
- THEN the interface shows in the Dark theme

### Requirement: REQ-026 Sizes

Each control SHALL be 44 px high or more, and no page SHALL scroll sideways at 960 by 600.

#### Scenario: Minimum window

- GIVEN the window at 960 by 600
- WHEN the accessibility run opens each page
- THEN no page scrolls sideways and no control is under 44 px high

### Requirement: REQ-027 Plain words

The interface SHALL use plain words, complete in English, French, German and Spanish, SHALL name the places Today, Flow, Plan, Crew, Library, Code and Setup, SHALL call a workflow a "recipe" and the people and the agents the "crew", and SHALL say "issue tracker" and "code host".

Screen: SCR-020

#### Scenario: Four languages

- GIVEN each of the four languages
- WHEN the language check runs
- THEN no key is missing and no text says "tracker" or "forge" alone

#### Scenario: Names in English

- GIVEN the interface in English
- WHEN the person opens Crew and its Recipes section
- THEN the menu says Crew, the section says Recipes, and no text says "workflow" or "Factory"

### Requirement: REQ-028 Shared components

Each new shared component SHALL live in `src/ui/` and show in the gallery, and a page SHALL NOT define a new primitive.

#### Scenario: A new card

- GIVEN a new shared card of the redesign
- WHEN the gallery opens
- THEN the card shows there

### Requirement: REQ-029 Whole after each wave

The change SHALL arrive in waves on the main branch with no switch, each wave SHALL replace its pages, and the old pages of a wave SHALL go only when its new pages pass the inventory test.

#### Scenario: After a wave

- GIVEN the end of a wave
- WHEN the inventory test runs
- THEN it passes

#### Scenario: Old pages go

- GIVEN a wave whose new pages pass the inventory test
- WHEN the wave ends
- THEN the old pages of that wave are removed and their addresses open the new pages

### Requirement: REQ-030 Ask an agent to estimate

Plan / Estimates SHALL offer "Ask an agent to estimate" for the selected tasks, the agent SHALL propose a best, a likely and a worst value with its assumptions, a value SHALL enter the sheet only when the person accepts it, and a sealed sheet SHALL refuse the action.

Screen: SCR-043

#### Scenario: A proposal

- GIVEN three selected tasks on an open sheet
- WHEN the person asks an agent to estimate
- THEN each task shows a proposed best, likely and worst value with its assumptions, and the sheet keeps its old values

#### Scenario: Accept

- GIVEN a proposal for one task
- WHEN the person accepts it
- THEN the three values enter the sheet for that task

#### Scenario: Sealed sheet

- GIVEN a sealed sheet
- WHEN the person looks for the action
- THEN the action is off

### Requirement: REQ-031 Fix all with an agent

The health of the project SHALL offer "Fix all with an agent", the action SHALL create one feature in Flow that fixes the listed findings, and its changes SHALL pass the same review and approvals as any other feature.

Screen: SCR-091

#### Scenario: One feature

- GIVEN three findings in the health of the project
- WHEN the person chooses "Fix all with an agent"
- THEN one feature shows in Flow, in Build, with the three findings in its Brief

#### Scenario: Normal review

- GIVEN that feature with its changes ready
- WHEN the agent wants to send it for review
- THEN the person gets the same approval question as for any other feature

### Requirement: REQ-032 Build a tile for me

Library / Dashboards SHALL offer "Build a tile for me", the agent SHALL propose one tile from the person's words, and the tile SHALL enter the dashboard only when the person accepts it.

Screen: SCR-046

#### Scenario: A proposed tile

- GIVEN a dashboard in edit mode
- WHEN the person describes a tile and asks to build it
- THEN a proposed tile shows with Accept and Discard, and the dashboard does not change

#### Scenario: Accept

- GIVEN a proposed tile
- WHEN the person accepts it
- THEN the tile is on the dashboard

### Requirement: REQ-033 Budget and stop for the new actions

Each of the three new agent actions SHALL run with a budget, SHALL show in Crew while it runs, and SHALL stop when the person stops it. Crew / Sessions SHALL give its own stop for a run, a review of a pull request, an estimate and a tile build.

Screen: SCR-041

#### Scenario: Stop

- GIVEN an agent that estimates tasks
- WHEN the person stops it in Crew
- THEN the agent stops and the sheet keeps its old values

#### Scenario: Stop in Sessions

- GIVEN a run, a review and an estimate at work
- WHEN the person opens each session in Crew / Sessions
- THEN each one has its own stop
### Requirement: REQ-034 Library sub-pages with an address

Each sub-page of Library that the design shows as a full page SHALL have its own address under `/library/` and a back link, and SHALL NOT be a dialog or a side panel.

Screen: SCR-163

#### Scenario: What is tested

- GIVEN the page Test plans
- WHEN the person opens the chip What is tested of the door What it must do
- THEN the page opens at `/library/test-plans/coverage` with the back link Test plans

#### Scenario: Edit a dashboard

- GIVEN a dashboard that the role can change
- WHEN the person clicks Edit
- THEN the page opens at `/library/dashboards/<name>/edit` with the back link Dashboards, and Done goes back

#### Scenario: Flow matrix and map of the code

- GIVEN the pages Network flows and Map
- WHEN the person opens the full matrix, and then the source Code of the map
- THEN the matrix opens at `/library/flows/matrix` with the back link Network flows, and the map of the code opens at `/library/graph?source=code`

### Requirement: REQ-035 Moved controls of Library

A control that a Library page does not show SHALL stay reachable from the More menu, a sub-page or the Ask bar, and the reference and the file name of an item SHALL be in the More menu.

Screen: SCR-082

#### Scenario: A filter of Questions

- GIVEN the page Questions
- WHEN the person opens the More menu
- THEN the filters by text, state and owner are there, and they filter the list as before

#### Scenario: Rename and delete a document

- GIVEN an open document
- WHEN the person opens the More menu
- THEN Rename, Delete and Search in the text are there

#### Scenario: Copy the reference

- GIVEN an open spec
- WHEN the person opens the More menu
- THEN Copy the reference and Copy the file name are there, and the header shows no reference chip

### Requirement: REQ-036 Report forms as pages

The forms of Change request and Work done SHALL open as pages of Library / Reports, SHALL refuse an empty required field with an error line, and SHALL write each file with Write the report.

Screen: SCR-164

#### Scenario: Write a change request

- GIVEN the form Change request with its fields filled
- WHEN the person clicks Write the report
- THEN a card Written shows each file with Show in folder and Open

#### Scenario: A required field is empty

- GIVEN the form Change request with an empty field
- WHEN the person clicks Write the report
- THEN an error line shows and no file is written

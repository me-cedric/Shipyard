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
- REQ-024: A toast SHALL slide in and out. A removed list row SHALL leave with motion. The sidebar and the inspector SHALL move on the shared springs. Loaded content SHALL fade in under its page header.
- REQ-025: Each transition SHALL take its timing from the shared springs or the duration tokens.

Languages

- REQ-026: Each new text SHALL ship in English, French, German and Spanish.

Runs and Factory (second pass, 2026-11-12)

- REQ-027: Each run SHALL have its own address. Each link to a run (Home, notifications, the menu bar panel, Sessions, Usage, the Agents map, the Activity panel, a run reference) SHALL open the run page. Back and Forward SHALL work.
- REQ-028: The run page SHALL show without the header and the controls of the Runs list.
- REQ-029: The run page SHALL start with a summary that stays in view: the ticket key and title with a link to the ticket, the state in words, the step as n of m, the cost and the budget, the elapsed time, the AI tool and the model, and the pull request with its checks and its review. Stop SHALL always be reachable from the summary.
- REQ-030: The summary SHALL show one primary action for the state: Answer (waiting for an answer), Approve plan (plan review), Unblock (blocked), Resume (paused), Open pull request (in review, changes requested, ready to merge, done with a pull request), Start again (failed, cancelled). Start again SHALL open the new run.
- REQ-031: What waits for the person SHALL show directly under the summary: the questions, the approvals, the plan with its actions, and the stop reason with its form. A paused run SHALL have the added budget and the message in one form with Resume.
- REQ-032: Under it, the run page SHALL have three tabs: Activity (the live conversation and the events), Changes (the findings and the diff, each file collapsed with its counts), Workflow (the graph and the sessions with Follow and Open in terminal). The Activity tab SHALL offer Important and All.
- REQ-033: The run page and the run card SHALL show no raw id: a pull request shows as its number, a step and a workflow show their names, an event shows a sentence, a time shows hours and minutes. The pages SHALL show no helper text. The word for ending a run SHALL be Stop everywhere.
- REQ-034: The Runs list SHALL show no stat tiles. One bar SHALL hold the search, a filter (All, Needs you, Mine) and a Board and History switch.
- REQ-035: The board SHALL have five lanes: Queued, Working, Needs you, In review, Ready to merge. At a window width of 1100 px or more the lanes SHALL fit with no sideways scroll. An empty lane SHALL show the empty pattern.
- REQ-036: History SHALL list each ended run and each older run of a ticket, newest end first, with search. A row SHALL open the run.
- REQ-037: A run card SHALL show each fact once and the ticket key. A card that waits for a person SHALL show its one action as a button that opens the run at that action. Stop SHALL be in the card menu.
- REQ-038: A Sessions row, a Usage run row and an Agents map node SHALL open the run. Sessions SHALL show no stat tiles. Usage SHALL show the budgets in a panel, not in the page header, and SHALL show the success rate. The Agents map SHALL label a node with the ticket title. The Workflows list SHALL show the step names, and its file actions SHALL be in a menu.
- REQ-039: A diagram or a picture in the zoom frame SHALL fit the frame and be centred at the first paint. The person SHALL pan it in both directions and zoom it. Fit SHALL bring it back.
- REQ-040: When a program that Shipyard starts ends with an error, the message SHALL name the program, its exit code and its last lines, and SHALL give one action.

Pull requests (third pass, 2026-11-12)

- REQ-041: A pull request SHALL open as its own page with its own address. The page SHALL show the title, the state, the source and target branch, the lines added and removed, and the tabs Overview, Commits, Checks and Files changed with their counts. Back SHALL return to the list with its search and filters kept.
- REQ-042: The pull request list SHALL be a full-width page with a search, a filter (All, Mine, Needs review) and the state groups open, merged and closed. Each row SHALL show the number, the title, the author, the draft state, the checks state and the review state.
- REQ-043: The Overview tab SHALL start with a merge box that says whether the pull request can merge and why not. It SHALL have three segments: Checks (passing, failing and pending counts), Comments (unresolved threads) and Approvals (reviewers with their verdicts). It SHALL hold the merge action as a split button whose menu lists the merge methods. Merge SHALL keep its confirmation, its draft rule and its right.
- REQ-044: The Overview SHALL show the description as Markdown, then the conversation. A narrow column SHALL show the reviewers with their verdicts, the labels, and the linked tickets and runs. It SHALL show no assignee, project or milestone.
- REQ-045: The Files changed tab SHALL list every file collapsed by default, each with its path, its status and its lines added and removed. It SHALL show a file tree with a filter, an Expand all and a Collapse all action, and a count of the files that the person marked as viewed. A file that the person expands SHALL show its diff.
- REQ-046: The Files changed tab SHALL use the same file rows, file tree, counts and diff component as the run page and Code / Local changes. The diff component SHALL show line numbers.
- REQ-047: The conversation SHALL show the general comments of the pull request and its review threads, in time order, as Markdown, with the author and the time. A write box SHALL post a general comment. A comment of the forge SHALL show after the forge answers.
- REQ-048: A review thread SHALL show its file and line, its comments, and a Resolved mark. A person SHALL reply to a thread and SHALL resolve or reopen it with one click each.
- REQ-049: A person SHALL add a comment to a line of the new file on the Files changed tab with a button in the line gutter. The comment SHALL join a pending review kept on this computer. The page SHALL show the number of pending comments with Submit review and Discard. Submit review SHALL post all of them with one verdict: Comment, Approve or Request changes. A person SHALL also post one comment at once.
- REQ-050: A pending review SHALL stay on this computer until the person submits or discards it. It SHALL survive a restart. A line that the pull request no longer has SHALL keep its comment text visible so that no text is lost.
- REQ-051: When a forge refuses a comment, a reply or a review, the page SHALL show the refusal text and SHALL keep the pending text. Azure DevOps SHALL post an inline comment in the review body with its file and line. A pull request with more than 100 files SHALL show all of them.
- REQ-052: Reply, resolve, inline comment, submit review and general comment SHALL need a click of a person and the right to write to the code host. A person without it SHALL see each control off with its reason.

### Non-Goals

- A new feature, a new page or a new setting.
- A change of the seven spaces or of the order of the sidebar.
- Assignees, projects, milestone, reopen and convert to draft on the pull request page.
- Decorative motion: shared-element moves, celebrations, page entrance effects. The fade of loaded content under its header (REQ-024) is not an entrance effect: it shows that the data arrived.
- A width motion for the terminal, file and assistant drawers: they open with no width motion (a width spring refits the terminal on every frame).
- The per-project picks and overrides of Settings / Project, fetch and push in Code / Branches, the project actions of Home / Projects: they stay.

### Acceptance Criteria

- [x] Today shows one checklist; an item is done on Today and in Settings / Me at the same time.
- [x] A fresh install shows the first-run page and no tour; the tour opens once after the first project opens, and never again after a setup action.
- [x] Each space with no project offers Open a folder, Clone and New project.
- [x] Focus on a marked term shows its sentence and a link to the manual.
- [x] The top bar shows 13 controls or fewer at 1100 px.
- [x] The Activity panel stops a run and a session.
- [x] The avatar menu changes the theme and opens the manual, the shortcuts, What's new and the tour.
- [x] `/code/terminal` opens the terminal drawer; `/knowledge/manual` shows the manual; neither is a tab.
- [x] Today shows no stat tiles; the two numbers show in panel headings.
- [x] An inventory test lists each palette action and each route that exists before the change and finds it after.
- [x] Each tab shows a header while it loads; the a11y end-to-end tests pass.
- [x] With the motion preference on reduced, no element moves (count-up, graph, section scroll included).
- [x] A toast and a removed run row move in and out.
- [x] Loaded content fades in under the header; the header does not fade.
- [x] Each new text exists in the four languages.
- [x] REQ-027: The run page of that run opens.
- [x] REQ-028: The Runs list header does not show above it.
- [x] REQ-029: The summary shows the step as 2 of 5, the cost, the time and the pull request number.
- [x] REQ-030: The page of the new run opens.
- [x] REQ-031: One form holds the added budget, the message and Resume.
- [x] REQ-032: Only the questions, the errors, the state changes and the results show.
- [x] REQ-033: It shows #44.
- [x] REQ-034: Only the runs that wait for a person show.
- [x] REQ-035: The five lanes show with no sideways scroll.
- [x] REQ-036: Both runs show.
- [x] REQ-037: It has one button, Review plan.
- [x] REQ-038: The run page opens on the Workflow tab at that session.
- [x] REQ-039: The whole model shows, and a drag moves it sideways.
- [x] REQ-040: The page names the program, the code and its last line.
- [ ] REQ-041: The page shows its title, branches and tabs, and Back returns to the list with the same filters.
- [ ] REQ-042: Only the pull requests that match it show.
- [ ] REQ-043: The box names two failing checks and one unresolved thread, and Merge asks for a confirmation that names the method.
- [ ] REQ-044: The sidebar lists the ticket as a link.
- [ ] REQ-045: All forty rows are collapsed, and expanding one shows its diff.
- [ ] REQ-046: They use the same diff component with line numbers.
- [ ] REQ-047: Both comments show with their author and time.
- [ ] REQ-048: The thread shows the Resolved mark and the box counts one unresolved thread fewer.
- [ ] REQ-049: The forge receives one review with both comments and the pending list is empty.
- [ ] REQ-050: The pending comment is still there.
- [ ] REQ-051: The refusal shows and the pending comments stay.
- [ ] REQ-052: The write box, the reply, the resolve and the submit controls are off with their reason.

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

A toast SHALL slide in and out, a removed list row SHALL leave with motion, and the sidebar and the inspector SHALL move on the shared springs. Loaded content SHALL fade in under its page header.

#### Scenario: Toast

- GIVEN motion is allowed
- WHEN a toast shows and then goes
- THEN it slides in and out

#### Scenario: Loaded content fades in

- GIVEN motion is allowed and a page loads
- WHEN its content replaces the loading pattern
- THEN the content under the header fades in and the header does not

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

### Requirement: REQ-027 Run address

Each run SHALL have its own address. Each link to a run (Home, notifications, the menu bar panel, Sessions, Usage, the Agents map, the Activity panel, a run reference) SHALL open the run page. Back and Forward SHALL work.

#### Scenario: Run address

- GIVEN a notification of a run
- WHEN the person clicks it
- THEN the run page of that run opens

### Requirement: REQ-028 Run page is a page

The run page SHALL show without the header and the controls of the Runs list.

#### Scenario: Run page is a page

- GIVEN an open run
- WHEN the page shows
- THEN the Runs list header does not show above it

### Requirement: REQ-029 Run summary

The run page SHALL start with a summary that stays in view: the ticket key and title with a link to the ticket, the state in words, the step as n of m, the cost and the budget, the elapsed time, the AI tool and the model, and the pull request with its checks and its review. Stop SHALL always be reachable from the summary.

#### Scenario: Run summary

- GIVEN a run in the build step with a pull request
- WHEN the run page shows
- THEN the summary shows the step as 2 of 5, the cost, the time and the pull request number

### Requirement: REQ-030 One action per state

The summary SHALL show one primary action for the state: Answer (waiting for an answer), Approve plan (plan review), Unblock (blocked), Resume (paused), Open pull request (in review, changes requested, ready to merge, done with a pull request), Start again (failed, cancelled). Start again SHALL open the new run.

#### Scenario: One action per state

- GIVEN a cancelled run
- WHEN the person clicks Start again
- THEN the page of the new run opens

### Requirement: REQ-031 Needs you first

What waits for the person SHALL show directly under the summary: the questions, the approvals, the plan with its actions, and the stop reason with its form. A paused run SHALL have the added budget and the message in one form with Resume.

#### Scenario: Needs you first

- GIVEN a paused run
- WHEN the run page shows
- THEN one form holds the added budget, the message and Resume

### Requirement: REQ-032 Run tabs

Under it, the run page SHALL have three tabs: Activity (the live conversation and the events), Changes (the findings and the diff, each file collapsed with its counts), Workflow (the graph and the sessions with Follow and Open in terminal). The Activity tab SHALL offer Important and All.

#### Scenario: Run tabs

- GIVEN a run with 40 events
- WHEN the person picks Important
- THEN only the questions, the errors, the state changes and the results show

### Requirement: REQ-033 Plain run text

The run page and the run card SHALL show no raw id: a pull request shows as its number, a step and a workflow show their names, an event shows a sentence, a time shows hours and minutes. The pages SHALL show no helper text. The word for ending a run SHALL be Stop everywhere.

#### Scenario: Plain run text

- GIVEN a run with the pull request `pr:github:44`
- WHEN the card shows
- THEN it shows #44

### Requirement: REQ-034 Runs list bar

The Runs list SHALL show no stat tiles. One bar SHALL hold the search, a filter (All, Needs you, Mine) and a Board and History switch.

#### Scenario: Runs list bar

- GIVEN the filter Needs you
- WHEN the board shows
- THEN only the runs that wait for a person show

### Requirement: REQ-035 Five lanes that fit

The board SHALL have five lanes: Queued, Working, Needs you, In review, Ready to merge. At a window width of 1100 px or more the lanes SHALL fit with no sideways scroll. An empty lane SHALL show the empty pattern.

#### Scenario: Five lanes that fit

- GIVEN a window of 1100 px
- WHEN the board shows
- THEN the five lanes show with no sideways scroll

### Requirement: REQ-036 Run history

History SHALL list each ended run and each older run of a ticket, newest end first, with search. A row SHALL open the run.

#### Scenario: Run history

- GIVEN two runs of one ticket, the first failed
- WHEN the person opens History
- THEN both runs show

### Requirement: REQ-037 Run card

A run card SHALL show each fact once and the ticket key. A card that waits for a person SHALL show its one action as a button that opens the run at that action. Stop SHALL be in the card menu.

#### Scenario: Run card

- GIVEN a card in plan review
- WHEN the card shows
- THEN it has one button, Review plan

### Requirement: REQ-038 Other Factory pages

A Sessions row, a Usage run row and an Agents map node SHALL open the run. Sessions SHALL show no stat tiles. Usage SHALL show the budgets in a panel, not in the page header, and SHALL show the success rate. The Agents map SHALL label a node with the ticket title. The Workflows list SHALL show the step names, and its file actions SHALL be in a menu.

#### Scenario: Other Factory pages

- GIVEN a row of Factory / Sessions
- WHEN the person opens it
- THEN the run page opens on the Workflow tab at that session

### Requirement: REQ-039 Diagram frame

A diagram or a picture in the zoom frame SHALL fit the frame and be centred at the first paint. The person SHALL pan it in both directions and zoom it. Fit SHALL bring it back.

#### Scenario: Diagram frame

- GIVEN a model wider than the frame
- WHEN Design / Architecture shows it
- THEN the whole model shows, and a drag moves it sideways

### Requirement: REQ-040 A tool that ends

When a program that Shipyard starts ends with an error, the message SHALL name the program, its exit code and its last lines, and SHALL give one action.

#### Scenario: A tool that ends

- GIVEN the code graph program ends with code 1
- WHEN the person clicks Index
- THEN the page names the program, the code and its last line

### Requirement: REQ-041 Pull request page

A pull request SHALL open as its own page with its own address. The page SHALL show the title, the state, the source and target branch, the lines added and removed, and the tabs Overview, Commits, Checks and Files changed with their counts. Back SHALL return to the list with its search and filters kept.

#### Scenario: Pull request page

- GIVEN a pull request in the list
- WHEN the person opens it
- THEN the page shows its title, branches and tabs, and Back returns to the list with the same filters

### Requirement: REQ-042 Pull request list

The pull request list SHALL be a full-width page with a search, a filter (All, Mine, Needs review) and the state groups open, merged and closed. Each row SHALL show the number, the title, the author, the draft state, the checks state and the review state.

#### Scenario: Pull request list

- GIVEN a list of eight pull requests
- WHEN the person types a word in the search
- THEN only the pull requests that match it show

### Requirement: REQ-043 Merge box

The Overview tab SHALL start with a merge box that says whether the pull request can merge and why not. It SHALL have three segments: Checks (passing, failing and pending counts), Comments (unresolved threads) and Approvals (reviewers with their verdicts). It SHALL hold the merge action as a split button whose menu lists the merge methods. Merge SHALL keep its confirmation, its draft rule and its right.

#### Scenario: Merge box

- GIVEN a pull request with two failing checks and one unresolved thread
- WHEN the Overview shows
- THEN the box names two failing checks and one unresolved thread, and Merge asks for a confirmation that names the method

### Requirement: REQ-044 Description and sidebar

The Overview SHALL show the description as Markdown, then the conversation. A narrow column SHALL show the reviewers with their verdicts, the labels, and the linked tickets and runs. It SHALL show no assignee, project or milestone.

#### Scenario: Description and sidebar

- GIVEN a pull request that links a ticket
- WHEN the Overview shows
- THEN the sidebar lists the ticket as a link

### Requirement: REQ-045 Files changed

The Files changed tab SHALL list every file collapsed by default, each with its path, its status and its lines added and removed. It SHALL show a file tree with a filter, an Expand all and a Collapse all action, and a count of the files that the person marked as viewed. A file that the person expands SHALL show its diff.

#### Scenario: Files changed

- GIVEN a pull request with forty files
- WHEN the Files changed tab shows
- THEN all forty rows are collapsed, and expanding one shows its diff

### Requirement: REQ-046 Shared file parts

The Files changed tab SHALL use the same file rows, file tree, counts and diff component as the run page and Code / Local changes. The diff component SHALL show line numbers.

#### Scenario: Shared file parts

- GIVEN a diff on the pull request page and one on the run page
- WHEN both show
- THEN they use the same diff component with line numbers

### Requirement: REQ-047 General comments

The conversation SHALL show the general comments of the pull request and its review threads, in time order, as Markdown, with the author and the time. A write box SHALL post a general comment. A comment of the forge SHALL show after the forge answers.

#### Scenario: General comments

- GIVEN a pull request with two comments
- WHEN the Overview shows
- THEN both comments show with their author and time

### Requirement: REQ-048 Threads

A review thread SHALL show its file and line, its comments, and a Resolved mark. A person SHALL reply to a thread and SHALL resolve or reopen it with one click each.

#### Scenario: Threads

- GIVEN an unresolved thread
- WHEN the person clicks Resolve
- THEN the thread shows the Resolved mark and the box counts one unresolved thread fewer

### Requirement: REQ-049 Inline comments

A person SHALL add a comment to a line of the new file on the Files changed tab with a button in the line gutter. The comment SHALL join a pending review kept on this computer. The page SHALL show the number of pending comments with Submit review and Discard. Submit review SHALL post all of them with one verdict: Comment, Approve or Request changes. A person SHALL also post one comment at once.

#### Scenario: Inline comments

- GIVEN two pending comments on two lines
- WHEN the person clicks Submit review and picks Comment
- THEN the forge receives one review with both comments and the pending list is empty

### Requirement: REQ-050 Pending review is kept

A pending review SHALL stay on this computer until the person submits or discards it. It SHALL survive a restart. A line that the pull request no longer has SHALL keep its comment text visible so that no text is lost.

#### Scenario: Pending review is kept

- GIVEN a pending comment and a restart
- WHEN the person opens the pull request again
- THEN the pending comment is still there

### Requirement: REQ-051 Forge limits

When a forge refuses a comment, a reply or a review, the page SHALL show the refusal text and SHALL keep the pending text. Azure DevOps SHALL post an inline comment in the review body with its file and line. A pull request with more than 100 files SHALL show all of them.

#### Scenario: Forge limits

- GIVEN a forge that refuses an inline comment
- WHEN the person submits the review
- THEN the refusal shows and the pending comments stay

### Requirement: REQ-052 Pull request rights

Reply, resolve, inline comment, submit review and general comment SHALL need a click of a person and the right to write to the code host. A person without it SHALL see each control off with its reason.

#### Scenario: Pull request rights

- GIVEN a viewer
- WHEN the person opens a pull request
- THEN the write box, the reply, the resolve and the submit controls are off with their reason

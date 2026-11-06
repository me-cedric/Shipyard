# Spec: team-rights

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:add-team-rights`

### Goal

A whole project team works in Shipyard. Each person has the rights of their job, set once by the team in the repository, and Shipyard shows each person the work of their job first. The backend checks each write, and an audit log keeps who did it.

### Why

The role is a choice on each machine, and any person can change it. The backend checks only the read-only flag, and any person can turn it off. Approve, merge, automation and workflow saves have no check. The team file has no e-mail and a role in free text, so Shipyard cannot find the person in it. Home and the Inbox are the same for each role.

### Users And Scenarios

- PO: opens on Work / Backlog and sees the ready items and the backlog health on Home. Cannot merge code.
- PM: sees the plan, the capacity, the risks and the spend on Home. Gets no approval of an agent write in the Inbox.
- Architect: opens on Design / Decisions, sees the ADRs, the drift and the design questions on Home, and merges a pull request.
- Tech lead: adds the team in Work / Team, gives a developer the right `code.merge`, and approves the plans of the agents.
- BA: edits a spec change and answers the questions of the specs from the Inbox.
- Developer: sees their tickets, their pull requests and their review requests on Home. Starts a run and approves its writes.
- QA: opens on Specs / Test plans and sees the failing checks on Home.
- Designer: opens on Design / Screens and edits the screens.
- New person: clones the project, reads everything, and asks an admin to add them.

### Areas And Levels

Each role has one level in each area: `none` hides the area, `read` shows it, `write` shows it and lets the person change it.

| Area | Holds | Space |
| ---- | ----- | ----- |
| `work` | Tickets, backlog, board, plan, estimates, team, time. | Work |
| `specs` | Spec changes, capabilities, questions, test plans, constitution. | Specs |
| `design` | Diagrams, ADRs, API, data, flows and screens. | Design |
| `knowledge` | Handbook, documents, slides, dashboards. | Knowledge |
| `code` | Commit, push, branch, pull request. | Code |
| `runs` | Runs, workflows, agent reviews. | Factory |
| `settings` | Automation switches, workflows, connections, Settings / Project, the team file through the app. | Settings |
| `costs` | Amounts of money: spend, budgets, day rates. | none |

### Rights

A right is the old name of a level. The backend checks a right, and a right is valid when the level of its area is high enough.

| Right | Needs |
| ----- | ----- |
| `work.edit` | `work` write |
| `specs.edit` | `specs` write |
| `design.edit` | `design` write |
| `knowledge.edit` | `knowledge` write |
| `code.write` | `code` write |
| `code.merge` | `code` write and the action `merge` |
| `runs.start` | `runs` write |
| `runs.approve` | `runs` write and the action `approve` |
| `project.settings` | `settings` write |
| `costs.view` | `costs` read |

### Default Levels Of Each Role

| Role | work | specs | design | knowledge | code | runs | settings | costs | merge | approve |
| ---- | ---- | ----- | ------ | --------- | ---- | ---- | -------- | ----- | ----- | ------- |
| po | write | write | read | write | read | read | read | read | no | no |
| pm | write | read | read | write | read | read | read | read | no | no |
| architect | write | write | write | write | write | write | read | read | yes | yes |
| techlead | write | write | write | write | write | write | write | write | yes | yes |
| ba | write | write | read | write | read | write | read | none | no | no |
| developer | write | read | write | write | write | write | read | none | no | yes |
| qa | write | write | read | write | write | write | read | none | no | no |
| designer | write | read | write | write | read | read | read | none | no | no |
| viewer | read | read | read | read | read | read | read | none | no | no |

The `roles:` block of the team file changes this table for the team, one role and one cell at a time:

```yaml
roles:
  developer: { code: write, settings: read, merge: true }
```

### Home And First Tab Of Each Role

| Role | First tab | Today panels |
| ---- | --------- | ------------ |
| po | Work / Backlog | Backlog health, ready items, roadmap |
| pm | Work / Board | Plan, capacity, risks, spend |
| architect | Design / Decisions | ADRs, drift, design questions |
| techlead | Factory / Runs | Runs, quality, pull request review load |
| ba | Specs / Changes | Spec changes, open questions |
| developer | Factory / Runs | My tickets, my pull requests, review requests |
| qa | Specs / Test plans | Test plans, failing checks |
| designer | Design / Screens | Screens, design questions |
| viewer | Home / Today | My tickets |

### Requirements

- REQ-001: `.shipyard/team.yaml` SHALL be the one source of the roles and the rights. Each member SHALL have `emails`, the accounts of the issue tracker and the code host, a `role` or a list `roles`, an `admin` flag and optional `rights` overrides (`+right`, `-right`). A `roles:` block MAY change the default levels of a role. An unknown role SHALL give `viewer`. An unknown right, role, area or level SHALL have no effect, and Settings / Health SHALL show it as a finding.
- REQ-002: When the project has a remote, Shipyard SHALL read the rights from the team file of the default branch, as last fetched. A change of the team file in the working copy or on another branch SHALL NOT change a right until it is on the default branch. Shipyard SHALL show a warning while the team file of the working copy differs.
- REQ-003: Shipyard SHALL find the person first from the account of a signed-in issue tracker or code host connection, as its token gives it, in the accounts of a member. Else from `git config user.email` in the `emails` of a member. Else the person is unknown. When two accounts match two members, the person SHALL be unknown. Work / Team SHALL show the member found and how.
- REQ-004: A project with no team file, or a team file with no admin, SHALL give each person every right, and Health SHALL name the missing admin. When the team file has an admin, an unknown person SHALL get the role `viewer`.
- REQ-005: The roles SHALL be `po`, `pm`, `architect`, `techlead`, `ba`, `developer`, `qa`, `designer` and `viewer`, with the default levels of the table and the `roles:` block. The level of a person in an area SHALL be the highest level of their roles, then the overrides apply. A write SHALL need `write` on its area, and `code.merge` and `runs.approve` also their switch. The `admin` flag SHALL give `write` in each area and each action. Without `costs.view`, amounts of money SHALL show as hidden.
- REQ-006: The personal role of Settings / Me and the read-only profile of a project SHALL only lower levels. The level of the person in each area SHALL be the lower of the level of the team file and the level of the personal role. The read-only profile SHALL leave `read` at most. Without a personal role, the levels of the team file apply. Settings SHALL never be `none` for an admin.
- REQ-007: Each write command of the app and each write tool of the Shipyard MCP server SHALL check its right in the backend before it writes. A refusal SHALL name the missing right and the role. The check SHALL take the place of the read-only check.
- REQ-008: Each view SHALL ask the backend for the rights and the levels of the person. A control that needs a missing right SHALL be off, and its accessible name and its tooltip SHALL give the missing right. A missing right SHALL NOT hide a view, a tab or a control: only the level `none` hides an area (REQ-018).
- REQ-009: A run SHALL keep the member who started it. A write of the run SHALL need the right of that member and its automation switch. When the member does not have the right, the write SHALL wait in the Inbox for a person who has it.
- REQ-010: Each gated write and each refusal SHALL add one line to the audit log of the project in the app data folder: time, member or unknown, how Shipyard found the person, right, command or tool, target ref and result. Each event of a run log SHALL carry `by`. Work / Team SHALL show the last 100 lines to a person with `project.settings`.
- REQ-011: An unknown person SHALL ask to join from Work / Team: name, e-mail, account and asked role. Shipyard SHALL write the member with the role `viewer` and the asked role in the pull request text, on a new branch, and open a pull request for an admin. Without a code host connection, Shipyard SHALL copy the member entry for the person to send.
- REQ-012: Home / Today SHALL show the panels of the role of the person, as the table lists, before the sections of `home-today`. A panel with nothing to show SHALL hide. A panel that shows money SHALL need `costs.view`.
- REQ-013: Each role SHALL open on its first tab, as the table lists. The sidebar SHALL put the space of the first tab after Home.
- REQ-014: The Inbox SHALL show an approval to each person with its right, a question to the assignee of its ticket and to the roles that own its topic, and a review request to the requested reviewers. The view "Everyone" SHALL show each item, one click away.
- REQ-015: When this machine has project roles or an e-mail to role map, Shipyard SHALL propose once to write them in the team file as members. A person with `project.settings` SHALL confirm. The proposal SHALL map `lead` to `po` and `junior` to `developer` with `-code.merge` and `-runs.approve`, and SHALL list each page mode that it drops.
- REQ-016: Work / Team SHALL offer a guided setup: add a member with name, e-mail and an account from the connections, pick a role, set the admin flag and the overrides. Each role SHALL show its rights before the save. The save SHALL write through the shared YAML writer and SHALL offer a pull request.
- REQ-017: Every view of this capability SHALL exist in English and French, SHALL work with the keyboard only, and SHALL give each off control an accessible name with its reason.
- REQ-018: The level `none` SHALL hide its area: its space SHALL leave the sidebar, the tabs and the palette, and a direct route to it SHALL show "No access". Settings / Me SHALL stay. The read tools of the Shipyard MCP server for that area SHALL refuse, for the runs of the member and for an outside agent of the person. The read commands of the app SHALL NOT check the level: the files are on the disk of the person.
- REQ-019: A change of the `roles:` block or of the roles of a member through the app SHALL need `project.settings` and SHALL add an audit line. A save of the team SHALL keep one admin: the last admin cannot remove their own settings write.

### Non-Goals

- A lock on the files of the repository. A person can change a file with another tool. The branch protection of the code host stays the wall.
- A sign-in to Shipyard itself. Shipyard uses the connections and git.
- Rights on one ticket, one spec or one file.
- New roles. The nine roles are fixed. The `roles:` block changes their levels, and the overrides of a member change the rights.
- A change of the onboarding tour (`add-onboarding-tour`).

### Acceptance Criteria

- [ ] A project with no team file gives each right to the person.
- [ ] With two members in the team file, a person with an unknown e-mail can read each view and cannot save a ticket. The backend refuses the save.
- [ ] A developer cannot merge a pull request. The Merge control is off and names `code.merge`.
- [ ] A team file that gives `admin` to the person in the working copy only gives no right before the merge.
- [ ] A refused MCP tool call adds a line to the audit log.
- [ ] A PO opens on Work / Backlog and sees the panel of the ready items.
- [ ] The proposal writes the e-mail to role map of this machine as members after one confirmation.
- [ ] A role with the level `none` in `code` does not see Code, and a run of its member cannot read a commit ref.

## ADDED Requirements

### Requirement: REQ-001 Team file

`.shipyard/team.yaml` SHALL be the one source of the roles and the rights. Each member SHALL have `emails`, the accounts of the issue tracker and the code host, a `role` or a list `roles`, an `admin` flag and optional `rights` overrides (`+right`, `-right`). A `roles:` block MAY change the default levels of a role. An unknown role SHALL give `viewer`. An unknown right, role, area or level SHALL have no effect, and Settings / Health SHALL show it as a finding.

#### Scenario: Unknown role
- GIVEN a team file where the member `ana` has the role `lead dev`
- WHEN Shipyard loads the team
- THEN `ana` has the rights of `viewer`
- AND Settings / Health shows a finding for the role of `ana`

#### Scenario: Unknown level in the roles block
- GIVEN a team file with the `roles:` block `qa: { code: maybe }`
- WHEN Shipyard loads the team
- THEN `qa` keeps its default level in `code`
- AND Settings / Health shows a finding for `roles.qa.code`

### Requirement: REQ-002 Rights from the default branch

When the project has a remote, Shipyard SHALL read the rights from the team file of the default branch, as last fetched. A change of the team file in the working copy or on another branch SHALL NOT change a right until it is on the default branch. Shipyard SHALL show a warning while the team file of the working copy differs.

#### Scenario: Local edit
- GIVEN the developer `bo` sets `admin: true` for `bo` in the team file of the working copy
- WHEN `bo` saves Settings / Project
- THEN the backend refuses the save and names `project.settings`
- AND Work / Team shows the warning that the team file differs from the default branch

### Requirement: REQ-003 Identity

Shipyard SHALL find the person first from the account of a signed-in issue tracker or code host connection, as its token gives it, in the accounts of a member. Else from `git config user.email` in the `emails` of a member. Else the person is unknown. When two accounts match two members, the person SHALL be unknown. Work / Team SHALL show the member found and how.

#### Scenario: Account wins
- GIVEN the code host connection gives the login `ana-gh`, which is an account of `ana`
- AND the git e-mail is an e-mail of `bo`
- WHEN Shipyard finds the person
- THEN the person is `ana`, found from the code host account

### Requirement: REQ-004 Solo and unknown person

A project with no team file, or a team file with no admin, SHALL give each person every right, and Health SHALL name the missing admin. When the team file has an admin, an unknown person SHALL get the role `viewer`.

#### Scenario: Solo
- GIVEN a project with no team file
- WHEN the person opens Settings / Project
- THEN each control is on

#### Scenario: Team file with no admin
- GIVEN a team file with one member and no admin
- WHEN a person opens Settings / Project
- THEN each control is on and Health names the missing admin

#### Scenario: Unknown person
- GIVEN a team file with an admin and a person who matches no member
- WHEN the person opens a ticket
- THEN the ticket shows and its Save control is off

### Requirement: REQ-005 Roles and default rights

The roles SHALL be `po`, `pm`, `architect`, `techlead`, `ba`, `developer`, `qa`, `designer` and `viewer`, with the default levels of the table and the `roles:` block. The level of a person in an area SHALL be the highest level of their roles, then the overrides apply. A write SHALL need `write` on its area, and `code.merge` and `runs.approve` also their switch. The `admin` flag SHALL give `write` in each area and each action. Without `costs.view`, amounts of money SHALL show as hidden.

#### Scenario: Override
- GIVEN the member `bo` has the role `developer` and the right `+code.merge`
- WHEN `bo` opens a pull request that is ready
- THEN the Merge control is on

#### Scenario: No cost right
- GIVEN the member `cy` has the role `qa`
- WHEN `cy` opens Factory / Usage
- THEN the amounts of money show as hidden

#### Scenario: Two roles
- GIVEN the member `ana` has the roles `po` and `designer`
- WHEN Shipyard gives the levels of `ana`
- THEN `ana` has `write` in `specs` and in `design`

### Requirement: REQ-006 Personal narrowing

The personal role of Settings / Me and the read-only profile of a project SHALL only lower levels. The level of the person in each area SHALL be the lower of the level of the team file and the level of the personal role. The read-only profile SHALL leave `read` at most. Without a personal role, the levels of the team file apply. Settings SHALL never be `none` for an admin.

#### Scenario: No widening
- GIVEN the member `dee` has the role `pm` in the team file
- WHEN `dee` chooses the personal role `techlead` in Settings / Me
- THEN `dee` still has no `code.merge`

#### Scenario: Read only
- GIVEN the member `ana` is an admin and turns on the read-only profile of the project
- WHEN `ana` saves a ticket
- THEN the backend refuses the save

### Requirement: REQ-007 Backend check

Each write command of the app and each write tool of the Shipyard MCP server SHALL check its right in the backend before it writes. A refusal SHALL name the missing right and the role. The check SHALL take the place of the read-only check.

#### Scenario: MCP tool refused
- GIVEN the person is `viewer` and an outside agent runs with the Shipyard MCP server
- WHEN the agent calls `ticket_comment`
- THEN the tool returns an error that names `work.edit` and `viewer`
- AND the issue tracker gets no comment

### Requirement: REQ-008 Same result in the view

Each view SHALL ask the backend for the rights and the levels of the person. A control that needs a missing right SHALL be off, and its accessible name and its tooltip SHALL give the missing right. A missing right SHALL NOT hide a view, a tab or a control: only the level `none` hides an area (REQ-018).

#### Scenario: Merge off
- GIVEN the member `bo` has the role `developer`
- WHEN `bo` opens a pull request that is ready
- THEN the Merge control shows, is off, and its tooltip names `code.merge`

### Requirement: REQ-009 Runs act for a member

A run SHALL keep the member who started it. A write of the run SHALL need the right of that member and its automation switch. When the member does not have the right, the write SHALL wait in the Inbox for a person who has it.

#### Scenario: Push waits
- GIVEN the member `cy` has the role `qa` with `-code.write`, and the switch `push` is on
- WHEN a run that `cy` started asks to push
- THEN the push waits in the Inbox
- AND a person with `code.write` sends it with one click

### Requirement: REQ-010 Audit log

Each gated write and each refusal SHALL add one line to the audit log of the project in the app data folder: time, member or unknown, how Shipyard found the person, right, command or tool, target ref and result. Each event of a run log SHALL carry `by`. Work / Team SHALL show the last 100 lines to a person with `project.settings`.

#### Scenario: Refusal logged
- GIVEN the person is `viewer`
- WHEN the person tries to save a ticket
- THEN the audit log has a line with `viewer`, `work.edit`, the ticket ref and the result refused

### Requirement: REQ-011 Ask to join

An unknown person SHALL ask to join from Work / Team: name, e-mail, account and asked role. Shipyard SHALL write the member with the role `viewer` and the asked role in the pull request text, on a new branch, and open a pull request for an admin. Without a code host connection, Shipyard SHALL copy the member entry for the person to send.

#### Scenario: Join request
- GIVEN an unknown person with a code host connection
- WHEN the person asks to join as `qa`
- THEN a pull request adds the person to the team file with the role `viewer`
- AND its text names the asked role `qa`

### Requirement: REQ-012 Role panels on Today

Home / Today SHALL show the panels of the role of the person, as the table lists, before the sections of `home-today`. A panel with nothing to show SHALL hide. A panel that shows money SHALL need `costs.view`.

#### Scenario: PO panels
- GIVEN the member `eve` has the role `po` and three tickets are ready
- WHEN `eve` opens Home / Today
- THEN the panel of the ready items lists the three tickets

### Requirement: REQ-013 First tab of each role

Each role SHALL open on its first tab, as the table lists. The sidebar SHALL put the space of the first tab after Home.

#### Scenario: Architect
- GIVEN the member `ana` has the role `architect` and no last view
- WHEN `ana` opens the project
- THEN the main area shows Design / Decisions
- AND Design is the second space of the sidebar

### Requirement: REQ-014 Inbox routing

The Inbox SHALL show an approval to each person with its right, a question to the assignee of its ticket and to the roles that own its topic, and a review request to the requested reviewers. The view "Everyone" SHALL show each item, one click away.

#### Scenario: Approval routing
- GIVEN a run waits for the approval of its plan
- WHEN the member `dee` with the role `pm` opens the Inbox
- THEN the approval does not show
- AND it shows after one click on "Everyone", with its control off

### Requirement: REQ-015 Migration of the machine roles

When this machine has project roles or an e-mail to role map, Shipyard SHALL propose once to write them in the team file as members. A person with `project.settings` SHALL confirm. The proposal SHALL map `lead` to `po` and `junior` to `developer` with `-code.merge` and `-runs.approve`, and SHALL list each page mode that it drops.

#### Scenario: Confirm
- GIVEN this machine maps `eve@example.com` to `lead` for the project
- WHEN an admin confirms the proposal
- THEN the team file has a member with the e-mail `eve@example.com` and the role `po`
- AND the registry of this machine has no e-mail to role map for the project

### Requirement: REQ-016 Guided setup

Work / Team SHALL offer a guided setup: add a member with name, e-mail and an account from the connections, pick a role, set the admin flag and the overrides. Each role SHALL show its rights before the save. The save SHALL write through the shared YAML writer and SHALL offer a pull request.

#### Scenario: Add a member
- GIVEN an admin in Work / Team
- WHEN the admin adds `fay` with the role `designer`
- THEN the view lists the rights of `designer` before the save
- AND the save writes `fay` to the team file

### Requirement: REQ-017 Languages and accessibility

Every view of this capability SHALL exist in English and French, SHALL work with the keyboard only, and SHALL give each off control an accessible name with its reason.

#### Scenario: Screen reader
- GIVEN the person has no `code.merge`
- WHEN the focus reaches the Merge control
- THEN a screen reader reads the name of the control and the missing right

### Requirement: REQ-018 Hidden areas

The level `none` SHALL hide its area: its space SHALL leave the sidebar, the tabs and the palette, and a direct route to it SHALL show "No access". Settings / Me SHALL stay. The read tools of the Shipyard MCP server for that area SHALL refuse, for the runs of the member and for an outside agent of the person. The read commands of the app SHALL NOT check the level: the files are on the disk of the person.

#### Scenario: Hidden space
- GIVEN the `roles:` block gives `designer` the level `none` in `code`
- WHEN the member `fay` with the role `designer` opens `/code/history`
- THEN the sidebar has no Code
- AND the main area shows "No access"

#### Scenario: Hidden area in a run
- GIVEN the member `fay` has the level `none` in `work`
- WHEN a run that `fay` started calls `read_ticket`
- THEN the tool returns an error that names the hidden area `work`

### Requirement: REQ-019 Edit of the role table

A change of the `roles:` block or of the roles of a member through the app SHALL need `project.settings` and SHALL add an audit line. A save of the team SHALL keep one admin: the last admin cannot remove their own settings write.

#### Scenario: Last admin
- GIVEN the member `ana` is the one admin of the team
- WHEN `ana` removes her admin flag in Work / Team
- THEN the backend refuses the save

# Spec: home-today

## Purpose

Status: Settled
Owner: Cédric Meyer
Created: 2026-11-05
Change: `change:update-home-today`

### Goal

Home opens on one page, Today, that tells the person what to do now and what changed for them.

### Why

My work and Activity repeat Work / Backlog and the Factory run log, and their tiles are a hidden second dashboard. A person with little technical knowledge cannot tell what each tab is for.

### Users And Scenarios

- Developer: opens the app, sees one review that waits for them, approves it in place, then sees their two tickets in progress and the run that works on one of them.
- Project manager: sees the questions that wait for an answer and the tickets assigned to them, with no project-wide log.
- Junior: after a day away, reads the four events on their own tickets since the last visit.

### Requirement list

- REQ-001: The Home space SHALL have two views: Today and Projects. Today SHALL be the first tab and the default page of Home.
- REQ-002: Today SHALL show a "Needs you" section with the content and the actions of the Inbox (shell REQ-004). The section SHALL hide when nothing waits.
- REQ-003: Today SHALL show the tickets assigned to the person, grouped by state category (in progress, to do, done in the last 7 days), with the status change and the start of a run in the row. The section SHALL hide when the person has no ticket.
- REQ-004: Today SHALL show the agent runs on the tickets of the person that are working or wait for them, with their state and a Stop action. The section SHALL hide when no such run exists.
- REQ-005: Today SHALL show the events of the tickets and the runs of the person since the last visit of Today, newest first, at most 20. The last visit SHALL be a per-person setting.
- REQ-006: A Today with nothing in any section SHALL show one empty state with one action to open Work / Backlog.
- REQ-007: The pinned tiles SHALL show at the top of Knowledge / Dashboards, not on Home. A pin SHALL stay a per-person setting.
- REQ-008: The addresses `/home/inbox`, `/home/my-work` and `/home/activity` SHALL open Today.
- REQ-009: Every label SHALL exist in English and French. Today SHALL work with the keyboard only and keep a level-one heading while it loads.

### Non-Goals

- A change to the content or the rules of the Inbox approvals (shell REQ-004).
- A project-wide event log on Home: Factory / Runs keeps it.
- New tile kinds.

### Acceptance Criteria

- [x] Home shows two tabs, Today and Projects, and opens on Today.
- [x] An approval that waits shows in Needs you on Today, and one click sends it.
- [x] My tickets show grouped by state, with status and Start run in the row.
- [x] A live run on my ticket shows with Stop; a run on another person's ticket does not.
- [x] After a visit, only the newer events of my tickets and runs show.
- [x] An empty Today shows one empty state with Open the backlog.
- [x] A tile pinned before shows at the top of Knowledge / Dashboards.
- [x] `/home/my-work` opens Today.

## Requirements

### Requirement: REQ-001 Two Home views

The Home space SHALL have two views: Today and Projects. Today SHALL be the first tab and the default page of Home.

#### Scenario: Open Home
- GIVEN the person opens Home
- WHEN Home renders
- THEN the tabs are Today and Projects
- AND Today is open

### Requirement: REQ-002 Needs you

Today SHALL show a "Needs you" section with the content and the actions of the Inbox (shell REQ-004). The section SHALL hide when nothing waits.

#### Scenario: Approve in place
- GIVEN a pull request write that waits for its approval
- WHEN the person opens Today
- THEN Needs you shows the approval
- AND one click on it sends the write

### Requirement: REQ-003 My tickets

Today SHALL show the tickets assigned to the person, grouped by state category (in progress, to do, done in the last 7 days), with the status change and the start of a run in the row. The section SHALL hide when the person has no ticket.

#### Scenario: Grouped tickets
- GIVEN the person has one ticket in progress and two to do
- WHEN Today renders
- THEN In progress holds one row and To do holds two
- AND each row offers its status and Start run

### Requirement: REQ-004 My agents

Today SHALL show the agent runs on the tickets of the person that are working or wait for them, with their state and a Stop action. The section SHALL hide when no such run exists.

#### Scenario: Only my runs
- GIVEN a run that works on a ticket of the person and a run on a ticket of another person
- WHEN Today renders
- THEN My agents shows the first run with Stop
- AND not the second

### Requirement: REQ-005 Since you were away

Today SHALL show the events of the tickets and the runs of the person since the last visit of Today, newest first, at most 20. The last visit SHALL be a per-person setting.

#### Scenario: Newer events only
- GIVEN the person opened Today yesterday
- AND two events happened on their runs since
- WHEN the person opens Today
- THEN the section shows the two events, newest first

### Requirement: REQ-006 Empty Today

A Today with nothing in any section SHALL show one empty state with one action to open Work / Backlog.

#### Scenario: Nothing to show
- GIVEN no approval, no ticket, no run and no event for the person
- WHEN Today renders
- THEN one empty state shows with Open the backlog

### Requirement: REQ-007 Pinned tiles in Dashboards

The pinned tiles SHALL show at the top of Knowledge / Dashboards, not on Home. A pin SHALL stay a per-person setting.

#### Scenario: Existing pin
- GIVEN the person pinned a tile before this change
- WHEN the person opens Knowledge / Dashboards
- THEN the tile shows at the top of the page
- AND Home shows no tile

### Requirement: REQ-008 Old addresses

The addresses `/home/inbox`, `/home/my-work` and `/home/activity` SHALL open Today.

#### Scenario: Old link
- GIVEN a saved link to `/home/my-work`
- WHEN the person opens it
- THEN Today opens

### Requirement: REQ-009 Language and keyboard

Every label SHALL exist in English and French. Today SHALL work with the keyboard only and keep a level-one heading while it loads.

#### Scenario: French
- GIVEN the language is French
- WHEN Today renders
- THEN every label is in French

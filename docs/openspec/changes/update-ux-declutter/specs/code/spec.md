# Spec: code (delta of update-ux-declutter)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-12
Change: `change:update-ux-declutter`

### Goal

A person reads, reviews and merges a pull request on one page, with the files collapsed, and comments on the diff.

### Why

The detail pane shows every file in a flat list and one diff, the description as plain text, the threads as plain strings, and offers no inline comment, reply or resolve.

### Users And Scenarios

- Developer: opens a pull request, expands two files, adds three line comments and submits one review.
- Architect: reads the files of a pull request before approval.
- QA: reads the checks and the unresolved threads in one box.

### Requirements

- REQ-018: Code / Pull requests SHALL list the mirror pull requests of every forge in one full-width layout, with a search and a filter, and SHALL open a pull request as its own page.
- REQ-019: A pull request page SHALL show its description, a conversation, its commits, its CI checks and its files, in the tabs Overview, Commits, Checks and Files changed. The files SHALL be collapsed by default.

### Non-Goals

- Assignees, projects, milestones, reopen and convert to draft.

### Acceptance Criteria

- [ ] The list shows each row's author and filters by search and by Mine and Needs review.
- [ ] A pull request opens at its own address with the four tabs.
- [ ] Files changed starts collapsed.

### Existing References

- Existing code/docs/specs: `specs/code` REQ-018 and REQ-019, `changes/update-ux-declutter/specs/ux-declutter` REQ-041 to REQ-052.
- Supersedes or extends: `spec:code#REQ-018`, `spec:code#REQ-019`.

## MODIFIED Requirements

### Requirement: REQ-018 Pull request list

Code / Pull requests SHALL list the mirror pull requests of every forge in one full-width layout. Each row SHALL show the `pr:` ref, title, author, draft state, CI state and review state. The list SHALL have a search and SHALL filter by state, author and Needs review. The list MUST NOT call the forge for a read. A pull request SHALL open as its own page.

#### Scenario: Offline

- GIVEN the network is off
- WHEN a person opens Code / Pull requests
- THEN the list shows the mirror

#### Scenario: Search

- GIVEN eight pull requests
- WHEN a person types a word of a title
- THEN only the pull requests that match show

### Requirement: REQ-019 Pull request detail

A pull request page SHALL show its description as Markdown, its conversation, its commits, its CI checks and its files with their diff, in the tabs Overview, Commits, Checks and Files changed. Each CI check SHALL show its name and state. The files SHALL be collapsed by default and SHALL expand one by one.

#### Scenario: Open a pull request

- GIVEN a pull request with two failed checks
- WHEN a person opens it
- THEN the Checks tab names the two failed checks

#### Scenario: Files collapsed

- GIVEN a pull request with forty files
- WHEN a person opens the Files changed tab
- THEN all forty files show collapsed with their counts

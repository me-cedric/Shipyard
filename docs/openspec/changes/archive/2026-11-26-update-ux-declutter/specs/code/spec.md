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

- REQ-018: Code / Pull requests SHALL list the mirror pull requests of every forge in one full-width layout, with a search and the filters All and Needs review, and SHALL open a pull request as its own page. The list SHALL show no stat strip: the group counts carry the numbers.
- REQ-019: A pull request page SHALL show its description, a conversation, its commits, its CI checks and its files, in the tabs Overview, Commits, Checks and Files changed. The files SHALL be collapsed by default.

### Non-Goals

- Assignees, projects, milestones, reopen and convert to draft.

### Acceptance Criteria

- [ ] The list shows no stat strip and filters by search and by All and Needs review.
- [ ] A pull request opens at its own address with the four tabs.
- [ ] Files changed starts collapsed.

### Existing References

- Existing code/docs/specs: `specs/code` REQ-018 and REQ-019, `changes/update-ux-declutter/specs/ux-declutter` REQ-041 to REQ-052.
- Supersedes or extends: `spec:code#REQ-018`, `spec:code#REQ-019`, `spec:code#REQ-024`.

## MODIFIED Requirements

### Requirement: REQ-018 Pull request list

Code / Pull requests SHALL list the mirror pull requests of every forge in one full-width layout. Each row SHALL show `#number`, title, draft state, CI state and review state; the `pr:` ref stays in the row menu and in the address. The mirror keeps no author, so a row SHALL show none. The list SHALL group by state (open, merged, closed) and SHALL have a search and the filters All and Needs review (open, not a draft, no request for changes, in the in-review lane). The list SHALL show no stat strip: the group counts carry the numbers. The list MUST NOT call the forge for a read. A pull request SHALL open as its own page.

#### Scenario: Offline

- GIVEN the network is off
- WHEN a person opens Code / Pull requests
- THEN the list shows the mirror

#### Scenario: Search

- GIVEN eight pull requests
- WHEN a person types a word of a title
- THEN only the pull requests that match show

#### Scenario: No stat strip

- GIVEN pull requests in three states
- WHEN a person opens Code / Pull requests
- THEN the list shows no stat strip, and each state group shows its count

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

### Requirement: REQ-024 Pull request links

A pull request page SHALL show its linked `wi:` and `run:` refs in the sidebar and its commits as `commit:` refs in the Commits tab. The sidebar SHALL show the backlinks of the pull request under Cited by. A ref of a pull request SHALL open its page, not the inspector. The pull request itself belongs to `add-delivery` (REQ-028).

#### Scenario: Run pull request
- GIVEN a pull request that a run opened for `wi:SHIP-42`
- WHEN a person opens it
- THEN the sidebar shows the `wi:SHIP-42` chip and the `run:` chip

#### Scenario: Cited by
- GIVEN a pull request that another item cites
- WHEN a person opens its page
- THEN the sidebar lists the citing item under Cited by

#### Scenario: Open by ref
- GIVEN a `pr:` ref in a ticket
- WHEN a person opens the ref
- THEN the pull request page opens

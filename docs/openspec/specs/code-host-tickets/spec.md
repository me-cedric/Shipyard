# Spec: code-host-tickets

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-20
Change: `docs/openspec/changes/archive/2026-11-26-add-redesign-functions/`

### Goal

A person can re-run checks, reviewers and merge method, join requests, releases and the other controls of the code host and the tickets that the redesign shows.

### Why

The design shows eleven controls of the code host, the tickets and the plan calendar that the app does not have. The owner asked to build them (`q:Q-173`). A release is the version of the issue tracker (`q:Q-176`).

### Requirement list

- REQ-001: The alert card of the checks SHALL have Run again beside Fix with an agent. Run again SHALL ask the code host to re-run the failed checks only: the failed jobs on GitHub, the pipeline on GitLab and the build on Azure DevOps. It SHALL need the same permission as another write to the code host.
- REQ-002: Each changed file of the assistant SHALL have Keep and Undo, and the list SHALL have Keep all. Keep SHALL accept the change of that file, and the file SHALL leave the review list. Undo SHALL revert the change of that file only. This requirement refines `spec:app-redesign#REQ-005`.
- REQ-003: The side panel of a ticket SHALL show the row Recipe. A person SHALL change it, and the change SHALL add and remove the ticket label that picks the recipe.
- REQ-004: A release SHALL be the version of the issue tracker: the fix version of Jira, the milestone of GitHub and GitLab, the iteration of Azure DevOps and the project of Linear. Shipyard SHALL read the releases into the mirror and SHALL set the release of a ticket in the issue tracker, with the permission of other writes. A ticket SHALL have one release. The ticket page, Plan and Library SHALL use the same list.
- REQ-005: Setup / Tickets SHALL have Add after the list of kinds. The person SHALL pick the parent kind and a type that exists in the issue tracker. Add SHALL refuse a kind with no type in the issue tracker. The hierarchy and the mapping SHALL use the new kind.
- REQ-006: The new pull request page SHALL have Reviewers and Merge with. Reviewers SHALL list the users of the code host, and the open SHALL ask the code host to add them. Merge with SHALL offer Merge, Squash and Rebase, and SHALL set the default method of the later Merge button. It SHALL NOT merge on its own.
- REQ-007: After the open, the new pull request page SHALL show Close the pull request and Mark as ready. Mark as ready SHALL show for a draft only.
- REQ-008: Each row of the pull requests SHALL show the avatar of its author.
- REQ-009: Each line of the action plan SHALL have a check box and an owner. The state and the owner SHALL sit in the report file as a Markdown check box and a name. Add a line SHALL end the list. A line SHALL NOT make a ticket.
- REQ-010: The join request card SHALL list the join pull requests with the choice As role, Refuse and Accept. Accept SHALL set the role in the team file and SHALL merge the pull request, and it SHALL need the merge right. Refuse SHALL close the pull request.
- REQ-011: The card Calendar of the plan SHALL show the row Release with the release of REQ-004, the row Estimate sheet, and Go to Today. Go to Today SHALL move the timeline to the current day. This requirement SHALL wait for REQ-004.

### Non-Goals

- Auto-merge of a pull request.
- A release that has no counterpart in the issue tracker.

### Acceptance Criteria

- [ ] Run again on the code host (F04): each scenario below passes.
- [ ] Keep beside Undo (F06): each scenario below passes.
- [ ] Recipe row of a ticket (F09): each scenario below passes.
- [ ] Releases (F10): each scenario below passes.
- [ ] Add a kind of ticket (F11): each scenario below passes.
- [ ] Reviewers and Merge with (F12): each scenario below passes.
- [ ] Close and Mark as ready of a new pull request (F13): each scenario below passes.
- [ ] Author on pull request rows (F14): each scenario below passes.
- [ ] Action plan of the impact report (F15): each scenario below passes.
- [ ] Accept and Refuse a join request (F23): each scenario below passes.
- [ ] Release and Go to Today of the calendar (F24): each scenario below passes.

### Existing References

- Extends: `change:update-app-redesign`, which kept the Non-Goal "No new function". This change lifts that Non-Goal for these controls (`adr:0023`).
- Existing: `spec:app-redesign#REQ-005`, `spec:sync#REQ-005`, `spec:connections#REQ-014`. Code: `crates/shipyard-forges/`, `crates/shipyard-app/src/{code,delivery,assistant}.rs`, `crates/shipyard-app/src/work/`, `crates/shipyard-core/src/{work,work_item}.rs`, `src/features/{code,assistant,work}/`.

## Requirements

### Requirement: REQ-001 Run again on the code host

The alert card of the checks SHALL have Run again beside Fix with an agent. Run again SHALL ask the code host to re-run the failed checks only: the failed jobs on GitHub, the pipeline on GitLab and the build on Azure DevOps. It SHALL need the same permission as another write to the code host.

Design control: F04

Screen: SCR-087

#### Scenario: Run again

- GIVEN a pull request with 2 of 3 checks failed
- WHEN the person selects Run again
- THEN the code host re-runs the 2 failed checks and the third check stays

#### Scenario: No permission

- GIVEN a person who has no write permission on the code host
- WHEN the person selects Run again
- THEN nothing is sent and the card says the permission is missing

### Requirement: REQ-002 Keep beside Undo

Each changed file of the assistant SHALL have Keep and Undo, and the list SHALL have Keep all. Keep SHALL accept the change of that file, and the file SHALL leave the review list. Undo SHALL revert the change of that file only. This requirement refines `spec:app-redesign#REQ-005`.

Design control: F06

Screen: SCR-014

#### Scenario: Keep a file

- GIVEN an assistant thread with two changed files
- WHEN the person selects Keep on one file
- THEN that file leaves the review list and the other file stays

#### Scenario: Undo a file

- GIVEN an assistant thread with a changed file
- WHEN the person selects Undo on it
- THEN the change of that file reverts and the other files stay

### Requirement: REQ-003 Recipe row of a ticket

The side panel of a ticket SHALL show the row Recipe. A person SHALL change it, and the change SHALL add and remove the ticket label that picks the recipe.

Design control: F09

Screen: SCR-120

#### Scenario: Change the recipe

- GIVEN a ticket with the label of the recipe Bug
- WHEN the person picks the recipe Feature
- THEN the label of Bug is removed and the label of Feature is added

### Requirement: REQ-004 Releases

A release SHALL be the version of the issue tracker: the fix version of Jira, the milestone of GitHub and GitLab, the iteration of Azure DevOps and the project of Linear. Shipyard SHALL read the releases into the mirror and SHALL set the release of a ticket in the issue tracker, with the permission of other writes. A ticket SHALL have one release. The ticket page, Plan and Library SHALL use the same list.

Design control: F10

Screen: SCR-120
Screen: SCR-146
Screen: SCR-082

#### Scenario: Read releases

- GIVEN a Jira project with the fix version MVP 1
- WHEN the project syncs
- THEN MVP 1 shows as a release on the ticket page and in Plan

#### Scenario: Set a release

- GIVEN a ticket with no release
- WHEN the person picks MVP 1
- THEN the issue tracker holds MVP 1 as the release of the ticket

#### Scenario: Linear

- GIVEN a Linear workspace with the project MVP 1
- WHEN the project syncs
- THEN the project shows as the release MVP 1

### Requirement: REQ-005 Add a kind of ticket

Setup / Tickets SHALL have Add after the list of kinds. The person SHALL pick the parent kind and a type that exists in the issue tracker. Add SHALL refuse a kind with no type in the issue tracker. The hierarchy and the mapping SHALL use the new kind.

Design control: F11

Screen: SCR-089

#### Scenario: Add a kind

- GIVEN the issue tracker has the type Spike
- WHEN the person adds the kind Spike under Story
- THEN the hierarchy shows Spike under Story

#### Scenario: No type

- GIVEN the person types a kind with no type in the issue tracker
- WHEN the person selects Add
- THEN Add refuses it

### Requirement: REQ-006 Reviewers and Merge with

The new pull request page SHALL have Reviewers and Merge with. Reviewers SHALL list the users of the code host, and the open SHALL ask the code host to add them. Merge with SHALL offer Merge, Squash and Rebase, and SHALL set the default method of the later Merge button. It SHALL NOT merge on its own.

Design control: F12

Screen: SCR-128

#### Scenario: Add a reviewer

- GIVEN a new pull request page
- WHEN the person picks the reviewer Grace and opens the pull request
- THEN the code host lists Grace as a reviewer

#### Scenario: Default method

- GIVEN the person picks Squash
- WHEN the pull request is ready to merge
- THEN the Merge button uses Squash

### Requirement: REQ-007 Close and Mark as ready of a new pull request

After the open, the new pull request page SHALL show Close the pull request and Mark as ready. Mark as ready SHALL show for a draft only.

Design control: F13

Screen: SCR-128

#### Scenario: Draft

- GIVEN a pull request that the person opened as a draft
- WHEN the page shows the actions
- THEN Mark as ready and Close the pull request show

#### Scenario: Not a draft

- GIVEN a pull request that is not a draft
- WHEN the page shows the actions
- THEN only Close the pull request shows

### Requirement: REQ-008 Author on pull request rows

Each row of the pull requests SHALL show the avatar of its author.

Design control: F14

Screen: SCR-127

#### Scenario: Author avatar

- GIVEN a pull request that Grace opened
- WHEN the person opens Pull requests
- THEN the row shows the avatar of Grace

### Requirement: REQ-009 Action plan of the impact report

Each line of the action plan SHALL have a check box and an owner. The state and the owner SHALL sit in the report file as a Markdown check box and a name. Add a line SHALL end the list. A line SHALL NOT make a ticket.

Design control: F15

Screen: SCR-124

#### Scenario: Check a line

- GIVEN an impact report with an action plan
- WHEN the person checks a line and picks the owner Grace
- THEN the report file holds the line as checked with the name Grace

#### Scenario: No ticket

- GIVEN a line with an owner
- WHEN the person saves the line
- THEN no ticket is made

### Requirement: REQ-010 Accept and Refuse a join request

The join request card SHALL list the join pull requests with the choice As role, Refuse and Accept. Accept SHALL set the role in the team file and SHALL merge the pull request, and it SHALL need the merge right. Refuse SHALL close the pull request.

Design control: F23

Screen: SCR-142

#### Scenario: Accept

- GIVEN a join request and a person with the merge right
- WHEN the person picks the role Developer and selects Accept
- THEN the team file holds the role Developer and the pull request is merged

#### Scenario: No merge right

- GIVEN a person with no merge right
- WHEN the person opens the card
- THEN Accept is off

### Requirement: REQ-011 Release and Go to Today of the calendar

The card Calendar of the plan SHALL show the row Release with the release of REQ-004, the row Estimate sheet, and Go to Today. Go to Today SHALL move the timeline to the current day. This requirement SHALL wait for REQ-004.

Design control: F24

Screen: SCR-146

#### Scenario: Go to Today

- GIVEN a timeline that shows another month
- WHEN the person selects Go to Today
- THEN the timeline shows the current day

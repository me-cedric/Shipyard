# Spec: work (delta of add-team-rights)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:add-team-rights`

### Goal

The team file holds what `team-rights` needs to find a person and give their rights.

### Why

A member has a role in free text and no e-mail, so Shipyard cannot find the person in the file or give rights from it.

### Requirements

- REQ-003: Each member of `.shipyard/team.yaml` SHALL also have e-mails, a typed role, an admin flag and optional rights overrides. The system SHALL refuse a file where two members share an e-mail.

### Non-Goals

- A rename of the `trackers` field (Q-144).

### Acceptance Criteria

- [ ] A team file with two members that share an e-mail is refused, and the last valid team stays.

## MODIFIED Requirements

### Requirement: REQ-003 Team file

The system SHALL read the team from `.shipyard/team.yaml`. Each member SHALL have a name, a handle, e-mails, the accounts of the issue tracker and the code host (`trackers`), a role and an admin flag (`team-rights` REQ-001), optional rights overrides, a capacity in days a week, skills, a day rate and an availability. The system SHALL expose each member as `member:<handle>`. The system SHALL refuse a file in which two members share a handle, an account or an e-mail.

#### Scenario: Duplicate
- GIVEN a team file where two members share a handle
- WHEN the system loads it
- THEN the system names the duplicate and keeps the last valid team

#### Scenario: Shared e-mail
- GIVEN a team file where two members share the e-mail `ana@example.com`
- WHEN the system loads it
- THEN the system names the duplicate e-mail and keeps the last valid team

# Spec: projects (delta of add-team-rights)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:add-team-rights`

### Goal

Settings / Project stops holding the roles of the team, and its save needs a right. A project override can remove rights, never give one.

### Why

Settings / Project holds the page modes and the e-mail to role map of this machine, and any person can change them or turn off the read-only profile. `team-rights` moves the roles to the team file.

### Requirements

- REQ-009: Settings / Project SHALL show the paths, the default workflow and the overrides, and SHALL NOT hold roles or page modes. A save SHALL need `project.settings`.
- REQ-010: A project override SHALL take the place of the same preference of a person. The read-only override SHALL only remove rights.

### Non-Goals

- A move of the overrides to the repository. They stay in the registry (Q-114).

### Acceptance Criteria

- [ ] Settings / Project shows no role and no page mode.
- [ ] A person without `project.settings` cannot save Settings / Project.
- [ ] A read-only override off gives no right that the team file does not give.

## MODIFIED Requirements

### Requirement: REQ-009 Settings / Project

The system SHALL show Settings / Project with the paths of each artifact kind, the default workflow and the overrides. Settings / Project SHALL write paths, the default workflow and the connection ids to `.shipyard/project.yaml`, and overrides to the registry. It SHALL NOT hold roles, page modes or an e-mail to role map: the team file of `team-rights` holds them. A save SHALL need the right `project.settings`.

#### Scenario: Change a path
- GIVEN Settings / Project
- WHEN a person changes the ADR path and saves
- THEN the project file holds the new path

#### Scenario: One primary action
- GIVEN Settings / Project with a change
- WHEN a person views the page
- THEN one primary action, Save, shows

#### Scenario: No settings right
- GIVEN the person has the role `developer`
- WHEN the person opens Settings / Project
- THEN Save is off and names `project.settings`

### Requirement: REQ-010 Overrides

A project override SHALL take the place of the same preference of a person. The registry SHALL hold each override. Settings / Project SHALL mark each overridden setting. Settings / Me SHALL show the same mark. The override MUST NOT reach the repository. The read-only override SHALL only remove rights (`team-rights` REQ-006): off, it SHALL NOT give a right that the team file does not give.

#### Scenario: Override
- GIVEN a person who prefers one value and a project override of another value in the registry
- WHEN the project is active
- THEN the project value applies and the mark shows in Settings / Me
- AND `.shipyard/project.yaml` holds no override

#### Scenario: Read only off
- GIVEN the person has the role `viewer` and turns off the read-only override
- WHEN the person saves a ticket
- THEN the backend refuses the save and names `work.edit`

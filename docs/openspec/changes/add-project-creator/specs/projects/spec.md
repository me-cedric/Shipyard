# Spec: projects (delta of add-project-creator)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:add-project-creator`

### Goal

A new project comes from the creator of `project-creator`, and the project file keeps the languages of the docs and of the pull requests.

### Why

`project-creator` replaces the name and folder form of REQ-004, and adds `languages` to the project file of REQ-007.

### Requirements

- REQ-004: The system SHALL create a new project as a new repository with a project file, through the creator of `project-creator`.
- REQ-007: The project file SHALL keep the name, the key, the paths, the default workflow, the gates, the connection ids, the tracker scope and the languages.

### Non-Goals

- A change of the project registry.

### Acceptance Criteria

- [ ] Create a project opens the creator.
- [ ] A project file with `languages` loads, and one without it loads as before.

## MODIFIED Requirements

### Requirement: REQ-004 Create a project

The system SHALL create a new project as a new Git repository with a project file. The person gives a name and a key in the creator of `project-creator`, which also sets the stack, the brief, the languages, the team and the remote.

#### Scenario: New project
- GIVEN an empty target folder
- WHEN a person gives a name and a key in the creator and clicks Create
- THEN the system creates the repository, writes the project file and opens the project

#### Scenario: Folder not empty
- GIVEN a target folder that holds files
- WHEN a person starts the creation
- THEN the system refuses and names the folder

### Requirement: REQ-007 Project file

The system SHALL keep the name, the key, the artifact paths of each kind, the default workflow, the gate commands, the connection ids (`q:Q-018`), the tracker scope and the languages of the docs and of the pull requests (`project-creator` REQ-004) in `.shipyard/project.yaml`. The gate commands are the checks that a run must pass before a pull request (`q:Q-030`). The key is short and stable. The working assumption is that the key gives the id. The file MUST NOT hold an override of a personal preference.

#### Scenario: Read
- GIVEN a valid project file
- WHEN the project opens
- THEN the name, the key, the paths, the gate commands and the languages load

#### Scenario: Invalid file
- GIVEN a project file with a bad value
- WHEN the project opens
- THEN Settings / Health shows a finding with the line and the value

#### Scenario: Connection ids
- GIVEN a person picks a tracker connection and a forge connection in Settings / Project
- WHEN the person saves
- THEN `.shipyard/project.yaml` holds the two ids under `connections`
- AND it holds no address and no secret

#### Scenario: Unknown language
- GIVEN a project file with `docs: klingon` under `languages`
- WHEN the project opens
- THEN Settings / Health shows a finding for `languages.docs`

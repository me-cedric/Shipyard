# Spec: project-creator

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:add-project-creator`

### Goal

A person makes a new project with all its settings in one guided flow: the stack, a brief, the languages of the docs and of the pull requests, the team, the remote and the issue tracker. Then Shipyard starts the work: a Factory run, or starter issues.

### Why

"Create a project" asks only for a name and a folder. The person then sets the gates, the team, the remote and the connections on other pages, and writes the first brief and the first issues by hand. No setting tells the agents in which language to write the docs.

### Users And Scenarios

- PO: makes a project for a client in French, with the docs in French and the pull requests in English, and starts a bootstrap run.
- PM: makes a project with a new private repository on GitLab and five starter issues from the scope of the brief.
- Architect: picks the Rust preset, and the gates `cargo test` and `cargo clippy` are in the project file at once.
- Tech lead: adds two developers and a QA to the team before the first commit.
- BA: edits the vision, the users and the scope in plain text, and reads the files before Create.
- Developer: makes a local project only, with no remote, in under a minute.

### Requirements

- REQ-001: Home / Projects and the first run SHALL open the creator. The creator SHALL have five steps: project, brief, team, remote, start. Each step SHALL have defaults, so that Create is on from the first step when the name and the folder are set.
- REQ-002: The project step SHALL take the name, the key (from the name, editable), the parent folder and a stack preset: Node, Rust, Python, Java, Go or Other. A preset SHALL set the gates of the project file and the ignore rules of the stack.
- REQ-003: The brief step SHALL show the vision, the users and the scope as editable text, pre-filled from the name and the stack in the docs language. The creator SHALL write them to `docs/brief.md` with headings in the docs language.
- REQ-004: The brief step SHALL take the docs language and the pull request language. Both SHALL default to the interface language. The project file SHALL keep them under `languages` (`docs`, `pulls`).
- REQ-005: Each agent brief of a Factory run SHALL say the docs language for specs, diagrams and documents, and the pull request language for pull request text and review comments. It SHALL say that code, identifiers, code comments and commit messages stay in English. A project with no `languages` SHALL get no language text.
- REQ-006: The pull request that a run opens SHALL use the pull request language for its opening line and its headings, in English or French. Another language SHALL keep the English headings.
- REQ-007: The team step SHALL list the person, from `git config user.name`, with a role, and SHALL add and remove members with a name and a role from the roles of `team-rights` REQ-005. The creator SHALL write the members to `.shipyard/team.yaml`.
- REQ-008: The remote step SHALL offer three choices: local only (the default), an existing remote address, or a new private repository on a code host connection (GitHub, GitLab). It SHALL take an issue tracker connection and its scope, and SHALL keep the connection ids in the project file.
- REQ-009: The start step SHALL show each file that the creator writes, with its text. Nothing SHALL be written before Create.
- REQ-010: Create SHALL refuse a folder that is not empty. It SHALL make the repository, write the files, make the first commit, then make the new repository, set `origin` and push when the remote step asks for it, and open the project. A failure of the remote SHALL leave the local project open and SHALL show the error.
- REQ-011: The start step SHALL offer three starts: a Factory run of the bundled workflow `bootstrap`, starter issues on the issue tracker, or later. The run SHALL need a code host connection, and the issues SHALL need an issue tracker connection. The default SHALL be the run when it is possible, else the issues, else later.
- REQ-012: The starter issues SHALL come from the lines of the scope, one issue for each line. The person SHALL see, edit and remove each issue before the creation. Only the click on Create issues SHALL create them, and each issue SHALL carry its ref as a label, so a second click creates no copy.
- REQ-013: Shipyard SHALL bundle the workflow `bootstrap`: a plan step behind a human gate, a build step, a review step and a pull request. Its ticket SHALL point at `docs/brief.md` and `AGENTS.md`.
- REQ-014: Settings / Project SHALL edit the docs language and the pull request language. A change SHALL apply to the next agent brief and pull request only.

### Non-Goals

- A translation of existing docs after a change of the language.
- A public repository, or a repository on Azure DevOps, from the creator.
- A code language: code and comments stay in English.
- A template repository or a scaffold of code by Shipyard itself: the bootstrap run writes the code.

### Acceptance Criteria

- [ ] A local project made from the Rust preset has `cargo test` and `cargo clippy` in its gates, a first commit, `docs/brief.md`, `AGENTS.md` and `README.md`.
- [ ] A project made with the docs in French holds `languages: {docs: fr, pulls: en}`, and the brief of each agent step says French for the docs and English for the code.
- [ ] A new repository on a code host connection gets `origin` and the first commit.
- [ ] A failed push leaves the project open and shows the error.
- [ ] The start step offers the run only with a code host and the issues only with an issue tracker.
- [ ] Five scope lines give five issues in the preview, and a second click creates none.

## ADDED Requirements

### Requirement: REQ-001 Entry and steps

Home / Projects and the first run SHALL open the creator. The creator SHALL have five steps: project, brief, team, remote, start. Each step SHALL have defaults, so that Create is on from the first step when the name and the folder are set.

Screen: SCR-021

#### Scenario: Open from Home / Projects
- GIVEN Home / Projects
- WHEN the person clicks New project
- THEN the creator opens on the step project

#### Scenario: Create from the first step
- GIVEN the creator with the name `Demo` and a parent folder
- WHEN the person goes to the start step with no other change
- THEN Create is on

### Requirement: REQ-002 Project and stack

The project step SHALL take the name, the key (from the name, editable), the parent folder and a stack preset: Node, Rust, Python, Java, Go or Other. A preset SHALL set the gates of the project file and the ignore rules of the stack.

Screen: SCR-021

#### Scenario: Rust preset
- GIVEN the name `Demo` and the preset Rust
- WHEN the person opens the start step
- THEN `.shipyard/project.yaml` in the preview holds the gates `cargo test` and `cargo clippy`
- AND `.gitignore` holds `target/`

### Requirement: REQ-003 Brief

The brief step SHALL show the vision, the users and the scope as editable text, pre-filled from the name and the stack in the docs language. The creator SHALL write them to `docs/brief.md` with headings in the docs language.

Screen: SCR-021

#### Scenario: French brief
- GIVEN the docs language French
- WHEN the brief step opens
- THEN the scope is pre-filled in French
- AND `docs/brief.md` in the preview has the heading `## Périmètre`

### Requirement: REQ-004 Languages

The brief step SHALL take the docs language and the pull request language. Both SHALL default to the interface language. The project file SHALL keep them under `languages` (`docs`, `pulls`).

Screen: SCR-021

#### Scenario: Two languages
- GIVEN the interface in French
- WHEN the person sets the pull request language to English
- THEN the project file holds `docs: fr` and `pulls: en` under `languages`

### Requirement: REQ-005 Language in each agent brief

Each agent brief of a Factory run SHALL say the docs language for specs, diagrams and documents, and the pull request language for pull request text and review comments. It SHALL say that code, identifiers, code comments and commit messages stay in English. A project with no `languages` SHALL get no language text.

#### Scenario: Docs in French
- GIVEN a project with `languages: {docs: fr, pulls: en}`
- WHEN a run starts the step `build`
- THEN the brief says French for the specs and the docs, English for the pull request
- AND it says that the code and the comments stay in English

#### Scenario: No languages
- GIVEN a project file with no `languages`
- WHEN a run starts a step
- THEN the brief has no language text

### Requirement: REQ-006 Pull request language

The pull request that a run opens SHALL use the pull request language for its opening line and its headings, in English or French. Another language SHALL keep the English headings.

#### Scenario: French pull request
- GIVEN a project with `pulls: fr`
- WHEN a run opens its pull request
- THEN the body starts with `Livre` and has the heading `## Vérifications`

### Requirement: REQ-007 Team

The team step SHALL list the person, from `git config user.name`, with a role, and SHALL add and remove members with a name and a role from the roles of `team-rights` REQ-005. The creator SHALL write the members to `.shipyard/team.yaml`.

Screen: SCR-021

#### Scenario: Two members
- GIVEN the person `Ada` as `architect`
- WHEN the person adds `Bo` as `developer` and creates the project
- THEN `.shipyard/team.yaml` lists `Ada` and `Bo` with their roles

### Requirement: REQ-008 Remote and issue tracker

The remote step SHALL offer three choices: local only (the default), an existing remote address, or a new private repository on a code host connection (GitHub, GitLab). It SHALL take an issue tracker connection and its scope, and SHALL keep the connection ids in the project file.

Screen: SCR-021

#### Scenario: No connection
- GIVEN a machine with no code host connection
- WHEN the remote step opens
- THEN local only is on, the choices are local only and existing remote
- AND Add a code host opens Settings / Connections

#### Scenario: Connection ids
- GIVEN the code host connection `gh` and the issue tracker connection `jira`
- WHEN the person creates the project
- THEN the project file holds `forge: gh` and `tracker: jira` under `connections`

### Requirement: REQ-009 Preview

The start step SHALL show each file that the creator writes, with its text. Nothing SHALL be written before Create.

Screen: SCR-021

#### Scenario: Preview
- GIVEN the creator on the start step
- WHEN the person opens `AGENTS.md` in the list
- THEN its text shows
- AND the parent folder has no new folder

### Requirement: REQ-010 Create

Create SHALL refuse a folder that is not empty. It SHALL make the repository, write the files, make the first commit, then make the new repository, set `origin` and push when the remote step asks for it, and open the project. A failure of the remote SHALL leave the local project open and SHALL show the error.

#### Scenario: Folder not empty
- GIVEN a folder `demo` that holds a file
- WHEN the person creates the project `Demo` in its parent
- THEN Shipyard refuses and names the folder

#### Scenario: Push fails
- GIVEN a new repository that the code host refuses
- WHEN the person creates the project
- THEN the project opens with its first commit
- AND the error of the code host shows

### Requirement: REQ-011 Starts

The start step SHALL offer three starts: a Factory run of the bundled workflow `bootstrap`, starter issues on the issue tracker, or later. The run SHALL need a code host connection, and the issues SHALL need an issue tracker connection. The default SHALL be the run when it is possible, else the issues, else later.

Screen: SCR-021

#### Scenario: Local only
- GIVEN a local project with no issue tracker
- WHEN the start step opens
- THEN later is on, and the run and the issues are off with their reason

### Requirement: REQ-012 Starter issues

The starter issues SHALL come from the lines of the scope, one issue for each line. The person SHALL see, edit and remove each issue before the creation. Only the click on Create issues SHALL create them, and each issue SHALL carry its ref as a label, so a second click creates no copy.

Screen: SCR-021

#### Scenario: Five lines
- GIVEN a scope of five lines and an issue tracker
- WHEN the person removes one issue and clicks Create issues
- THEN four issues exist on the issue tracker
- AND a second click creates none

### Requirement: REQ-013 Bootstrap workflow

Shipyard SHALL bundle the workflow `bootstrap`: a plan step behind a human gate, a build step, a review step and a pull request. Its ticket SHALL point at `docs/brief.md` and `AGENTS.md`.

#### Scenario: Bootstrap run
- GIVEN a new project with a code host connection
- WHEN the person starts the bootstrap run
- THEN Factory / Runs shows a run of `wf:bootstrap` that waits at the plan gate

### Requirement: REQ-014 Languages in Settings / Project

Settings / Project SHALL edit the docs language and the pull request language. A change SHALL apply to the next agent brief and pull request only.

Screen: SCR-018

#### Scenario: Change the docs language
- GIVEN a project with the docs in English
- WHEN the person sets French in Settings / Project and saves
- THEN the project file holds `docs: fr`
- AND the existing docs stay as they are

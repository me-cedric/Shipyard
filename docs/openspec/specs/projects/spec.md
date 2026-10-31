# Spec: projects

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `docs/openspec/changes/archive/2026-10-31-add-projects/`

### Goal

A person opens, clones, creates and switches projects from one place. One health view lists what is wrong in the active project and offers one fix for each finding. A team with an existing project imports its data.

### Why

A team works on several repositories. The earlier tool keeps a project registry, but setup, health (Doctor) and preferences sit on separate pages. Shipyard needs one way to start and switch, one health view, and one import path.

### Users And Scenarios

- PM: switches between the projects of a client and sees which working copy needs attention.
- Architect: sets the paths of the diagrams and ADRs in Settings / Project.
- Developer: clones a repository on first run and starts work in minutes.
- QA: opens Settings / Health to check that the tools run.
- BA: sets the default workflow of the project once, for the team.
- Functional lead: imports the RAID and specs of an existing project.
- Junior: follows the first run and finds the project ready, with no manual setup.

### Requirement list

- REQ-001: The system SHALL offer the role choice and three starts on first run: open a local folder, clone a remote repository, create a new project. Open a local folder is the one primary action.
- REQ-002: The system SHALL open a local folder as a project and prepare `.shipyard/project.yaml` when it is absent.
- REQ-003: The system SHALL clone a remote repository with the credentials of a connection. No default. The person picks a folder each time.
- REQ-004: The system SHALL create a new project as a new repository with a project file.
- REQ-005: The system SHALL add OS ignore rules only to a repository that Shipyard creates.
- REQ-006: The system SHALL show a project switcher in the shell with the state of each working copy.
- REQ-007: The system SHALL keep the name, the key, the artifact paths, the default workflow, the gate commands, the ids of the tracker and forge connections and the tracker scope in `.shipyard/project.yaml`. The key in `.shipyard/project.yaml`. The key is short and stable.
- REQ-008: The system SHALL keep a project registry in the app data folder, and MUST keep machine values out of the repository. The registry holds the project overrides of a personal preference. The registry in the app data folder. The repository stays free of personal values.
- REQ-009: The system SHALL show Settings / Project with the paths, the default workflow and the overrides.
- REQ-010: A project override SHALL take the place of the same preference of a person. The registry SHALL hold it. The view SHALL show which settings the project overrides.
- REQ-011: The system SHALL show Settings / Health with compliance checks, tool checks, broken refs and stale generated files.
- REQ-012: The system SHALL offer one fix action for each finding in Settings / Health.
- REQ-013: The system SHALL show a health dot in the status bar that reflects the worst finding.
- REQ-014: The system SHALL import project config, team, costing sheets, tickets config, RAID, ADRs and specs. Project config, team, costing sheets, tickets config, RAID, ADRs, specs.
- REQ-015: The project import SHALL show a report and MUST NOT overwrite an existing file without a person's confirmation.
- REQ-016: Each projects view SHALL follow the interface rules of the constitution.
- REQ-017: The system SHALL expose each project as a `project:` entity and the active project to every other capability.
- REQ-018: Settings / Health SHALL run the compass Node helpers on the working copy and SHALL show each result as a finding in the tool checks group.
- REQ-019: A project SHALL be able to override the accent colour in the registry. The design system SHALL apply it while that project is active.

### Non-Goals

- Hosting projects or repositories. Projects stay local.
- Changing a repository that exists, except the project file and the files a fix action writes.
- Storing secrets. The `connections` capability owns them.
- Child projects and plugins. The `extensions` capability owns them.
- Importing run history or time entries.
- Running `git init` on a folder that holds no repository (Dossier local git init). Opening never changes a folder outside the project file. Creation (REQ-004) is the only way to start a repository.
- Bootstrap (the `bootstrap.mjs --schema` form, `BOOTSTRAP_PROMPT.md` and `specs/000-project`). A new project starts from REQ-004 and the `add-specs` flow, so a second start path adds nothing.
- Stack detection that marks skills as suited. The `extensions` capability owns the skill lists.
- A default provisioning template for the next projects. REQ-004 writes the project file only. A template waits for a real need.
- A team editor. Work / Team (`add-work`) is the one team editor. Settings / Team does not exist: the path `/settings/team` redirects to Work / Team.

### Acceptance Criteria

- [ ] A new install shows the role choice and the three starts, with one primary action and no other action.
- [ ] A local folder opens as a project and appears in the switcher.
- [ ] A clone shows progress and ends with an active project.
- [ ] A created repository holds the OS ignore rules. An opened repository keeps its ignore file unchanged.
- [ ] The switcher shows the state of each working copy.
- [ ] `.shipyard/project.yaml` holds no machine path and no secret.
- [ ] Settings / Project saves paths and default workflow to the project file, and overrides to the registry.
- [ ] A setting that the project overrides is marked in Settings / Project and in Settings / Me.
- [ ] `.shipyard/project.yaml` holds no override of a personal preference.
- [ ] Settings / Health lists the result of each compass Node helper in the tool checks group.
- [ ] A project accent override in the registry changes the accent while that project is active.
- [ ] Each finding in Settings / Health has one fix action, and the fix clears the finding.
- [ ] The status bar dot changes colour and shape with the worst finding.
- [ ] The project import lists what it copied, what it skipped and why.
- [ ] Every view works with the keyboard only, in French and in English.

### Links

- Consumes: `add-connections` (remote credentials for a clone), `add-refs` (broken-ref report), `add-extensions` (compass check for health).
- Produces: `project:` entities and the active project for every capability; Settings / Project and Settings / Health for `add-shell`; the project key for `add-sync` and `add-work`; the import of project data for `add-specs`, `add-design` and `add-work` entities.

### Feature list

| Feature | Shipyard view | REQ ids |
|---|---|---|
| Welcome | First run | REQ-001, REQ-002, REQ-003, REQ-004 |
| Home (project list) | Project switcher | REQ-006 |
| Project registry | Registry in the app data folder | REQ-008, REQ-017 |
| Doctor (compliance, tooling) | Settings / Health, status bar dot | REQ-005, REQ-011, REQ-012, REQ-013 |
| Dossier local git init | Not kept: see Non-Goals. REQ-004 creates a repository | REQ-002, REQ-004 |
| Doctor (Outillage: compass Node helpers) | Settings / Health, tool checks | REQ-018 |
| Per-project accent colour | Settings / Project overrides | REQ-019 |
| Settings | Settings / Project | REQ-007, REQ-009 |
| Per-project overrides of Préférences | Settings / Project overrides | REQ-010 |
| Data of an existing project | Project import | REQ-014, REQ-015 |

### Existing References

- Existing code/docs/specs: `docs/plan/MASTER-PLAN.md` sections 3, 4 and 7; ADR 0001; Q-003.
- Supersedes or extends: N/A

### Clarifications

- Q-015 Which folder does a clone use by default?: No default. The person picks a folder each time.
- Q-014 Which value gives the id of a project ref?: The key in `.shipyard/project.yaml`. The key is short and stable.
- Q-016 Where do the project overrides of a personal preference live?: The registry in the app data folder. The repository stays free of personal values.
- Q-003 Which data of an existing project does the import cover in W9?: Project config, team, costing sheets, tickets config, RAID, ADRs, specs.

## Requirements

### Requirement: REQ-001 First run

The system SHALL offer the role choice and three starts on first run: open a local folder, clone a remote repository, create a new project. The view MUST show one primary action, Open a local folder. Clone and create SHALL be secondary actions. The view MUST show no other action and no other text. The `shell` capability defers to this requirement for the first run.

#### Scenario: Empty install
- GIVEN no project in the registry
- WHEN a person starts Shipyard
- THEN the first run shows the role choice and the three starts with icon and noun labels
- AND only Open a local folder is a primary action

#### Scenario: Return start
- GIVEN at least one project in the registry
- WHEN a person starts Shipyard
- THEN the last active project opens

### Requirement: REQ-002 Open a local folder

The system SHALL open a local folder that holds a Git repository as a project. When the folder has no `.shipyard/project.yaml`, the system SHALL prepare one after a person confirms.

#### Scenario: Repository with a project file
- GIVEN a folder with a repository and a project file
- WHEN a person opens it
- THEN it becomes the active project

#### Scenario: Repository without a project file
- GIVEN a folder with a repository and no project file
- WHEN a person opens it and confirms
- THEN the system writes a project file and opens the project

#### Scenario: Not a repository
- GIVEN a folder with no Git repository
- WHEN a person opens it
- THEN the system shows an error that names the missing repository and opens nothing
- AND the system does not run `git init`

### Requirement: REQ-003 Clone a remote repository

The system SHALL clone a remote repository into a new folder inside a folder that the person picks. The new folder takes the name of the repository. It SHALL use the credentials of a connection. No default. The person picks a folder each time. The working assumption is that no default exists.

#### Scenario: Clone with a connection
- GIVEN a forge connection with access to the repository
- WHEN a person gives the address and a folder
- THEN the system clones the repository and opens the project

#### Scenario: No access
- GIVEN a connection without access to the repository
- WHEN a person starts the clone
- THEN the system shows the error and removes the partial folder

### Requirement: REQ-004 Create a project

The system SHALL create a new project as a new Git repository with a project file. The person gives a name and a key.

#### Scenario: New project
- GIVEN an empty target folder
- WHEN a person gives a name and a key
- THEN the system creates the repository, writes the project file and opens the project

#### Scenario: Folder not empty
- GIVEN a target folder that holds files
- WHEN a person starts the creation
- THEN the system refuses and names the folder

### Requirement: REQ-005 OS ignore rules

The system SHALL add the OS ignore rules to a repository that Shipyard creates. The system MUST NOT change the ignore rules of a repository that exists, unless a person runs a fix action on that finding.

#### Scenario: Created repository
- GIVEN a project created by Shipyard
- WHEN creation ends
- THEN the repository ignores the OS files

#### Scenario: Existing repository
- GIVEN an opened repository with its own ignore file
- WHEN a person opens it
- THEN the ignore file stays unchanged

### Requirement: REQ-006 Project switcher

The system SHALL show a switcher in the shell that lists the projects of the registry. Each entry SHALL show the state of its working copy: clean, changed, behind, ahead, missing.

#### Scenario: Switch
- GIVEN two projects in the registry
- WHEN a person picks the other project
- THEN every view shows the data of that project

#### Scenario: Missing folder
- GIVEN a project whose folder no longer exists
- WHEN a person opens the switcher
- THEN the entry shows the state "missing" with its status shape

#### Scenario: Keyboard
- GIVEN focus on the switcher
- WHEN a person uses the arrow keys and Enter
- THEN the project changes

### Requirement: REQ-007 Project file

The system SHALL keep the name, the key, the artifact paths of each kind, the default workflow, the gate commands, the connection ids (`q:Q-018`) and the tracker scope in `.shipyard/project.yaml`. The gate commands are the checks that a run must pass before a pull request (`q:Q-030`). The key in `.shipyard/project.yaml`. The key is short and stable. The working assumption is that the key gives the id. The file MUST NOT hold an override of a personal preference.

#### Scenario: Read
- GIVEN a valid project file
- WHEN the project opens
- THEN the name, the key, the paths and the gate commands load

#### Scenario: Invalid file
- GIVEN a project file with a bad value
- WHEN the project opens
- THEN Settings / Health shows a finding with the line and the value

#### Scenario: Connection ids
- GIVEN a person picks a tracker connection and a forge connection in Settings / Project
- WHEN the person saves
- THEN `.shipyard/project.yaml` holds the two ids under `connections`
- AND it holds no address and no secret

### Requirement: REQ-008 Project registry

The system SHALL keep a registry of projects in the app data folder. The registry SHALL hold the local path of each working copy and the project overrides of a personal preference. The repository files MUST NOT hold a machine path or an override. The registry in the app data folder. The repository stays free of personal values. The working assumption is the registry.

#### Scenario: Register
- GIVEN a project that a person opens
- WHEN the open ends
- THEN the registry holds its path and its last use

#### Scenario: Clean repository
- GIVEN a registered project
- WHEN a person reads `.shipyard/project.yaml`
- THEN it holds no machine path

### Requirement: REQ-009 Settings / Project

The system SHALL show Settings / Project with the paths of each artifact kind, the default workflow and the overrides. Settings / Project SHALL write paths, the default workflow and the connection ids to `.shipyard/project.yaml`, and overrides to the registry.

#### Scenario: Change a path
- GIVEN Settings / Project
- WHEN a person changes the ADR path and saves
- THEN the project file holds the new path

#### Scenario: One primary action
- GIVEN Settings / Project with a change
- WHEN a person views the page
- THEN one primary action, Save, shows

### Requirement: REQ-010 Overrides

A project override SHALL take the place of the same preference of a person. The registry SHALL hold each override. Settings / Project SHALL mark each overridden setting. Settings / Me SHALL show the same mark. The override MUST NOT reach the repository.

#### Scenario: Override
- GIVEN a person who prefers one value and a project override of another value in the registry
- WHEN the project is active
- THEN the project value applies and the mark shows in Settings / Me
- AND `.shipyard/project.yaml` holds no override

### Requirement: REQ-011 Settings / Health

The system SHALL show Settings / Health with four groups: compliance checks, tool checks, broken refs and stale generated files. Each group heading SHALL show a count. The broken refs come from `refs`. The compliance check comes from `extensions`.

#### Scenario: Findings by group
- GIVEN two missing tools and one broken ref
- WHEN a person opens Settings / Health
- THEN the groups show counts 2 and 1 and list each finding

#### Scenario: Healthy project
- GIVEN a project with no finding
- WHEN a person opens Settings / Health
- THEN the view shows ghost rows and the status shape for "ok"

### Requirement: REQ-012 Fix actions

The system SHALL offer one fix action for each finding. A fix that writes a file SHALL show the change first and wait for one click. A fix MUST NOT run without that click.

#### Scenario: Fix a finding
- GIVEN a stale generated file
- WHEN a person clicks its fix action
- THEN the system shows the new content and waits for one confirm click
- AND after the confirm click the system regenerates the file and the finding clears

#### Scenario: Fix with a preview
- GIVEN a missing compliance file
- WHEN a person clicks its fix action
- THEN the system shows the new file and writes it after one confirm click

### Requirement: REQ-013 Health dot

The system SHALL show a health dot in the status bar. The dot SHALL reflect the worst finding with a shape and a colour. A click SHALL open Settings / Health.

#### Scenario: Worst finding
- GIVEN one warning and one error
- WHEN the status bar renders
- THEN the dot shows the error shape and colour

#### Scenario: Assistive label
- GIVEN a screen reader
- WHEN focus lands on the dot
- THEN it announces the worst state and the finding count

### Requirement: REQ-014 Project import

The system SHALL import the project config, team, costing sheets, tickets config, RAID, ADRs and specs into a Shipyard project. Project config, team, costing sheets, tickets config, RAID, ADRs, specs. The working assumption is Q-003 option 1, the full list.

#### Scenario: Import a repository
- GIVEN a repository with project files
- WHEN a person runs the import
- THEN the system writes the matching Shipyard files and shows a report

#### Scenario: Nothing to import
- GIVEN a repository with no project file
- WHEN a person opens the import
- THEN the view shows ghost rows and one primary action, Choose a folder

### Requirement: REQ-015 Import report and safety

The project import SHALL list each item as copied, skipped or conflicting. It MUST NOT overwrite an existing file without a person's confirmation. It MUST NOT change the source files.

#### Scenario: Conflict
- GIVEN a target file that exists
- WHEN the import reaches it
- THEN the report lists a conflict and the file stays unchanged until a person confirms

#### Scenario: Source intact
- GIVEN a finished import
- WHEN a person compares the source files
- THEN they have no change

### Requirement: REQ-016 Interface rules

Each projects view SHALL have no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path, a focus ring, assistive labels, enough contrast and no motion under reduced motion. Its text SHALL exist in French and English.

#### Scenario: Keyboard only
- GIVEN the first run view
- WHEN a person uses Tab and Enter
- THEN the person can finish each of the three starts

#### Scenario: Language
- GIVEN the language is French
- WHEN a person opens Settings / Health
- THEN every label is in French

### Requirement: REQ-017 Project entity

The system SHALL expose each registered project as a `project:<id>` entity. The system SHALL give the active project to every other capability.

#### Scenario: Resolve
- GIVEN a registered project
- WHEN the ref `project:<id>` resolves
- THEN it returns the name and the working copy state

#### Scenario: Active project
- GIVEN a switch to another project
- WHEN any capability asks for the active project
- THEN it gets the new project

### Requirement: REQ-018 Compass helpers check

Settings / Health SHALL run the compass Node helpers on the working copy. It SHALL show each result as a finding in the tool checks group.

#### Scenario: Helper fails
- GIVEN a working copy and a compass helper that reports a problem
- WHEN a person opens Settings / Health
- THEN the tool checks group lists that problem as a finding

#### Scenario: No Node
- GIVEN a machine with no Node tool
- WHEN a person opens Settings / Health
- THEN the tool checks group names the missing tool and runs no helper

### Requirement: REQ-019 Accent override

A project SHALL be able to override the accent colour. The registry SHALL hold the value. The design system SHALL apply it while that project is active (`add-design-system` REQ-001). The value MUST NOT reach the repository.

#### Scenario: Project accent
- GIVEN a project with an accent override in the registry
- WHEN that project is active
- THEN the interface shows the accent of the project
- AND `.shipyard/project.yaml` holds no accent

# Spec: extensions

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-extensions`

### Goal

One place manages the agent rules and the add-ons of a project. It also pushes them to child repositories. Settings / Agents and rules holds compass. Settings / Extensions holds the catalog, plugins and child projects.

### Why

Agents follow the compass rules, and teams reuse accelerators across repositories. Legacy spreads these on four pages. Shipyard needs one place to apply the rules, deploy add-ons safely, and keep child repositories in line.

### Users And Scenarios

- PM: sees the sync state and chooses which children get a deploy.
- Architect: pins the rules and the roles, and reviews a plugin before it applies.
- Developer: applies skills and packs and edits the roles that the factory loads.
- QA: applies the test components and checks the compass findings.
- BA: deploys the OpenSpec guidance to a child repository.
- Functional lead: reads which rules the agents follow.
- Junior: browses skills and guides to learn how agents work.

### Requirements

- REQ-001: The system SHALL show Settings / Agents and rules with four lists: skills, packs, guides and the contract.
- REQ-002: The skill list SHALL show the risk level and the write capability of each skill.
- REQ-003: The system SHALL apply a chosen skill, pack, guide or the contract to the project through `ac sync`.
- REQ-004: The view SHALL show the pinned compass version and the sync state of each entry: absent, stale or current.
- REQ-005: The system SHALL NOT change the pinned compass version without a person's action.
- REQ-006: One action SHALL bring every actionable entry up to date.
- REQ-007: The system SHALL give the compass check to Settings / Health.
- REQ-008: The system SHALL list the roles and the skills that the factory and the assistant load, and who loads each.
- REQ-009: The system SHALL show Settings / Extensions with a catalog.
- REQ-010: The person SHALL see the files of a component before deploy.
- REQ-011: The person SHALL import a plugin from a `.zip`.
- REQ-012: Before a plugin applies, the system SHALL list each file and each setting that it writes.
- REQ-013: A plugin MAY name an MCP server.
- REQ-014: The system SHALL show what changes when a person imports a newer version of an applied plugin.
- REQ-015: Settings / Extensions SHALL list the child projects of the active project.
- REQ-016: The person SHALL deploy catalog components and compass entries to one or more child projects.
- REQ-017: The person SHALL deploy the OpenSpec guidance to a child project.
- REQ-018: A person SHALL be able to run a Health fix on each child project with the same finding.
- REQ-019: Settings / Agents and rules and Settings / Extensions SHALL follow the interface rules of the constitution.

### Non-Goals

- Detecting runners and providers, and storing MCP servers and secrets. The `connections` capability owns them.
- The health view and its checks. The `projects` capability owns them. This change gives the compass check.
- Running plugin code, install hooks and a plugin sandbox.
- Editing the compass files in the submodule. They are read only.
- Creating child repositories and opening pull requests in a forge.

### Acceptance Criteria

- [ ] Settings / Agents and rules shows four lists with counts. A skill shows its risk and write capability.
- [ ] An apply writes through `ac sync` and keeps each existing file.
- [ ] The view shows the pinned version and the sync state, and the state is the same after a clone.
- [ ] The pinned version does not change without a person's action.
- [ ] One Upgrade action updates every actionable entry, or a selection.
- [ ] A stale compass entry is a Health finding with one fix.
- [ ] The roles and skills list shows who loads each, and an edit applies to the next run or turn.
- [ ] Settings / Extensions shows the three catalog groups, and a deploy shows its files first.
- [ ] A plugin `.zip` imports as data, a bad archive is refused, and nothing is written before the review.
- [ ] The review lists each file and setting, and only accepted items are written.
- [ ] A plugin MCP server goes to connections, and a local command is refused.
- [ ] Child projects show n of m and propose only current parent entries.
- [ ] A deploy to a child makes a branch and a commit in a local clone.
- [ ] The OpenSpec guidance deploys to a child and keeps the child's own instructions.
- [ ] A Health fix runs on the children that the person selects.
- [ ] Both views work by keyboard, show a focus ring and assistive labels, and show French and English.

### Links

- Consumes: `add-projects` REQ-006, REQ-008, REQ-011 and REQ-012 (active project, children, Health, fix actions), `add-connections` REQ-006 and REQ-011 (MCP servers, secrets), ADR 0010 (pinned compass).
- Produces: compass rules, roles and skills for `add-factory` (REQ-014) and `add-assistant` (REQ-013), the compass check for `add-projects` Health, catalog components and OpenSpec guidance for child projects.

### Legacy parity

| Legacy feature | Shipyard view | REQ ids |
|---|---|---|
| Compass (skills, packs, guides, contract) | Settings / Agents and rules | REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006 |
| Compass patterns and roles loaded by agents | Settings / Agents and rules | REQ-008 |
| Catalog | Settings / Extensions | REQ-009, REQ-010 |
| Plugins | Settings / Extensions | REQ-011, REQ-012, REQ-013, REQ-014 |
| Child projects | Settings / Extensions | REQ-015, REQ-016 |
| OpenSpec guidance for child repos | Settings / Extensions | REQ-017 |
| Doctor propagation to linked projects | Settings / Health and Settings / Extensions | REQ-007, REQ-018 |

### Existing References

- `docs/plan/MASTER-PLAN.md` sections 4, 6 and 9; ADR 0010; `docs/openspec/constitution.md` section 4.
- Legacy `docs/features.md`, sections Agent Compass, Catalog, Doctor; Legacy `docs/plugins.md`.
- `add-specs` Legacy parity row for OpenSpec guidance (REQ-017 here owns it).

## ADDED Requirements

### Requirement: REQ-001 Agents and rules view

The system SHALL show Settings / Agents and rules with four lists: skills, packs, guides and the contract. Each list SHALL show a count. The lists SHALL read the compass files that the project pins.

#### Scenario: Open the view
- GIVEN a project with compass pinned
- WHEN the person opens Settings / Agents and rules
- THEN four lists show with a count each

#### Scenario: No compass pinned
- GIVEN a project with no compass pinned
- WHEN the person opens Settings / Agents and rules
- THEN the view shows one Add compass action

### Requirement: REQ-002 Skill list

The skill list SHALL show the risk level and the write capability of each skill. The person SHALL be able to search the list and to preview the text of a skill before applying it.

#### Scenario: Search
- GIVEN the skill list
- WHEN the person types `review`
- THEN only skills that match show

#### Scenario: Preview
- GIVEN a skill in the list
- WHEN the person selects it
- THEN its text shows and no file changes

### Requirement: REQ-003 Apply compass entries

The system SHALL apply a chosen skill, pack, guide or the contract to the project through `ac sync`. The system MUST NOT overwrite a file that already exists. It SHALL report each file that it kept.

#### Scenario: Apply a pack
- GIVEN a pack that is absent
- WHEN the person applies it
- THEN the new files appear and `ac sync` ran

#### Scenario: Kept file
- GIVEN a project with its own `AGENTS.md`
- WHEN the person applies the contract
- THEN the file stays as it is and the report names it

### Requirement: REQ-004 Pinned version and sync state

The view SHALL show the pinned compass version and the sync state of each entry: absent, stale or current. The state SHALL come from the compass lock and SHALL show the same to the whole team after a clone.

#### Scenario: Drift
- GIVEN an entry that changed upstream
- WHEN the person opens the view
- THEN the entry shows as stale with the pinned and the expected version

#### Scenario: After a clone
- GIVEN a fresh clone of the repository
- WHEN the person opens the view
- THEN the states match those of the first machine

### Requirement: REQ-005 Change the pinned version

The system SHALL NOT change the pinned compass version without a person's action. [NEEDS CLARIFICATION: Q-050 May Settings / Agents and rules change the pinned compass version?]

#### Scenario: No silent change
- GIVEN a newer compass version upstream
- WHEN the app starts
- THEN the pinned version does not change

### Requirement: REQ-006 Upgrade

One action SHALL bring every actionable entry up to date. The person SHALL be able to restrict the action to a selection. The action SHALL follow the no-overwrite rule of REQ-003.

#### Scenario: Upgrade all
- GIVEN three stale entries
- WHEN the person chooses Upgrade
- THEN the three entries become current

#### Scenario: Upgrade a selection
- GIVEN three stale entries and a selection of one
- WHEN the person chooses Upgrade
- THEN only the selected entry changes

### Requirement: REQ-007 Compass check for Health

The system SHALL give the compass check to Settings / Health. A stale or absent entry SHALL be a finding. The fix action of that finding SHALL apply the entry as REQ-003 says.

#### Scenario: Stale finding
- GIVEN a stale skill
- WHEN the person opens Settings / Health
- THEN a finding names the skill and offers one fix

#### Scenario: Fix
- GIVEN a stale finding
- WHEN the person runs the fix
- THEN the entry becomes current and the finding goes

### Requirement: REQ-008 Roles and skills for factory and assistant

The system SHALL list the roles and the skills that the factory and the assistant load, and who loads each. A change to a role file or a skill SHALL apply to the next run or turn. A run in progress SHALL keep the version it started with.

#### Scenario: Role used
- GIVEN the role `reviewer` and a workflow that uses it
- WHEN the person opens the list
- THEN the list shows `reviewer` and the workflow

#### Scenario: Run in progress
- GIVEN a run that started before a role edit
- WHEN the person edits the role
- THEN the run keeps the old role and the next run uses the new one

### Requirement: REQ-009 Catalog

The system SHALL show Settings / Extensions with a catalog. The catalog SHALL have three groups: devcontainers, agents, and DevOps and security components. Each component SHALL show its name, its group and its state in the project.

#### Scenario: Catalog groups
- GIVEN the catalog
- WHEN the person opens Settings / Extensions
- THEN the three groups list their components with a state each

### Requirement: REQ-010 Deploy a component

The person SHALL see the files of a component before deploy. A deploy SHALL write only those files. It MUST NOT overwrite a file that exists. It SHALL record the component and its version in the project.

#### Scenario: Preview and deploy
- GIVEN a devcontainer component
- WHEN the person previews and confirms
- THEN only the listed files are written and the state becomes deployed

#### Scenario: Existing file
- GIVEN a target file that exists
- WHEN the person deploys
- THEN the file is kept and the report names it

### Requirement: REQ-011 Plugin import

The person SHALL import a plugin from a `.zip`. The system SHALL read the plugin as data and MUST NOT run any code from it. It SHALL refuse an archive that has no manifest, no payload file, or a path outside the project.

#### Scenario: Valid archive
- GIVEN a `.zip` with a manifest and files
- WHEN the person imports it
- THEN the plugin shows as a catalog entry and nothing is written

#### Scenario: Bad path
- GIVEN an archive with a file path that leaves the project
- WHEN the person imports it
- THEN the system refuses the archive and names the path

### Requirement: REQ-012 Plugin review before apply

Before a plugin applies, the system SHALL list each file and each setting that it writes. The person SHALL accept or decline each item. The system SHALL write only the accepted items and MUST write nothing before that.

#### Scenario: Decline one
- GIVEN a plugin with three files
- WHEN the person declines one file and applies
- THEN two files are written

#### Scenario: Cancel
- GIVEN a review in progress
- WHEN the person cancels
- THEN no file is written

### Requirement: REQ-013 Plugin MCP servers

A plugin MAY name an MCP server. The system SHALL hand each named server to connections. It SHALL refuse a server that runs a local command. A plugin MUST NOT hold a secret value.

#### Scenario: Remote server
- GIVEN a plugin that names a remote MCP server
- WHEN the person accepts it in the review
- THEN the server appears in Settings / Connections

#### Scenario: Local command
- GIVEN a plugin that names a local command
- WHEN the person imports it
- THEN the system refuses that server

### Requirement: REQ-014 Update an imported plugin

The system SHALL show what changes when a person imports a newer version of an applied plugin. [NEEDS CLARIFICATION: Q-052 How does a person update an imported plugin?]

#### Scenario: Newer version
- GIVEN an applied plugin
- WHEN the person imports a newer archive
- THEN the review shows the changes against the applied version

### Requirement: REQ-015 Child projects

Settings / Extensions SHALL list the child projects of the active project. Each child SHALL show how many entries of the parent it has, as n of m. The view SHALL propose only entries that are current in the parent.

#### Scenario: Progress
- GIVEN a parent with 10 current entries and a child with 4
- WHEN the person opens the list
- THEN the child shows 4 of 10

#### Scenario: Stale parent entry
- GIVEN a parent entry that is stale
- WHEN the person opens the child
- THEN the entry is not proposed

### Requirement: REQ-016 Deploy to child projects

The person SHALL deploy catalog components and compass entries to one or more child projects. The system SHALL write them in a local clone of the child, on a new branch, with a commit. [NEEDS CLARIFICATION: Q-051 How does a deploy reach the remote of a child project?]

#### Scenario: Deploy
- GIVEN a child project and a current component
- WHEN the person deploys
- THEN the clone holds a branch with one commit of the component

#### Scenario: Existing in child
- GIVEN a child that already has the component
- WHEN the person opens the deploy
- THEN the component shows as deployed and is not proposed again

### Requirement: REQ-017 OpenSpec guidance for child repositories

The person SHALL deploy the OpenSpec guidance to a child project. It SHALL hold the spec folder skeleton and the agent instructions that tell agents to read specs first. The same no-overwrite rule SHALL apply.

#### Scenario: Deploy guidance
- GIVEN a child project with no spec folder
- WHEN the person deploys the guidance
- THEN the child gets the skeleton and the agent instructions

#### Scenario: Own instructions
- GIVEN a child with its own agent instructions
- WHEN the person deploys the guidance
- THEN the child keeps its file and the report names it

### Requirement: REQ-018 Propagate health fixes

A person SHALL be able to run a Health fix on each child project with the same finding. The fix covers compass and catalog findings. The person SHALL choose the children. The system SHALL apply the fix as REQ-016 says.

#### Scenario: Fix in two children
- GIVEN a finding that two children share
- WHEN the person selects both and runs the fix
- THEN each child gets a branch with the fix

#### Scenario: Not selected
- GIVEN three children with the finding
- WHEN the person selects one
- THEN the other two stay unchanged

### Requirement: REQ-019 Interface rules

Settings / Agents and rules and Settings / Extensions SHALL follow the interface rules of the constitution. Each SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. Each SHALL have one primary action, a keyboard path, a focus ring, assistive labels, enough contrast and reduced motion. Each SHALL show French and English text.

#### Scenario: Keyboard only
- GIVEN Settings / Extensions is open
- WHEN the person uses only the keyboard
- THEN the person can preview, review, deploy and import

#### Scenario: Language
- GIVEN the language is French
- WHEN the person opens both views
- THEN all labels show in French

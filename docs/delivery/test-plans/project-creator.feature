Feature: project-creator

  @spec:project-creator#REQ-001
  Scenario: Entry and steps: Open from Home / Projects
    Given Home / Projects
    When the person clicks New project
    Then the creator opens on the step project

  @spec:project-creator#REQ-001
  Scenario: Entry and steps: Open from the first run
    Given no project in the registry
    When the person clicks the Create a project tile
    Then the creator opens on the step project

  @spec:project-creator#REQ-001
  Scenario: Entry and steps: Create from the first step
    Given the creator with the name `Demo` and a parent folder
    When the person goes to the start step with no other change
    Then Create is on

  @spec:project-creator#REQ-002
  Scenario: Project and stack: Rust preset
    Given the name `Demo` and the preset Rust
    When the person opens the start step
    Then `.shipyard/project.yaml` in the preview holds the gates `cargo test` and `cargo clippy`
    And `.gitignore` holds `target/`

  @spec:project-creator#REQ-002
  Scenario: Project and stack: Key from the name
    Given the name `Demo App`
    When the person leaves the key as it is
    Then the key comes from the name
    And the person can edit it

  @spec:project-creator#REQ-003
  Scenario: Brief: French brief
    Given the docs language French
    When the brief step opens
    Then the scope is pre-filled in French
    And `docs/brief.md` in the preview has the heading `## Périmètre`

  @spec:project-creator#REQ-004
  Scenario: Languages: Two languages
    Given the interface in French
    When the person sets the pull request language to English
    Then the project file holds `docs: fr` and `pulls: en` under `languages`

  @spec:project-creator#REQ-005
  Scenario: Language in each agent brief: Docs in French
    Given a project with `languages: {docs: fr, pulls: en}`
    When a run starts the step `build`
    Then the brief says French for the specs and the docs, English for the pull request
    And it says that the code and the comments stay in English

  @spec:project-creator#REQ-005
  Scenario: Language in each agent brief: No languages
    Given a project file with no `languages`
    When a run starts a step
    Then the brief has no language text

  @spec:project-creator#REQ-006
  Scenario: Pull request language: French pull request
    Given a project with `pulls: fr`
    When a run opens its pull request
    Then the body starts with `Livre` and has the heading `## Vérifications`

  @spec:project-creator#REQ-006
  Scenario: Pull request language: Other language
    Given a project with `pulls: de`
    When a run opens its pull request
    Then the body keeps the English headings

  @spec:project-creator#REQ-007
  Scenario: Team: Two members
    Given the person `Ada` as `architect`
    When the person adds `Bo` as `developer` and creates the project
    Then `.shipyard/team.yaml` lists `Ada` and `Bo` with their roles

  @spec:project-creator#REQ-008
  Scenario: Remote and issue tracker: No connection
    Given a machine with no code host connection
    When the remote step opens
    Then local only is on, the choices are local only and existing remote
    And Add a code host opens Settings / Connections

  @spec:project-creator#REQ-008
  Scenario: Remote and issue tracker: Connection ids
    Given the code host connection `gh` and the issue tracker connection `jira`
    When the person creates the project
    Then the project file holds `forge: gh` and `tracker: jira` under `connections`

  @spec:project-creator#REQ-009
  Scenario: Preview: Preview
    Given the creator on the start step
    When the person opens `AGENTS.md` in the list
    Then its text shows
    And the parent folder has no new folder

  @spec:project-creator#REQ-010
  Scenario: Create: Folder not empty
    Given a folder `demo` that holds a file
    When the person creates the project `Demo` in its parent
    Then Shipyard refuses and names the folder

  @spec:project-creator#REQ-010
  Scenario: Create: Local project
    Given the Rust preset and local only
    When the person creates the project
    Then the folder holds a first commit, `docs/brief.md`, `AGENTS.md` and `README.md`
    And the project opens

  @spec:project-creator#REQ-010
  Scenario: Create: Push fails
    Given a new repository that the code host refuses
    When the person creates the project
    Then the project opens with its first commit
    And the error of the code host shows

  @spec:project-creator#REQ-011
  Scenario: Starts: Local only
    Given a local project with no issue tracker
    When the start step opens
    Then later is on, and the run and the issues are off with their reason

  @spec:project-creator#REQ-011
  Scenario: Starts: Run by default
    Given a project with a code host connection
    When the start step opens
    Then the run of `bootstrap` is on

  @spec:project-creator#REQ-012
  Scenario: Starter issues: Five lines
    Given a scope of five lines and an issue tracker
    When the person removes one issue and clicks Create issues
    Then four issues exist on the issue tracker
    And a second click creates none

  @spec:project-creator#REQ-013
  Scenario: Bootstrap workflow: Bootstrap run
    Given a new project with a code host connection
    When the person starts the bootstrap run
    Then Factory / Runs shows a run of `wf:bootstrap` that waits at the plan gate

  @spec:project-creator#REQ-014
  Scenario: Languages in Settings / Project: Change the docs language
    Given a project with the docs in English
    When the person sets French in Settings / Project and saves
    Then the project file holds `docs: fr`
    And the existing docs stay as they are

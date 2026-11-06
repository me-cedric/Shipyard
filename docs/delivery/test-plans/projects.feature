Feature: projects

  @spec:projects#REQ-001
  Scenario: First run: Empty install
    Given no project in the registry
    When a person starts Shipyard
    Then the first run shows the role choice and the three starts with icon and noun labels
    And only Open a local folder is a primary action

  @spec:projects#REQ-001
  Scenario: First run: Return start
    Given at least one project in the registry
    When a person starts Shipyard
    Then the last active project opens

  @spec:projects#REQ-002
  Scenario: Open a local folder: Repository with a project file
    Given a folder with a repository and a project file
    When a person opens it
    Then it becomes the active project

  @spec:projects#REQ-002
  Scenario: Open a local folder: Repository without a project file
    Given a folder with a repository and no project file
    When a person opens it and confirms
    Then the system writes a project file and opens the project

  @spec:projects#REQ-002
  Scenario: Open a local folder: Not a repository
    Given a folder with no Git repository
    When a person opens it
    Then the system shows an error that names the missing repository and opens nothing
    And the system does not run `git init`

  @spec:projects#REQ-003
  Scenario: Clone a remote repository: Clone with a connection
    Given a code host connection with access to the repository
    When a person gives the address and a folder
    Then the system clones the repository and opens the project

  @spec:projects#REQ-003
  Scenario: Clone a remote repository: No access
    Given a connection without access to the repository
    When a person starts the clone
    Then the system shows the error and removes the partial folder

  @spec:projects#REQ-004
  Scenario: Create a project: New project
    Given an empty target folder
    When a person gives a name and a key
    Then the system creates the repository, writes the project file and opens the project

  @spec:projects#REQ-004
  Scenario: Create a project: Folder not empty
    Given a target folder that holds files
    When a person starts the creation
    Then the system refuses and names the folder

  @spec:projects#REQ-005
  Scenario: OS ignore rules: Created repository
    Given a project created by Shipyard
    When creation ends
    Then the repository ignores the OS files

  @spec:projects#REQ-005
  Scenario: OS ignore rules: Existing repository
    Given an opened repository with its own ignore file
    When a person opens it
    Then the ignore file stays unchanged

  @spec:projects#REQ-006
  Scenario: Project switcher: Switch
    Given two projects in the registry
    When a person picks the other project
    Then every view shows the data of that project

  @spec:projects#REQ-006
  Scenario: Project switcher: Missing folder
    Given a project whose folder no longer exists
    When a person opens the switcher
    Then the entry shows the state "missing" with its status shape

  @spec:projects#REQ-006
  Scenario: Project switcher: Keyboard
    Given focus on the switcher
    When a person uses the arrow keys and Enter
    Then the project changes

  @spec:projects#REQ-007
  Scenario: Project file: Read
    Given a valid project file
    When the project opens
    Then the name, the key, the paths and the gate commands load

  @spec:projects#REQ-007
  Scenario: Project file: Invalid file
    Given a project file with a bad value
    When the project opens
    Then Settings / Health shows a finding with the line and the value

  @spec:projects#REQ-007
  Scenario: Project file: Connection ids
    Given a person picks an issue tracker connection and a code host connection in Settings / Project
    When the person saves
    Then `.shipyard/project.yaml` holds the two ids under `connections`
    And it holds no address and no secret

  @spec:projects#REQ-008
  Scenario: Project registry: Register
    Given a project that a person opens
    When the open ends
    Then the registry holds its path and its last use

  @spec:projects#REQ-008
  Scenario: Project registry: Clean repository
    Given a registered project
    When a person reads `.shipyard/project.yaml`
    Then it holds no machine path

  @spec:projects#REQ-009
  Scenario: Settings / Project: Change a path
    Given Settings / Project
    When a person changes the ADR path and saves
    Then the project file holds the new path

  @spec:projects#REQ-009
  Scenario: Settings / Project: One primary action
    Given Settings / Project with a change
    When a person views the page
    Then one primary action, Save, shows

  @spec:projects#REQ-009
  Scenario: Settings / Project: No settings right
    Given the person has the role developer
    When the person opens Settings / Project
    Then Save is off and names project.settings

  @spec:projects#REQ-010
  Scenario: Overrides: Read only off
    Given the person has the role viewer and turns off the read-only override
    When the person saves a ticket
    Then the backend refuses the save and names work.edit

  @spec:projects#REQ-010
  Scenario: Overrides: Override
    Given a person who prefers one value and a project override of another value in the registry
    When the project is active
    Then the project value applies and the mark shows in Settings / Me
    And `.shipyard/project.yaml` holds no override

  @spec:projects#REQ-011
  Scenario: Settings / Health: Findings by group
    Given two missing tools and one broken ref
    When a person opens Settings / Health
    Then the groups show counts 2 and 1 and list each finding

  @spec:projects#REQ-011
  Scenario: Settings / Health: Healthy project
    Given a project with no finding
    When a person opens Settings / Health
    Then the view shows ghost rows and the status shape for "ok"

  @spec:projects#REQ-012
  Scenario: Fix actions: Fix a finding
    Given a stale generated file
    When a person clicks its fix action
    Then the system shows the new content and waits for one confirm click
    And after the confirm click the system regenerates the file and the finding clears

  @spec:projects#REQ-012
  Scenario: Fix actions: Fix with a preview
    Given a missing compliance file
    When a person clicks its fix action
    Then the system shows the new file and writes it after one confirm click

  @spec:projects#REQ-013
  Scenario: Health dot: Worst finding
    Given one warning and one error
    When the status bar renders
    Then the dot shows the error shape and colour

  @spec:projects#REQ-013
  Scenario: Health dot: Assistive label
    Given a screen reader
    When focus lands on the dot
    Then it announces the worst state and the finding count

  @spec:projects#REQ-014
  Scenario: Project import: Import a repository
    Given a repository with project files
    When a person runs the import
    Then the system writes the matching Shipyard files and shows a report

  @spec:projects#REQ-014
  Scenario: Project import: Nothing to import
    Given a repository with no project file
    When a person opens the import
    Then the view shows ghost rows and one primary action, Choose a folder

  @spec:projects#REQ-015
  Scenario: Import report and safety: Conflict
    Given a target file that exists
    When the import reaches it
    Then the report lists a conflict and the file stays unchanged until a person confirms

  @spec:projects#REQ-015
  Scenario: Import report and safety: Source intact
    Given a finished import
    When a person compares the source files
    Then they have no change

  @spec:projects#REQ-016
  Scenario: Interface rules: Keyboard only
    Given the first run view
    When a person uses Tab and Enter
    Then the person can finish each of the three starts

  @spec:projects#REQ-016
  Scenario: Interface rules: Language
    Given the language is French
    When a person opens Settings / Health
    Then every label is in French

  @spec:projects#REQ-017
  Scenario: Project entity: Resolve
    Given a registered project
    When the ref `project:<id>` resolves
    Then it returns the name and the working copy state

  @spec:projects#REQ-017
  Scenario: Project entity: Active project
    Given a switch to another project
    When any capability asks for the active project
    Then it gets the new project

  @spec:projects#REQ-018
  Scenario: Compass helpers check: Helper fails
    Given a working copy and a compass helper that reports a problem
    When a person opens Settings / Health
    Then the tool checks group lists that problem as a finding

  @spec:projects#REQ-018
  Scenario: Compass helpers check: No Node
    Given a machine with no Node tool
    When a person opens Settings / Health
    Then the tool checks group names the missing tool and runs no helper

  @spec:projects#REQ-019
  Scenario: Accent override: Project accent
    Given a project with an accent override in the registry
    When that project is active
    Then the interface shows the accent of the project
    And `.shipyard/project.yaml` holds no accent

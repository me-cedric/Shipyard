Feature: extensions

  @spec:extensions#REQ-001
  Scenario: Agents and rules view: Open the view
    Given a project with compass pinned
    When the person opens Settings / Agents and rules
    Then five lists show with a count each

  @spec:extensions#REQ-001
  Scenario: Agents and rules view: No compass pinned
    Given a project with no compass pinned
    When the person opens Settings / Agents and rules
    Then the view shows one Add compass action

  @spec:extensions#REQ-002
  Scenario: Skill list: Search
    Given the skill list
    When the person types `review`
    Then only skills that match show

  @spec:extensions#REQ-002
  Scenario: Skill list: Preview
    Given a skill in the list
    When the person selects it
    Then its text shows and no file changes

  @spec:extensions#REQ-003
  Scenario: Apply compass entries: Apply a pack
    Given a pack that is absent
    When the person applies it
    Then the new files appear and `ac sync` ran

  @spec:extensions#REQ-003
  Scenario: Apply compass entries: Kept file
    Given a project with its own `AGENTS.md`
    When the person applies the contract
    Then the file stays as it is and the report names it

  @spec:extensions#REQ-004
  Scenario: Pinned version and sync state: Drift
    Given an entry that changed upstream
    When the person opens the view
    Then the entry shows as stale with the pinned and the expected version

  @spec:extensions#REQ-004
  Scenario: Pinned version and sync state: After a clone
    Given a fresh clone of the repository
    When the person opens the view
    Then the states match those of the first machine

  @spec:extensions#REQ-005
  Scenario: Change the pinned version: No silent change
    Given a newer compass version upstream
    When the app starts
    Then the pinned version does not change

  @spec:extensions#REQ-006
  Scenario: Upgrade: Upgrade all
    Given three stale entries
    When the person chooses Upgrade
    Then the three entries become current

  @spec:extensions#REQ-006
  Scenario: Upgrade: Upgrade a selection
    Given three stale entries and a selection of one
    When the person chooses Upgrade
    Then only the selected entry changes

  @spec:extensions#REQ-007
  Scenario: Compass check for Health: Stale finding
    Given a stale skill
    When the person opens Settings / Health
    Then a finding names the skill and offers one fix

  @spec:extensions#REQ-007
  Scenario: Compass check for Health: Fix
    Given a stale finding
    When the person runs the fix
    Then the entry becomes current and the finding goes

  @spec:extensions#REQ-008
  Scenario: Roles and skills for factory and assistant: Role used
    Given the role `reviewer` and a workflow that uses it
    When the person opens the list
    Then the list shows `reviewer` and the workflow

  @spec:extensions#REQ-008
  Scenario: Roles and skills for factory and assistant: Run in progress
    Given a run that started before a role edit
    When the person edits the role
    Then the run keeps the old role and the next run uses the new one

  @spec:extensions#REQ-009
  Scenario: Catalog: Catalog groups
    Given the catalog
    When the person opens Settings / Extensions
    Then the three groups list their components with a state each

  @spec:extensions#REQ-010
  Scenario: Deploy a component: Preview and deploy
    Given a devcontainer component
    When the person previews and confirms
    Then only the listed files are written and the state becomes deployed

  @spec:extensions#REQ-010
  Scenario: Deploy a component: Existing file
    Given a target file that exists
    When the person deploys
    Then the file is kept and the report names it

  @spec:extensions#REQ-011
  Scenario: Plugin import: Valid archive
    Given a `.zip` with a manifest and files
    When the person imports it
    Then the plugin shows as a catalog entry and nothing is written

  @spec:extensions#REQ-011
  Scenario: Plugin import: Bad path
    Given an archive with a file path that leaves the project
    When the person imports it
    Then the system refuses the archive and names the path

  @spec:extensions#REQ-012
  Scenario: Plugin review before apply: Decline one
    Given a plugin with three files
    When the person declines one file and applies
    Then two files are written

  @spec:extensions#REQ-012
  Scenario: Plugin review before apply: Cancel
    Given a review in progress
    When the person cancels
    Then no file is written

  @spec:extensions#REQ-013
  Scenario: Plugin MCP servers: Remote server
    Given a plugin that names a remote MCP server
    When the person accepts it in the review
    Then the server appears in Settings / Connections

  @spec:extensions#REQ-013
  Scenario: Plugin MCP servers: Local command
    Given a plugin that names a local command
    When the person imports it
    Then the system refuses that server

  @spec:extensions#REQ-014
  Scenario: Update an imported plugin: Newer version
    Given an applied plugin
    When the person imports a newer archive
    Then the review shows the changes against the applied version

  @spec:extensions#REQ-015
  Scenario: Child projects: Progress
    Given a parent with 10 current entries and a child with 4
    When the person opens the list
    Then the child shows 4 of 10

  @spec:extensions#REQ-015
  Scenario: Child projects: Stale parent entry
    Given a parent entry that is stale
    When the person opens the child
    Then the entry is not proposed

  @spec:extensions#REQ-016
  Scenario: Deploy to child projects: Deploy
    Given a child project and a current component
    When the person deploys
    Then the clone holds a branch with one commit of the component

  @spec:extensions#REQ-016
  Scenario: Deploy to child projects: Existing in child
    Given a child that already has the component
    When the person opens the deploy
    Then the component shows as deployed and is not proposed again

  @spec:extensions#REQ-017
  Scenario: OpenSpec guidance for child repositories: Deploy guidance
    Given a child project with no spec folder
    When the person deploys the guidance
    Then the child gets the skeleton and the agent instructions

  @spec:extensions#REQ-017
  Scenario: OpenSpec guidance for child repositories: Own instructions
    Given a child with its own agent instructions
    When the person deploys the guidance
    Then the child keeps its file and the report names it

  @spec:extensions#REQ-018
  Scenario: Propagate health fixes: Fix in two children
    Given a finding that two children share
    When the person selects both and runs the fix
    Then each child gets a branch with the fix

  @spec:extensions#REQ-018
  Scenario: Propagate health fixes: Not selected
    Given three children with the finding
    When the person selects one
    Then the other two stay unchanged

  @spec:extensions#REQ-019
  Scenario: Interface rules: Keyboard only
    Given Settings / Extensions is open
    When the person uses only the keyboard
    Then the person can preview, review, deploy and import

  @spec:extensions#REQ-019
  Scenario: Interface rules: Language
    Given the language is French
    When the person opens both views
    Then all labels show in French

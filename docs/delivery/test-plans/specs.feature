Feature: specs

  @spec:specs#REQ-001
  Scenario: Changes list: List
    Given a project with three change folders
    When the person opens Specs / Changes
    Then the view lists three changes with their ids

  @spec:specs#REQ-001
  Scenario: Changes list: Empty list
    Given a project with no change
    When the person opens Specs / Changes
    Then the view shows ghost rows and the new change action

  @spec:specs#REQ-002
  Scenario: Artifact status: Partial change
    Given a change with a valid proposal and a spec that has one finding
    When the person opens the change
    Then the proposal shows done and the spec shows draft
    And the plan, the checklist and the tasks show missing

  @spec:specs#REQ-002
  Scenario: Artifact status: Not checked
    Given a change whose files changed since the last validation
    When the person opens the list of changes
    Then its artifacts show not checked, not draft
    And after a restart with no file change, a validated change keeps its status

  @spec:specs#REQ-003
  Scenario: Create and edit a change: Create
    Given a valid change id in kebab-case
    When the person creates the change
    Then the change exists with an empty proposal

  @spec:specs#REQ-003
  Scenario: Create and edit a change: Invalid id
    Given an id with a space or a capital letter
    When the person creates the change
    Then the system rejects the id and creates nothing

  @spec:specs#REQ-004
  Scenario: Validation per artifact: Finding on a spec
    Given a spec with a requirement that has no scenario
    When the person validates the change
    Then the spec artifact shows the finding with its line
    And the other artifacts show no finding

  @spec:specs#REQ-004
  Scenario: Validation per artifact: Valid change
    Given a change with no finding
    When the person validates it
    Then each artifact shows a valid state

  @spec:specs#REQ-005
  Scenario: Capabilities list: Open a capability
    Given a settled capability
    When the person selects it
    Then the view shows its spec, its plan, its checklist and its tasks

  @spec:specs#REQ-006
  Scenario: Requirement ids and backlinks: Backlinks of a requirement
    Given a test plan scenario and a work item that cite `spec:specs#REQ-004`
    When the person selects that requirement
    Then the inspector shows one `test:` link and one `wi:` link

  @spec:specs#REQ-007
  Scenario: Open markers: Marker with a question
    Given a spec with the marker `Q-035`
    When the person opens the spec
    Then the view shows one open marker that links to `q:Q-035`

  @spec:specs#REQ-007
  Scenario: Open markers: Marker with no question
    Given a marker with no `Q-NNN` id
    When the person opens the spec
    Then the view shows the marker as unlinked

  @spec:specs#REQ-008
  Scenario: Questions register: Filter by status
    Given a register with open and closed questions
    When the person filters by status open
    Then the list shows the open questions only

  @spec:specs#REQ-009
  Scenario: Question file: Write order
    Given a question with all fields set
    When the system writes the file
    Then the nine keys appear in the fixed order

  @spec:specs#REQ-009
  Scenario: Question file: Missing key
    Given a question file with no `owner` key
    When the system reads the register
    Then the system flags that file and does not drop it

  @spec:specs#REQ-010
  Scenario: Question edit: Unknown status
    Given a question
    When the person sets the status to a value outside the allowed list
    Then the system rejects the value and keeps the file unchanged

  @spec:specs#REQ-010
  Scenario: Question edit: Duplicate id
    Given a register that holds `Q-012`
    When the person creates another question with the id `Q-012`
    Then the system rejects the id

  @spec:specs#REQ-011
  Scenario: Test plans list: List
    Given two test plan files
    When the person opens Specs / Test plans
    Then the view lists two plans

  @spec:specs#REQ-012
  Scenario: Gherkin editing: Syntax error
    Given a plan with a step that has no keyword
    When the person saves it
    Then the system shows the error with its line

  @spec:specs#REQ-013
  Scenario: Requirement coverage: Uncovered requirement
    Given a spec with ten requirements and scenarios that cite nine of them
    When the person opens the coverage list
    Then the list shows the tenth requirement

  @spec:specs#REQ-013
  Scenario: Requirement coverage: Unknown requirement
    Given a scenario that cites `spec:specs#REQ-999`
    When the person saves the plan
    Then the system flags the citation as broken

  @spec:specs#REQ-014
  Scenario: Constitution: Edit
    Given the constitution
    When the person edits a rule and saves
    Then the file holds the new text

  @spec:specs#REQ-015
  Scenario: Fold an answer: Fold
    Given an answered question that a marker cites
    When the person confirms the fold preview
    Then the answer appears under `### Clarifications`
    And the marker no longer shows in the spec

  @spec:specs#REQ-015
  Scenario: Fold an answer: No heading yet
    Given a spec with no `### Clarifications` heading
    When the person confirms the fold
    Then the system adds the heading under `## Purpose`

  @spec:specs#REQ-016
  Scenario: Split draft: Draft with the workflow
    Given a change with a spec
    When the person starts the split
    Then the draft lists epics and stories with refs of requirements
    And the system writes nothing to the issue tracker

  @spec:specs#REQ-017
  Scenario: Split review: Remove an item
    Given a draft with six stories
    When the PM removes one story
    Then the apply covers five stories

  @spec:specs#REQ-018
  Scenario: Split apply: Apply
    Given a reviewed split and an issue tracker connection
    When the PM clicks apply
    Then the system hands the split to the apply of `add-work`
    And the issue tracker holds the epics and stories
    And each one shows as a `wi:` entity after the next sync

  @spec:specs#REQ-018
  Scenario: Split apply: No click
    Given a draft split that the `spec-split` workflow made
    When no person clicks apply
    Then the issue tracker stays unchanged

  @spec:specs#REQ-018
  Scenario: Split apply: Second apply
    Given a split that the PM applied
    When the PM applies it again
    Then the issue tracker receives no duplicate ticket

  @spec:specs#REQ-019
  Scenario: Split links: Links after apply
    Given an applied split
    When a person opens a work item
    Then the item shows the refs of its requirements

  @spec:specs#REQ-020
  Scenario: Archive: Archive a finished change
    Given a change whose work items are all done
    When the person archives it
    Then the change leaves Specs / Changes
    And its capabilities show in Specs / Capabilities

  @spec:specs#REQ-021
  Scenario: Entities: Resolve
    Given the ref `change:add-specs`
    When the reference graph resolves it
    Then it returns the title and status of the change

  @spec:specs#REQ-022
  Scenario: Interface rules: Keyboard
    Given any Specs view
    When the person uses the keyboard only
    Then the person reaches each action and sees a focus ring

  @spec:specs#REQ-022
  Scenario: Interface rules: Language
    Given the language French
    When the person opens a Specs view
    Then each label shows in French

  @spec:specs#REQ-023
  Scenario: Safe save: Changed on disk
    Given a spec that another tool changed after it opened
    When the person saves
    Then the system warns and offers to reload or to keep the version of the person

  @spec:specs#REQ-023
  Scenario: Safe save: Failed write
    Given a write that fails
    When the system reports the failure
    Then the old file stays unchanged

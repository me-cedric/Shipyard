Feature: workflow-editor

  @spec:workflow-editor#REQ-001
  Scenario: Form and text views: Switch view
    Given the workflow `feature` is open in the form
    When the person sets the effort of the step `build` to high and opens the text view
    Then the text shows `effort: high` under the step `build`

  @spec:workflow-editor#REQ-001
  Scenario: Form and text views: Invalid text
    Given the file of the workflow `bug` does not parse
    When the person opens it
    Then it opens in the text view with its issue and its line

  @spec:workflow-editor#REQ-002
  Scenario: Step fields: Add a step
    Given the workflow `spike` is open in the form
    When the person adds a step `check` with the role `tester` and moves it up once
    Then the step `check` comes before the step `report` in the text

  @spec:workflow-editor#REQ-003
  Scenario: Pickers: Pick the needs
    Given the workflow `feature` is open in the form
    When the person opens the needs of the step `review`
    Then the list offers `grill`, `plan`, `build` and `pr`, and not `review`

  @spec:workflow-editor#REQ-004
  Scenario: Run limits: Turn limit
    Given the workflow `feature` has no `max_turns`
    When the person turns on the turn limit and sets 40
    Then the text holds `max_turns: 40` under `limits`

  @spec:workflow-editor#REQ-004
  Scenario: Run limits: Budget
    Given the workflow `bug` has no `budget_usd`
    When the person turns on the budget and sets 2
    Then the text holds `budget_usd: 2` under `limits`

  @spec:workflow-editor#REQ-005
  Scenario: Live check: Unknown need
    Given a step `build` that needs `plan`
    When the person renames the step `plan` to `design`
    Then the form shows that `build` needs an unknown step and Save is off

  @spec:workflow-editor#REQ-006
  Scenario: Form save: Round trip
    Given each of the six bundled workflows
    When the form writes it with no change
    Then the workflow read from the new text is equal to the first one, and the top comment stays

  @spec:workflow-editor#REQ-007
  Scenario: Presets and copies: New from a preset
    Given a project with no workflow `hotfix`
    When the person makes a new workflow `hotfix` from the preset `bug`
    Then the file `.shipyard/workflows/hotfix.yaml` holds the steps of `bug` and the id `hotfix`

  @spec:workflow-editor#REQ-007
  Scenario: Presets and copies: Id in use
    Given a project with a workflow `bug`
    When the person makes a copy of `feature` with the id `bug`
    Then Shipyard refuses and the file `bug.yaml` does not change

  @spec:workflow-editor#REQ-008
  Scenario: Rename and delete: Delete the default workflow
    Given `feature` is the default workflow of the project
    When the person deletes `feature` and confirms
    Then Shipyard refuses and says that `feature` is the default workflow

  @spec:workflow-editor#REQ-008
  Scenario: Rename and delete: Rename
    Given a workflow `hotfix` that no run uses
    When the person renames it to `urgent`
    Then the file `urgent.yaml` holds the id `urgent` and `hotfix.yaml` is gone

  @spec:workflow-editor#REQ-009
  Scenario: Agent tools: Group off
    Given the group `workflows` is off
    When an outside agent lists the tools
    Then no workflow tool is in the list

  @spec:workflow-editor#REQ-009
  Scenario: Agent tools: Read-only project
    Given the group `workflows` is on and the profile of the project is read only
    When an outside agent calls `workflow_propose`
    Then the call is refused

  @spec:workflow-editor#REQ-010
  Scenario: Proposals: Apply a proposal
    Given an outside agent proposed a new text for `bug`
    When the person opens `bug`, reads the diff and clicks Apply
    Then the file `bug.yaml` holds the new text and the proposal is gone

  @spec:workflow-editor#REQ-010
  Scenario: Proposals: Invalid proposal
    Given an outside agent sends a text with a `needs` cycle
    When it calls `workflow_propose`
    Then the call returns the issue with its line and nothing is stored

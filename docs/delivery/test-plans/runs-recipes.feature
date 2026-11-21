Feature: runs-recipes

  @spec:runs-recipes#REQ-001
  Scenario: Pause an agent: Pause at the end of a turn
    Given a run in `Working` with a turn in progress
    When the person selects Pause
    Then the turn ends, no work is lost, and the run is `Paused` with the cause Person

  @spec:runs-recipes#REQ-001
  Scenario: Pause an agent: Resume
    Given a run paused by a person
    When the person selects Resume
    Then a new turn starts in the same worktree and the AI tool session continues when the tool can resume

  @spec:runs-recipes#REQ-001
  Scenario: Pause an agent: Slot kept
    Given a paused run and a project at its run limit
    When the engine looks for a free slot
    Then the paused run still holds its slot

  @spec:runs-recipes#REQ-002
  Scenario: Take it over: Take over a blocked run
    Given a run in `Blocked`
    When the person selects Take it over
    Then the run is `Cancelled` with the reason "Taken over by Ada", the branch and the worktree stay, and Ada is the assignee

  @spec:runs-recipes#REQ-002
  Scenario: Take it over: Editor opens
    Given a run that a person took over
    When the run ends
    Then the worktree opens in the editor

  @spec:runs-recipes#REQ-003
  Scenario: Attach a file in the agent chat: Attach a file
    Given a run with an open chat
    When the person attaches a file within the limits
    Then the file is in the run folder and the next turn reads it as context

  @spec:runs-recipes#REQ-003
  Scenario: Attach a file in the agent chat: File too large
    Given a file over the limit of `assistant_attach`
    When the person attaches it
    Then the chat refuses it and says the limit

  @spec:runs-recipes#REQ-004
  Scenario: Add a document to a new feature: Add a Word file
    Given a new feature that makes the change `add-export`
    When the person adds a Word file
    Then the file is in `docs/openspec/changes/add-export/inputs/`

  @spec:runs-recipes#REQ-004
  Scenario: Add a document to a new feature: Other kind
    Given a new feature
    When the person adds an image
    Then the page refuses it and names the three kinds

  @spec:runs-recipes#REQ-005
  Scenario: Limit of a new feature: Set a limit
    Given a new feature with the recipe Feature
    When the person sets the limit to $3.00
    Then `.shipyard/automation.yaml` holds the limit for the ticket key

  @spec:runs-recipes#REQ-005
  Scenario: Limit of a new feature: Sum of runs
    Given a feature with two runs that spend $1.50 each and a limit of $3.00
    When the second run ends
    Then the limit is reached and the choice of REQ-006 applies

  @spec:runs-recipes#REQ-006
  Scenario: Warn at and Then of budgets: Edit Warn at
    Given a project with Warn at 80 %
    When the person sets Warn at to 70 %
    Then the alert shows at 70 % of a budget

  @spec:runs-recipes#REQ-006
  Scenario: Warn at and Then of budgets: Go on
    Given a budget with Then set to Go on
    When the spend passes the budget
    Then the run goes on and the alert shows once

  @spec:runs-recipes#REQ-006
  Scenario: Warn at and Then of budgets: Default
    Given a budget with no choice set
    When the spend reaches the budget
    Then the run moves to `Paused` and waits for a person

  @spec:runs-recipes#REQ-006
  Scenario: Warn at and Then of budgets: Kill switch stays
    Given a run over a budget set to Go on
    When the person selects Stop all agents
    Then every run stops

  @spec:runs-recipes#REQ-007
  Scenario: Stage limits of Automation: Stage at its limit
    Given the Build limit is 2 and two runs are in Build
    When a third run is ready for Build
    Then the third run stays queued

  @spec:runs-recipes#REQ-008
  Scenario: Role of a human step: Role limits approval
    Given a human step with the role Tech lead
    When a person with the role Developer opens the step
    Then the person cannot approve it and gets no card on Today

  @spec:runs-recipes#REQ-009
  Scenario: Rows of a recipe step: Kind of a step
    Given a recipe with a person step
    When the person opens the step
    Then Kind shows person

  @spec:runs-recipes#REQ-009
  Scenario: Rows of a recipe step: May write alone
    Given a step with May write set to Asks first
    When the person sets Alone
    Then the approval "Do not ask again for this recipe" is on

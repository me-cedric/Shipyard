Feature: shell-setup-rights

  @spec:shell-setup-rights#REQ-001
  Scenario: Sign out
    Given a computer with a code host token and an issue tracker token
    When the person selects Sign out and confirms
    Then both tokens leave the keychain
    And the AI tools stay signed in

  @spec:shell-setup-rights#REQ-001
  Scenario: Sign out: Cancel
    Given the confirmation shows
    When the person cancels
    Then no token is removed

  @spec:shell-setup-rights#REQ-002
  Scenario: Take control
    Given a running Claude Code session
    When the person selects Take control
    Then the session stops
    And the Shipyard terminal runs the resume command of Claude Code

  @spec:shell-setup-rights#REQ-002
  Scenario: Take control: No history file
    Given a session of a tool with no readable history file
    When the person opens the pane
    Then the pane shows no live output

  @spec:shell-setup-rights#REQ-003
  Scenario: Processor and Memory: Bars
    Given two agent processes at work
    When the person opens How agents do
    Then the bars show the sum of the two processes, not the whole computer

  @spec:shell-setup-rights#REQ-003
  Scenario: Processor and Memory: Tool calls
    Given a step that read a ticket
    When the person opens the step
    Then the step lists the tool call that read the ticket

  @spec:shell-setup-rights#REQ-004
  Scenario: Plan right: Plan See
    Given a member with Plan See
    When the member saves an estimate
    Then the command is refused

  @spec:shell-setup-rights#REQ-004
  Scenario: Plan right: Plan Change
    Given a member with Plan Change
    When the member saves an estimate
    Then the estimate is saved

  @spec:shell-setup-rights#REQ-004
  Scenario: Plan right: Time stays personal
    Given a member with Plan No
    When the member writes a time entry
    Then the entry is saved

  @spec:shell-setup-rights#REQ-005
  Scenario: Fill from my work
    Given a person with one run on their ticket and two commits today
    When the person selects Fill from my work
    Then rows show for the run and the commits

  @spec:shell-setup-rights#REQ-006
  Scenario: A model for each agent role: Change a tier
    Given the bundled role Scout with no project file
    When the person sets the tier Standard
    Then the project file of Scout exists with the tier Standard

  @spec:shell-setup-rights#REQ-007
  Scenario: Budget notice
    Given Warn at is 70 % and the notice is on
    When a budget reaches 70 %
    Then a notification shows

  @spec:shell-setup-rights#REQ-007
  Scenario: Release channel: Preview
    Given the channel is Preview
    When the app checks for an update
    Then it considers the pre-releases of the release address

  @spec:shell-setup-rights#REQ-008
  Scenario: Data folder: Move
    Given a data folder and a new folder
    When the person confirms Change
    Then the data is in the new folder
    And the app restarts

  @spec:shell-setup-rights#REQ-008
  Scenario: Data folder: Cancel
    Given the confirmation shows
    When the person cancels
    Then the data stays

  @spec:shell-setup-rights#REQ-009
  Scenario: Feedback: Reveal
    Given the Feedback page
    When the person selects Attach a file
    Then the file manager shows the file
    And the app sends nothing

  @spec:shell-setup-rights#REQ-010
  Scenario: The permissions moment: First launch
    Given a first launch with two permissions missing
    When the app starts
    Then the card shows "Shipyard needs 2 permissions"

  @spec:shell-setup-rights#REQ-010
  Scenario: The permissions moment: Allow all
    Given the card shows
    When the person selects Allow all
    Then each listed permission is asked

  @spec:shell-setup-rights#REQ-011
  Scenario: Places hidden for each role: Hide a place
    Given the role Designer
    When the admin hides Code for Designer
    Then a Designer does not see Code

  @spec:shell-setup-rights#REQ-011
  Scenario: Places hidden for each role: Defaults
    Given a project with no change
    When the person opens Rights
    Then the default rights are as before

  @spec:shell-setup-rights#REQ-012
  Scenario: Project close: Stop them
    Given 2 agents work
    When the person closes the project and selects Stop them and close
    Then the runs stop
    And the project closes

  @spec:shell-setup-rights#REQ-012
  Scenario: Project close: Keep them
    Given 2 agents work
    When the person selects Keep them working
    Then the project closes
    And the runs go on

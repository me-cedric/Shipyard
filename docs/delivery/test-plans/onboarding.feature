Feature: onboarding

  @spec:onboarding#REQ-001
  Scenario: First launch: Fresh install
    Given Shipyard starts with no saved preferences
    When the window opens
    Then the tour opens at step 1

  @spec:onboarding#REQ-001
  Scenario: First launch: Skipped
    Given the person closed the tour at step 2
    When Shipyard starts again
    Then the tour does not open

  @spec:onboarding#REQ-002
  Scenario: Six steps: Steps
    Given the tour is open
    When the person clicks Next five times
    Then the tour shows the six steps in order, each with a title, one sentence and a picture

  @spec:onboarding#REQ-003
  Scenario: Keyboard and screen reader: Keyboard
    Given the tour is open at step 1
    When the person presses the Right arrow, then Escape
    Then the tour shows step 2, then closes

  @spec:onboarding#REQ-004
  Scenario: Replay: Replay
    Given the person closed the tour
    When the person chooses Replay the tour in the palette
    Then the tour opens at step 1

  @spec:onboarding#REQ-005
  Scenario: Manual: Open the manual
    Given the tour is at the last step
    When the person clicks Open the manual
    Then the tour closes and Knowledge / Manual opens

  @spec:onboarding#REQ-006
  Scenario: Permission states: Not asked
    Given the notifications were never asked on macOS
    When the person opens the permissions step
    Then the notifications show not asked and the action Allow

  @spec:onboarding#REQ-006
  Scenario: Permission states: Off
    Given the person refused the Documents folder
    When the list shows the files
    Then the files show off and the action Open System Settings

  @spec:onboarding#REQ-007
  Scenario: Ask after a click on macOS: Allow the folders
    Given the files show not asked
    When the person clicks Allow
    Then macOS asks for each folder and the list shows the new state

  @spec:onboarding#REQ-007
  Scenario: Ask after a click on macOS: No early prompt
    Given the files were never asked
    When the permissions list loads
    Then macOS shows no prompt

  @spec:onboarding#REQ-008
  Scenario: Windows and Linux: Windows
    Given Shipyard runs on Windows
    When the permissions list loads
    Then the files show not needed and the notifications offer Send a test and Open System Settings

  @spec:onboarding#REQ-009
  Scenario: Settings: Settings
    Given the person skipped the tour
    When the person opens Settings / Me
    Then the permissions show with their states and actions

  @spec:onboarding#REQ-010
  Scenario: Languages: French
    Given the language is French
    When the tour opens
    Then each step and each permission shows in French

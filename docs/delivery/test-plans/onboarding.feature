Feature: onboarding

  @spec:onboarding#REQ-001
  Scenario: Tour after the first project: Fresh install
    Given Shipyard starts with no saved preferences and no project
    When the window opens
    Then the first-run page shows and the tour does not open

  @spec:onboarding#REQ-001
  Scenario: Tour after the first project: First project
    Given the tour was never seen
    When the first project opens
    Then the tour opens at step 1

  @spec:onboarding#REQ-001
  Scenario: Tour after the first project: Skipped
    Given the person closed the tour at step 2
    When Shipyard starts again
    Then the tour does not open

  @spec:onboarding#REQ-001
  Scenario: Tour after the first project: Left by a setup action
    Given the tour is open
    When the person clicks a setup action in a step
    Then the tour does not open at the next launch

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
    Then the tour closes and the manual opens at `/knowledge/manual`

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

  @spec:onboarding#REQ-011
  Scenario: Setup in the tour: Pick the AI tool
    Given no default AI tool is set
    When the person opens the AI step
    Then the AI tool shows to do with a select, and a pick shows done

  @spec:onboarding#REQ-011
  Scenario: Setup in the tour: Connect the issue tracker
    Given no issue tracker is connected
    When the person clicks Connect on the issue tracker item
    Then the tour closes and Settings / Connections opens with the connection form

  @spec:onboarding#REQ-011
  Scenario: Setup in the tour: New project
    Given no project is open
    When the person clicks New project on the project item
    Then the tour closes and the New project creator opens

  @spec:onboarding#REQ-012
  Scenario: Add me as admin: No admin
    Given the team file has no admin
    When the person clicks Add me as admin
    Then the person is a member with the admin flag and the item shows done

  @spec:onboarding#REQ-013
  Scenario: Get started checklist: Card
    Given an item is to do
    When the person opens Home / Today
    Then one Get started card lists the items to do

  @spec:onboarding#REQ-013
  Scenario: Get started checklist: All done
    Given no item is to do
    When the person opens Home / Today
    Then the Get started card does not show

  @spec:onboarding#REQ-013
  Scenario: Get started checklist: Settings
    Given the person closed the tour
    When the person opens Settings / Me
    Then the same Get started card shows the items with their states

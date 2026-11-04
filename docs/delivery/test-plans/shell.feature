Feature: shell

  @spec:shell#REQ-001
  Scenario: Sidebar: Open a space
    Given the sidebar is open
    When the person selects Work
    Then the main area shows the Work space
    And the Work entry shows as current

  @spec:shell#REQ-002
  Scenario: Main area and inspector: Toggle inspector
    Given a view with a selected item
    When the person closes the inspector
    Then the main area keeps its scroll position and selection

  @spec:shell#REQ-003
  Scenario: Home views: Open Home
    Given the person opens Home
    When Home renders
    Then the three views are available as tabs
    And Inbox is the first tab

  @spec:shell#REQ-003
  Scenario: Home views: Pinned tile
    Given the person pinned a tile in Knowledge
    When My work renders
    Then the tile shows in My work and in Activity

  @spec:shell#REQ-004
  Scenario: Inbox content: Approve a pull request write
    Given the switch `pull_request` is off and a run is ready to open a pull request
    When the run asks for the write
    Then the Inbox shows an approval
    And one click on it sends the write

  @spec:shell#REQ-004
  Scenario: Inbox content: Answer a question
    Given an agent asked a question
    When the person opens the Inbox
    Then the question shows as a card with its options

  @spec:shell#REQ-005
  Scenario: Command palette: Jump to a ref
    Given the palette is open
    When the person types a ref such as `wi:KEY-1`
    Then the palette lists the matching entity
    And Enter opens it

  @spec:shell#REQ-005
  Scenario: Command palette: Run an action
    Given the palette is open
    When the person types the name of an action and presses Enter
    Then the action runs and the palette closes

  @spec:shell#REQ-006
  Scenario: Inspector and backlinks: Follow a backlink
    Given the inspector shows a spec requirement with two backlinks
    When the person activates a backlink
    Then the inspector shows the linked entity

  @spec:shell#REQ-007
  Scenario: Status bar: Sync from the status bar
    Given a project is open
    When the person activates the sync action
    Then the app starts one sync
    And the action shows its running state

  @spec:shell#REQ-007
  Scenario: Status bar: Health and runs
    Given two runs are active and one health check fails
    When the status bar renders
    Then it shows the count 2 for runs and a failed health shape and colour

  @spec:shell#REQ-008
  Scenario: Notifications: New approval
    Given the app is in the background and approval notifications are on
    When a run needs an approval
    Then a system notification shows
    And the notification centre lists the event once

  @spec:shell#REQ-009
  Scenario: Role home: Junior sidebar
    Given the person has the role junior
    When the app opens
    Then the main area shows Knowledge
    And the sidebar still lists all seven spaces and Settings

  @spec:shell#REQ-010
  Scenario: Settings / Me: Setting applies everywhere
    Given two projects are known
    When the person chooses the dark theme in Settings / Me
    Then both projects show the dark theme

  @spec:shell#REQ-011
  Scenario: Language: Switch to French
    Given the language is English
    When the person chooses French
    Then the sidebar, the palette and the menus show French

  @spec:shell#REQ-012
  Scenario: Native menu: Menu runs an action
    Given a project is open
    When the person chooses sync in the native menu
    Then the app runs the same sync as the status bar

  @spec:shell#REQ-013
  Scenario: Context menus: Keyboard context menu
    Given a row has focus
    When the person presses the context-menu key
    Then the menu opens with the actions of that entity
    And Escape closes it and returns focus to the row

  @spec:shell#REQ-014
  Scenario: Update check: New version found
    Given a newer version exists
    When the app starts
    Then the notification centre lists the update once

  @spec:shell#REQ-014
  Scenario: Update check: Release address
    Given the person set a release address in Settings / Me
    When the app checks for a new version
    Then it reads that address, and the default is the latest release of the Shipyard repository

  @spec:shell#REQ-014
  Scenario: Update check: After an update
    Given the app starts on a newer version than the last run
    When the app opens
    Then it shows the changelog sections of the new versions once

  @spec:shell#REQ-015
  Scenario: Reopen last view: Restart
    Given project A was last on Code / Pull requests
    When the person restarts and opens project A
    Then the main area shows Code / Pull requests

  @spec:shell#REQ-015
  Scenario: Reopen last view: Missing view
    Given the stored view no longer exists
    When the person opens the project
    Then the main area shows the role home

  @spec:shell#REQ-016
  Scenario: No tour, no hidden tab: First run
    Given the app starts for the first time
    When the first screen renders
    Then it shows the first-run view of `add-projects`
    And it shows no tour or help text

  @spec:shell#REQ-017
  Scenario: Shell accessibility: Keyboard navigation
    Given the app is open
    When the person uses the space shortcuts and Tab
    Then focus reaches the sidebar, the main area, the inspector and the status bar
    And each focused item shows a focus ring

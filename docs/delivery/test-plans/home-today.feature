Feature: home-today

  @spec:home-today#REQ-001
  Scenario: Two Home views: Open Home
    Given the person opens Home
    When Home renders
    Then the tabs are Today and Projects
    And Today is open

  @spec:home-today#REQ-002
  Scenario: Needs you: Approve in place
    Given a pull request write that waits for its approval
    When the person opens Today
    Then Needs you shows the approval
    And one click on it sends the write

  @spec:home-today#REQ-003
  Scenario: My tickets: Grouped tickets
    Given the person has one ticket in progress and two to do
    When Today renders
    Then In progress holds one row and To do holds two
    And each row offers its status and Start run

  @spec:home-today#REQ-004
  Scenario: My agents: Only my runs
    Given a run that works on a ticket of the person and a run on a ticket of another person
    When Today renders
    Then My agents shows the first run with Stop
    And not the second

  @spec:home-today#REQ-005
  Scenario: Since you were away: Newer events only
    Given the person opened Today yesterday
    And two events happened on their runs since
    When the person opens Today
    Then the section shows the two events, newest first

  @spec:home-today#REQ-006
  Scenario: Empty Today: Nothing to show
    Given no approval, no ticket, no run and no event for the person
    When Today renders
    Then one empty state shows with Open the backlog

  @spec:home-today#REQ-007
  Scenario: Pinned tiles in Dashboards: Existing pin
    Given the person pinned a tile before this change
    When the person opens Knowledge / Dashboards
    Then the tile shows at the top of the page
    And Home shows no tile

  @spec:home-today#REQ-008
  Scenario: Old addresses: Old link
    Given a saved link to `/home/my-work`
    When the person opens it
    Then Today opens

  @spec:home-today#REQ-009
  Scenario: Language and keyboard: French
    Given the language is French
    When Today renders
    Then every label is in French

Feature: gitlab-mcp

  @spec:gitlab-mcp#REQ-001
  Scenario: Sign-in scopes: Both scopes
    Given gitlab.com with `mcp` allowed
    When a person signs in
    Then the connection holds the scopes `api mcp`

  @spec:gitlab-mcp#REQ-001
  Scenario: Sign-in scopes: Fallback
    Given a host whose application does not allow `mcp`
    When a person signs in
    Then the sign-in works with the scope `api`

  @spec:gitlab-mcp#REQ-002
  Scenario: Granted scopes: Switch shown
    Given a connection with the granted scopes `api mcp`
    When a person opens the connection
    Then the GitLab MCP switch shows

  @spec:gitlab-mcp#REQ-002
  Scenario: Granted scopes: Switch hidden
    Given a connection with the granted scope `api` only
    When a person opens the connection
    Then the switch does not show

  @spec:gitlab-mcp#REQ-003
  Scenario: MCP server entry: Switch on
    Given a connection that has `mcp`
    When a person turns the switch on
    Then the project lists the GitLab MCP server and no project file holds the token

  @spec:gitlab-mcp#REQ-004
  Scenario: Token refresh: Expired token
    Given an expired sign-in token
    When the MCP server starts
    Then the system refreshes the token first and the server starts

  @spec:gitlab-mcp#REQ-005
  Scenario: Sign in again: Old sign-in
    Given a connection that has only `api`
    When a person opens the connection
    Then the page shows "Sign in again"

  @spec:gitlab-mcp#REQ-005
  Scenario: Sign in again: New sign-in
    Given a person who used "Sign in again"
    When the sign-in ends
    Then the switch is available

  @spec:gitlab-mcp#REQ-006
  Scenario: Test result: Answer
    Given a GitLab MCP server that answers
    When a person clicks Test
    Then the row shows the tool count

  @spec:gitlab-mcp#REQ-007
  Scenario: Permissions: Locked
    Given the read-only lock is on
    When a person turns the switch on
    Then the system refuses and names the lock

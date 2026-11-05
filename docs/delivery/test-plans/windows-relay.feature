Feature: windows-relay

  @spec:windows-relay#REQ-001
  Scenario: Named pipe: Second turn on Windows
    Given an assistant thread with an MCP server on Windows
    When the person sends a second message
    Then the turn reuses the open server and does not start it again

  @spec:windows-relay#REQ-002
  Scenario: App closed: App closed on Windows
    Given the app is closed on Windows
    When a headless run calls the relay
    Then the relay starts the server and the run continues

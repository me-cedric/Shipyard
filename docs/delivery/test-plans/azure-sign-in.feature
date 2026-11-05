Feature: azure-sign-in

  @spec:azure-sign-in#REQ-001
  Scenario: Device sign-in: Device code
    Given a person clicks "Sign in" on Azure
    When the system gets a device code
    Then the view shows the code and opens the Microsoft page

  @spec:azure-sign-in#REQ-002
  Scenario: Missing role: Missing role
    Given a person with no Cognitive Services OpenAI User role
    When a call is refused
    Then the row names the role

  @spec:azure-sign-in#REQ-003
  Scenario: No secret outside the keychain: Token stays in the keychain
    Given a person signed in to Azure
    When the app writes its logs
    Then no log line holds the token

Feature: provider-sign-in

  @spec:provider-sign-in#REQ-001
  Scenario: One view: Open the view
    Given Claude Code detected and OpenRouter with no key
    When a person opens Settings / Agents and rules
    Then one list shows both rows with a state and one action each

  @spec:provider-sign-in#REQ-002
  Scenario: Detection: agy only
    Given `agy` on the path and no `gemini`
    When the view loads
    Then the Gemini row shows as detected

  @spec:provider-sign-in#REQ-003
  Scenario: Tool sign-in: Sign in
    Given Codex detected and signed out
    When a person clicks "Sign in"
    Then the system runs `codex login` and the browser opens

  @spec:provider-sign-in#REQ-003
  Scenario: Tool sign-in: No token read
    Given a signed-in Claude Code
    When the view loads
    Then the system reads no keychain entry and no credential file of the tool

  @spec:provider-sign-in#REQ-004
  Scenario: Tool state: Codex signed out
    Given `codex login status` exits 1
    When the view loads
    Then the Codex row shows "Signed out"

  @spec:provider-sign-in#REQ-004
  Scenario: Tool state: Claude signed in
    Given `claude auth status` exits 0
    When the view loads
    Then the Claude Code row shows "Signed in"

  @spec:provider-sign-in#REQ-004
  Scenario: Tool state: No status command
    Given Copilot detected
    When the view loads
    Then the row shows "Not checked" and "Sign in"

  @spec:provider-sign-in#REQ-004
  Scenario: Tool state: Sign-in error in a run
    Given Copilot detected
    And the last run of Copilot ended with the error "not logged in"
    When the view loads
    Then the row shows "Signed out" and "Sign in"

  @spec:provider-sign-in#REQ-005
  Scenario: OpenRouter sign-in: Sign in
    Given a person clicks "Sign in" on OpenRouter
    When the browser returns the code to the localhost callback within 10 minutes
    Then the system gets a key and stores it in the keychain

  @spec:provider-sign-in#REQ-005
  Scenario: OpenRouter sign-in: Code expired
    Given the code is older than 10 minutes
    When the system exchanges it
    Then the row shows a plain error and "Sign in" again

  @spec:provider-sign-in#REQ-006
  Scenario: Azure sign-in: Device code
    Given a person clicks "Sign in" on Azure
    When the system gets a device code
    Then the view shows the code and opens the Microsoft page

  @spec:provider-sign-in#REQ-006
  Scenario: Azure sign-in: Missing role
    Given a person with no Cognitive Services OpenAI User role
    When a call is refused
    Then the row names the role

  @spec:provider-sign-in#REQ-007
  Scenario: Key paste: Good key
    Given a valid OpenAI key
    When a person saves it
    Then the test passes and the row shows "Ready"

  @spec:provider-sign-in#REQ-007
  Scenario: Key paste: Bad key
    Given a wrong key
    When a person saves it
    Then the row shows an error and the system stores nothing

  @spec:provider-sign-in#REQ-008
  Scenario: Local runtimes: Ollama runs
    Given Ollama on port 11434
    When the view loads
    Then `GET /api/tags` answers and the row shows "Running" with no action

  @spec:provider-sign-in#REQ-008
  Scenario: Local runtimes: Nothing runs
    Given no local runtime
    When the view loads
    Then the view lists no local row

  @spec:provider-sign-in#REQ-009
  Scenario: Secrets: Codex key on stdin
    Given a person pastes a Codex API key
    When the system runs `codex login --with-api-key`
    Then the key goes on stdin and not in the arguments

  @spec:provider-sign-in#REQ-010
  Scenario: Errors and interface: Language
    Given the language is French
    When a person opens the view
    Then all labels show in French

  @spec:provider-sign-in#REQ-010
  Scenario: Errors and interface: Keyboard
    Given the view is open
    When a person uses only the keyboard
    Then the person can sign in, paste a key and save

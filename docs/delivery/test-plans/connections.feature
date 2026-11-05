Feature: connections

  @spec:connections#REQ-001
  Scenario: Connections view: Open the view
    Given two tracker connections and one forge connection exist
    When a person opens Settings / Connections
    Then the list shows the groups with the counts 2 and 1
    And the only primary action is add a connection

  @spec:connections#REQ-001
  Scenario: Connections view: Empty list
    Given no connection exists
    When a person opens Settings / Connections
    Then the view shows ghost rows and the add action

  @spec:connections#REQ-002
  Scenario: Trackers: Add a tracker
    Given a person picks Linear and enters the key
    When the person saves
    Then a tracker connection appears in the list

  @spec:connections#REQ-003
  Scenario: Capability flags: Flag off
    Given a tracker with the time tracking flag off
    When a person opens a time view
    Then the view shows time tracking as unavailable
    And no request for time goes to the tracker

  @spec:connections#REQ-004
  Scenario: One work item shape: Same shape
    Given one fake Jira ticket and one fake Linear issue with the same data
    When each adapter reads its item
    Then both items have the same shape

  @spec:connections#REQ-004
  Scenario: One work item shape: Tracker field stays inside
    Given a Jira ticket with a custom field
    When the work item is built
    Then the custom field is not a field of the work item

  @spec:connections#REQ-005
  Scenario: Forges: Add a forge
    Given a person picks GitHub and enters a token
    When the person saves
    Then a forge connection appears and the token goes to the keychain

  @spec:connections#REQ-006
  Scenario: MCP catalogue and custom servers: Enable from the catalogue
    Given the catalogue lists a server
    When a person enables it
    Then it appears in the MCP group of the list

  @spec:connections#REQ-006
  Scenario: MCP catalogue and custom servers: Custom server
    Given a person enters a name and a command
    When the person saves
    Then the custom server appears in the list

  @spec:connections#REQ-007
  Scenario: Start and stop MCP servers: Start and stop
    Given a stopped server
    When a person starts it and then stops it
    Then the state moves to running and then to stopped

  @spec:connections#REQ-008
  Scenario: Dependency check: Missing dependency
    Given a server that needs a tool that is not installed
    When a person starts it
    Then it does not start
    And the row names the missing tool

  @spec:connections#REQ-009
  Scenario: Agent runners: Detect a runner
    Given Codex is installed
    When a person opens the runners group
    Then Codex shows as detected with its version

  @spec:connections#REQ-009
  Scenario: Agent runners: Missing runner
    Given Gemini CLI is not installed
    When a person opens the runners group
    Then Gemini CLI shows as missing

  @spec:connections#REQ-010
  Scenario: Model providers: Add a provider
    Given a person enters an address, a model and a key
    When the person saves
    Then the provider appears in the list
    And the key is in the keychain

  @spec:connections#REQ-011
  Scenario: Secrets in the keychain: Save a secret
    Given a person enters a token
    When the person saves
    Then the keychain holds the token
    And no repository file, log line or argument holds it

  @spec:connections#REQ-011
  Scenario: Secrets in the keychain: Masked value
    Given a saved token
    When a person opens the connection
    Then the view shows the value masked

  @spec:connections#REQ-012
  Scenario: Connection test: Missing scope
    Given a forge token without the pull request scope
    When a person runs the test
    Then the result fails and names the pull request scope

  @spec:connections#REQ-012
  Scenario: Connection test: Passed
    Given a valid tracker connection
    When a person runs the test
    Then the result shows passed
    And the tracker received no write

  @spec:connections#REQ-013
  Scenario: Local settings: Repository stays clean
    Given a connection with a host address
    When the project is committed
    Then no file in the repository holds the host address of the connection

  @spec:connections#REQ-014
  Scenario: Remove a connection: Remove
    Given a tracker connection that one project uses
    When a person removes it and confirms
    Then the connection leaves the list
    And the keychain no longer holds its secret

  @spec:connections#REQ-014
  Scenario: Remove a connection: Cancel
    Given the confirm step lists one project
    When a person cancels
    Then the connection and its secret stay

  @spec:connections#REQ-015
  Scenario: Connection entity: Resolve
    Given a connection
    When the ref `conn:<id>` resolves
    Then it returns the name, the kind and the state

  @spec:connections#REQ-016
  Scenario: Interface rules: Keyboard only
    Given Settings / Connections
    When a person uses Tab and Enter
    Then the person can add, test and remove a connection

  @spec:connections#REQ-016
  Scenario: Interface rules: Language
    Given the language is French
    When a person opens Settings / Connections
    Then every label is in French

  @spec:connections#REQ-017
  Scenario: MCP proxy: Proxied tools
    Given an active MCP server `jira`
    When an agent client lists the tools of the Shipyard endpoint
    Then the list holds the Shipyard tools and the `jira__<tool>` tools

  @spec:connections#REQ-017
  Scenario: MCP proxy: Dead server
    Given a proxied server process that stopped
    When an agent calls one of its tools
    Then the system starts the server again and answers the call

  @spec:connections#REQ-018
  Scenario: MCP relay: Second turn
    Given an assistant thread with an MCP server
    When the person sends a second message
    Then the turn reuses the open server and does not start it again

  @spec:connections#REQ-018
  Scenario: MCP relay: App closed
    Given the app is closed
    When a headless run calls the relay
    Then the relay starts the server and the run continues

  @spec:connections#REQ-019
  Scenario: Repository picker: No push right
    Given a forge connection whose account can only read a repository
    When a person lists the repositories
    Then that repository shows a marker that push is not possible

  @spec:connections#REQ-019
  Scenario: Repository picker: Push target check
    Given a project whose remote the account cannot push to
    When a person checks the push target
    Then the check names the missing permission

  @spec:connections#REQ-019
  Scenario: Repository picker: Create a remote repository
    Given a forge connection with the right to create
    When a person asks for a new remote repository
    Then the forge holds the repository and the project uses it as its remote

  @spec:connections#REQ-020
  Scenario: Wire other agents: Agent tools found
    Given a project with Claude Code `.mcp.json`, Codex `.codex/config.toml` (or `~/.codex/config.toml`), Gemini `.gemini/settings.json` and VS Code `.vscode/mcp.json`
    When the person opens the wiring list
    Then each tool shows wired, out of date or not wired

  @spec:connections#REQ-020
  Scenario: Wire other agents: Token by name
    Given the person wires an agent tool
    When the file is written
    Then the entry reads `SHIPYARD_MCP_TOKEN` and holds no token value

  @spec:connections#REQ-020
  Scenario: Wire other agents: Review before write
    Given a project with a `.mcp.json` that holds another server
    When the person clicks Wire for Claude Code
    Then the review shows the added lines, and the file stays unchanged until the person clicks Write the file
    And the other server is still in the file after the write

  @spec:connections#REQ-020
  Scenario: Wire other agents: Out of date
    Given a wired agent tool
    When the person changes the port of the server and applies it
    Then the tool shows Out of date, and one click on Update shows the review of the new address

  @spec:connections#REQ-020
  Scenario: Wire other agents: Prompts and resources
    Given a project with a skill and the read tools on
    When an agent calls `prompts/list` and `resources/list`
    Then it gets the skill and the files of the project
    And with the read tools off it gets neither

  @spec:connections#REQ-021
  Scenario: Paste a server: Secret in the paste
    Given a pasted server with a token in `env`
    When the person adds it
    Then the token is in the secret store and no file of the app holds it

  @spec:connections#REQ-021
  Scenario: Paste a server: Read only preset
    Given the preset Read only
    When the person applies it
    Then the write tools do not run and the read tools do

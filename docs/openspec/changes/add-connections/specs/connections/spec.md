# Spec: connections

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-connections`

### Goal

A person adds, tests and removes each external system in one place: Settings / Connections. A connection is a tracker, a forge, an MCP server, an agent runner or a model provider. Secrets stay in the OS keychain.

### Why

Legacy is Jira-shaped. Its credentials, MCP servers and assistants sit on different pages. Shipyard serves teams on Jira, GitHub, GitLab, Azure DevOps and Linear. It needs one place to connect each system, one contract for all trackers, and no secret in a repository.

### Users And Scenarios

- PM: connects the team tracker and sees which features it supports.
- Architect: adds an MCP server for design tools and starts it.
- Developer: connects a forge and a runner, then runs the connection test.
- QA: reads the test result of a connection and finds the missing scope.
- BA: connects a tracker in a second project that uses another product.
- Functional lead: removes a connection that a client no longer uses.
- Junior: follows the test result to fix a connection with no help.

### Requirements

- REQ-001: The system SHALL show Settings / Connections with one list of all connections, grouped by kind, and one primary action: add a connection.
- REQ-002: The system SHALL connect these trackers: Jira Cloud, Jira Data Center, GitHub Issues, GitLab Issues, Azure DevOps and Linear.
- REQ-003: Each tracker connection SHALL state its capability flags: hierarchy, transitions, labels, comments, time tracking and assignee.
- REQ-004: The system SHALL give every other capability the same work item shape for all trackers, and MUST NOT let the shape of one tracker reach another.
- REQ-005: The system SHALL connect these forges: GitHub, GitLab and Azure DevOps.
- REQ-006: The system SHALL list a catalogue of MCP servers and SHALL accept a custom MCP server.
- REQ-007: The system SHALL start and stop an MCP server and SHALL show its state.
- REQ-008: The system SHALL check the dependencies of an MCP server before it starts and SHALL name each missing one.
- REQ-009: The system SHALL detect and connect these agent runners: Claude Code, Codex, GitHub Copilot (ACP), Gemini CLI and OpenCode.
- REQ-010: The system SHALL connect HTTP model providers.
- REQ-011: The system SHALL keep each secret in the OS keychain only. A secret MUST NOT appear in an argument, a URL, a log or a repository file. [NEEDS CLARIFICATION: Q-017 Does a connection read the credentials of git, gh and glab before the keychain?] Working assumption: no, the keychain is the only source.
- REQ-012: The system SHALL test a connection on request and SHALL name the missing scope or permission when the test fails.
- REQ-013: The system SHALL keep the settings of a connection that are not secret on the machine of the person. [NEEDS CLARIFICATION: Q-018 Where do the non-secret settings of a connection live?] Working assumption: the app data folder, with the connection id named in `.shipyard/project.yaml`.
- REQ-014: The system SHALL remove a connection on request, SHALL delete its secret from the keychain and SHALL list the entities that use it before it removes.
- REQ-015: The system SHALL expose each connection as a `conn:<id>` entity and SHALL give the adapter of each connection to the other capabilities.
- REQ-016: Each connections view SHALL follow the interface rules of the constitution.
- REQ-017: The Shipyard MCP endpoint SHALL also serve the tools of each active MCP server, named `<server-id>__<tool>`.
- REQ-018: The system SHALL keep a stdio MCP server open between agent turns through a relay.

### Non-Goals

- Syncing tickets and pull requests. The `sync` capability owns it.
- Running an agent. The `factory` capability owns runs.
- Choosing the tracker of a project. The `projects` capability holds the project file.
- A webhook relay or a hosted proxy.
- Deploying MCP servers from the plugin catalogue. The `extensions` capability owns it.
- Storing a secret in any place except the OS keychain.

### Acceptance Criteria

- [ ] Settings / Connections lists the six tracker kinds, the three forge kinds, MCP servers, runners and providers.
- [ ] Each tracker connection shows the six flags with a shape and a colour.
- [ ] A view that needs a flag the tracker lacks shows that it is off. It shows no error.
- [ ] A contract test with fakes passes for each tracker with the same work item shape.
- [ ] A custom MCP server starts, shows running, stops, and shows stopped.
- [ ] An MCP server with a missing dependency does not start and names the dependency.
- [ ] An installed runner CLI appears as detected with no manual step.
- [ ] A token never appears in a process argument list, a URL, a log line or a repository file.
- [ ] A failed test names the missing scope or permission.
- [ ] Removing a connection deletes its keychain entry.
- [ ] A `conn:<id>` ref resolves to the connection with its kind and state.
- [ ] Every view works with the keyboard, shows a focus ring and has French and English text.
- [ ] An external agent client lists the tools of an active MCP server through the one Shipyard endpoint.
- [ ] A second agent turn reuses the open MCP server and does not start it again.

### Links

- Consumes: nothing.
- Produces: `conn:` entities and the Tracker, Forge, runner and provider adapters.
- Used by: `add-sync` (Tracker and Forge adapters), `add-factory` (runners, MCP servers), `add-questions-loop` (comments through the Tracker), `add-delivery` (Forge), `add-code` (Forge), `add-work` (flags), `add-assistant` (runners, providers), `add-projects` (clone credentials, REQ-003 of `spec:projects`).
- Related: `spec:shell` REQ-010 (Settings / Me, no connection setting there), `q:Q-002` (writes are off by default; this capability only provides the adapters).

### Legacy parity

| Legacy feature | Shipyard view | REQ ids |
| --- | --- | --- |
| MCP servers (catalogue, custom, start, stop, deps) | Settings / Connections / MCP | REQ-006, REQ-007, REQ-008 |
| Identifiants (keychain, test button) | Settings / Connections | REQ-005, REQ-011, REQ-012 |
| Tickets setup | Settings / Connections / Trackers | REQ-002, REQ-003, REQ-004, REQ-012 |
| Assistant CLI detection | Settings / Connections / Runners and providers | REQ-009, REQ-010 |
| PR forge setup | Settings / Connections / Forges | REQ-005 |
| Legacy MCP server relay and proxy | Shipyard MCP endpoint | REQ-017, REQ-018 |

### Existing References

- `docs/plan/MASTER-PLAN.md` sections 4, 5.1, 5.8 and 7.1.
- `docs/openspec/constitution.md` sections 3, 4 and 6.
- `docs/decisions/0007-polling-sync-with-local-mirror.md`
- `docs/delivery/questions/Q-002.md`
- `docs/delivery/questions/Q-017.md`
- `docs/delivery/questions/Q-018.md`

## ADDED Requirements

### Requirement: REQ-001 Connections view

The system SHALL show Settings / Connections with one list of all connections, grouped by kind. Each group heading SHALL show a count. The view SHALL have one primary action: add a connection.

#### Scenario: Open the view
- GIVEN two tracker connections and one forge connection exist
- WHEN a person opens Settings / Connections
- THEN the list shows the groups with the counts 2 and 1
- AND the only primary action is add a connection

#### Scenario: Empty list
- GIVEN no connection exists
- WHEN a person opens Settings / Connections
- THEN the view shows ghost rows and the add action

### Requirement: REQ-002 Trackers

The system SHALL connect Jira Cloud, Jira Data Center, GitHub Issues, GitLab Issues, Azure DevOps and Linear as trackers.

#### Scenario: Add a tracker
- GIVEN a person picks Linear and enters the key
- WHEN the person saves
- THEN a tracker connection appears in the list

### Requirement: REQ-003 Capability flags

Each tracker connection SHALL state the flags hierarchy, transitions, labels, comments, time tracking and assignee. Each flag SHALL be on or off. A capability that needs a flag that is off SHALL show it is unavailable, and MUST NOT call the tracker for it.

#### Scenario: Flag off
- GIVEN a tracker with the time tracking flag off
- WHEN a person opens a time view
- THEN the view shows time tracking as unavailable
- AND no request for time goes to the tracker

### Requirement: REQ-004 One work item shape

The system SHALL give every other capability the same work item shape for all trackers. A field that belongs to one tracker only MUST NOT reach a capability outside the adapter of that tracker.

#### Scenario: Same shape
- GIVEN one fake Jira ticket and one fake Linear issue with the same data
- WHEN each adapter reads its item
- THEN both items have the same shape

#### Scenario: Tracker field stays inside
- GIVEN a Jira ticket with a custom field
- WHEN the work item is built
- THEN the custom field is not a field of the work item

### Requirement: REQ-005 Forges

The system SHALL connect GitHub, GitLab and Azure DevOps as forges. A forge connection SHALL give pull request and CI status access to other capabilities.

#### Scenario: Add a forge
- GIVEN a person picks GitHub and enters a token
- WHEN the person saves
- THEN a forge connection appears and the token goes to the keychain

### Requirement: REQ-006 MCP catalogue and custom servers

The system SHALL list a catalogue of MCP servers and SHALL let a person enable one. The system SHALL accept a custom MCP server with a name, a command or an address, and its settings.

#### Scenario: Enable from the catalogue
- GIVEN the catalogue lists a server
- WHEN a person enables it
- THEN it appears in the MCP group of the list

#### Scenario: Custom server
- GIVEN a person enters a name and a command
- WHEN the person saves
- THEN the custom server appears in the list

### Requirement: REQ-007 Start and stop MCP servers

The system SHALL start and stop an MCP server from its row. The row SHALL show the state: stopped, starting, running or failed. The system MUST stop each server that it started when the app quits.

#### Scenario: Start and stop
- GIVEN a stopped server
- WHEN a person starts it and then stops it
- THEN the state moves to running and then to stopped

### Requirement: REQ-008 Dependency check

The system SHALL check the dependencies of an MCP server before it starts. When a dependency is missing, the system MUST NOT start the server and SHALL name each missing dependency.

#### Scenario: Missing dependency
- GIVEN a server that needs a tool that is not installed
- WHEN a person starts it
- THEN it does not start
- AND the row names the missing tool

### Requirement: REQ-009 Agent runners

The system SHALL detect Claude Code, Codex, GitHub Copilot (ACP), Gemini CLI and OpenCode when they are installed. The system SHALL show each runner as detected or missing, with its version when known.

#### Scenario: Detect a runner
- GIVEN Codex is installed
- WHEN a person opens the runners group
- THEN Codex shows as detected with its version

#### Scenario: Missing runner
- GIVEN Gemini CLI is not installed
- WHEN a person opens the runners group
- THEN Gemini CLI shows as missing

### Requirement: REQ-010 Model providers

The system SHALL connect HTTP model providers with an address, a model name and a secret. The secret SHALL follow REQ-011.

#### Scenario: Add a provider
- GIVEN a person enters an address, a model and a key
- WHEN the person saves
- THEN the provider appears in the list
- AND the key is in the keychain

### Requirement: REQ-011 Secrets in the keychain

The system SHALL keep each secret in the OS keychain only. A secret MUST NOT appear in a process argument, a URL, a log or a repository file. The view MUST show a saved secret masked. [NEEDS CLARIFICATION: Q-017 Does a connection read the credentials of git, gh and glab before the keychain?] Working assumption: no, the keychain is the only source.

#### Scenario: Save a secret
- GIVEN a person enters a token
- WHEN the person saves
- THEN the keychain holds the token
- AND no repository file, log line or argument holds it

#### Scenario: Masked value
- GIVEN a saved token
- WHEN a person opens the connection
- THEN the view shows the value masked

### Requirement: REQ-012 Connection test

The system SHALL test a connection on request. A passed test SHALL show a passed state. A failed test SHALL name the missing scope or permission, or the reason when it is not a scope. The test MUST NOT write to the external system.

#### Scenario: Missing scope
- GIVEN a forge token without the pull request scope
- WHEN a person runs the test
- THEN the result fails and names the pull request scope

#### Scenario: Passed
- GIVEN a valid tracker connection
- WHEN a person runs the test
- THEN the result shows passed
- AND the tracker received no write

### Requirement: REQ-013 Local settings

The system SHALL keep the non-secret settings of a connection on the machine of the person. It MUST NOT put a host or a token in the repository. [NEEDS CLARIFICATION: Q-018 Where do the non-secret settings of a connection live?] Working assumption: the app data folder, with the connection id named in `.shipyard/project.yaml`.

#### Scenario: Repository stays clean
- GIVEN a connection with a host address
- WHEN the project is committed
- THEN no file in the repository holds the host address of the connection

### Requirement: REQ-014 Remove a connection

The system SHALL remove a connection on request. The system SHALL delete its secret from the keychain. Before it removes, the system SHALL list the entities that use the connection.

#### Scenario: Remove
- GIVEN a tracker connection that one project uses
- WHEN a person removes it and confirms
- THEN the connection leaves the list
- AND the keychain no longer holds its secret

#### Scenario: Cancel
- GIVEN the confirm step lists one project
- WHEN a person cancels
- THEN the connection and its secret stay

### Requirement: REQ-015 Connection entity

The system SHALL expose each connection as a `conn:<id>` entity. The system SHALL give the adapter of a connection to the capabilities that consume it.

#### Scenario: Resolve
- GIVEN a connection
- WHEN the ref `conn:<id>` resolves
- THEN it returns the name, the kind and the state

### Requirement: REQ-016 Interface rules

Each connections view SHALL have no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path, a focus ring, assistive labels, enough contrast and no motion under reduced motion. It SHALL use an icon and a noun as the label of each action. Its text SHALL exist in French and English.

#### Scenario: Keyboard only
- GIVEN Settings / Connections
- WHEN a person uses Tab and Enter
- THEN the person can add, test and remove a connection

#### Scenario: Language
- GIVEN the language is French
- WHEN a person opens Settings / Connections
- THEN every label is in French

### Requirement: REQ-017 MCP proxy

The Shipyard MCP endpoint SHALL serve its own tools and the tools of each active MCP server. Each proxied tool SHALL have the name `<server-id>__<tool>`. The secrets of a proxied server MUST stay in the OS keychain.

#### Scenario: Proxied tools
- GIVEN an active MCP server `jira`
- WHEN an agent client lists the tools of the Shipyard endpoint
- THEN the list holds the Shipyard tools and the `jira__<tool>` tools

#### Scenario: Dead server
- GIVEN a proxied server process that stopped
- WHEN an agent calls one of its tools
- THEN the system starts the server again and answers the call

### Requirement: REQ-018 MCP relay

The system SHALL start a relay in place of a stdio MCP server for an agent turn. The relay SHALL forward each request to the server that the app keeps open. When the app is closed, the relay SHALL start the server itself.

#### Scenario: Second turn
- GIVEN an assistant thread with an MCP server
- WHEN the person sends a second message
- THEN the turn reuses the open server and does not start it again

#### Scenario: App closed
- GIVEN the app is closed
- WHEN a headless run calls the relay
- THEN the relay starts the server and the run continues

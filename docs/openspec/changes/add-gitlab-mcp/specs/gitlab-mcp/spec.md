# Spec: gitlab-mcp

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-31
Change: `change:add-gitlab-mcp`

### Goal

A person who signs in to GitLab with the browser can turn on the GitLab MCP server in one click. The assistant then uses its tools with no other token.

### Why

The owner registered the gitlab.com application with the `api` and `mcp` scopes. The sign-in token can then also open the GitLab MCP server. One sign-in for the code host and the assistant tools keeps the first hour easy for every role.

### Users And Scenarios

- Project manager: signs in to GitLab once, clicks the GitLab tools switch, then asks the assistant about the issues and merge requests of the project.
- Developer who signed in before this change: sees one "Sign in again" action on the connection, and gets the GitLab tools after it.

### Requirements

- REQ-001: The GitLab device sign-in SHALL ask for the scopes `api mcp`. When the application of a host does not allow `mcp`, the sign-in SHALL fall back to `api` and SHALL still work.
- REQ-002: The connection SHALL store the scopes that GitLab granted. The UI SHALL show the GitLab MCP switch only when the granted scopes hold `mcp`.
- REQ-003: The switch SHALL add the GitLab MCP server of the connection host to the MCP servers of the project. The entry SHALL use the Bearer token of the sign-in. The system SHALL read the token from the secret store at launch. The system MUST NOT write the token to a project file. The entry SHALL use the address `https://<host>/api/v4/mcp`. The switch shows on every GitLab connection whose granted scopes hold `mcp`. Test reports a missing server or a refused token in plain words.
- REQ-004: The token refresh of the sign-in SHALL also serve the MCP server. The system SHALL refresh an expired token before the server starts.
- REQ-005: A connection with only `api` SHALL show one "Sign in again" action next to the switch. After the new sign-in, the switch SHALL be available.
- REQ-006: Test on the MCP server row SHALL say whether the GitLab MCP server answers and how many tools it gives, as for the other servers.
- REQ-007: The MCP server SHALL follow the read-only lock and the permission levels of the assistant, as the other MCP servers do.

### Non-Goals

- The GitLab Orbit knowledge graph server (`mcp_orbit`).
- GitLab Duo features (`ai_features`).
- MCP for GitHub. That is another change.

### Acceptance Criteria

- [ ] A new GitLab sign-in on gitlab.com asks for `api mcp`, and the connection shows the GitLab MCP switch.
- [ ] The switch on gives a working MCP server row. Test shows the tool count.
- [ ] No project file holds the token after the switch is on.
- [ ] An old sign-in with `api` only shows "Sign in again", and the switch shows after it.
- [ ] The read-only lock refuses the switch.

### Existing References

- Existing code/docs/specs: `crates/shipyard-app/src/device_login.rs`, `crates/shipyard-app/src/mcp_tools.rs`, `crates/shipyard-app/resources/oauth.env`
- Supersedes or extends: extends `docs/openspec/changes/add-connections/`

### Clarifications

- Q-131 Which GitLab tiers and versions expose the MCP server, and at which address?: The address is `https://<host>/api/v4/mcp`. The token needs the `mcp` scope. The switch shows on every GitLab connection whose granted scopes hold `mcp`. Test reports a missing server or a refused token in plain words. Tiers and versions: see Q-131.

## ADDED Requirements

### Requirement: REQ-001 Sign-in scopes

The GitLab device sign-in SHALL ask for the scopes `api mcp`. When the application of a host does not allow `mcp`, the sign-in SHALL fall back to `api` and SHALL still work.

#### Scenario: Both scopes
- GIVEN gitlab.com with `mcp` allowed
- WHEN a person signs in
- THEN the connection holds the scopes `api mcp`

#### Scenario: Fallback
- GIVEN a host whose application does not allow `mcp`
- WHEN a person signs in
- THEN the sign-in works with the scope `api`

### Requirement: REQ-002 Granted scopes

The connection SHALL store the scopes that GitLab granted. The UI SHALL show the GitLab MCP switch only when the granted scopes hold `mcp`.

#### Scenario: Switch shown
- GIVEN a connection with the granted scopes `api mcp`
- WHEN a person opens the connection
- THEN the GitLab MCP switch shows

#### Scenario: Switch hidden
- GIVEN a connection with the granted scope `api` only
- WHEN a person opens the connection
- THEN the switch does not show

### Requirement: REQ-003 MCP server entry

The switch SHALL add the GitLab MCP server of the connection host to the MCP servers of the project. The entry SHALL use the Bearer token of the sign-in. The system SHALL read the token from the secret store at launch. The system MUST NOT write the token to a project file. The entry SHALL use the address `https://<host>/api/v4/mcp`. The switch shows on every GitLab connection whose granted scopes hold `mcp`. Test reports a missing server or a refused token in plain words.

#### Scenario: Switch on
- GIVEN a connection that has `mcp`
- WHEN a person turns the switch on
- THEN the project lists the GitLab MCP server and no project file holds the token

### Requirement: REQ-004 Token refresh

The token refresh of the sign-in SHALL also serve the MCP server. The system SHALL refresh an expired token before the server starts.

#### Scenario: Expired token
- GIVEN an expired sign-in token
- WHEN the MCP server starts
- THEN the system refreshes the token first and the server starts

### Requirement: REQ-005 Sign in again

A connection with only `api` SHALL show one "Sign in again" action next to the switch. After the new sign-in, the switch SHALL be available.

#### Scenario: Old sign-in
- GIVEN a connection that has only `api`
- WHEN a person opens the connection
- THEN the page shows "Sign in again"

#### Scenario: New sign-in
- GIVEN a person who used "Sign in again"
- WHEN the sign-in ends
- THEN the switch is available

### Requirement: REQ-006 Test result

Test on the MCP server row SHALL say whether the GitLab MCP server answers and how many tools it gives, as for the other servers.

#### Scenario: Answer
- GIVEN a GitLab MCP server that answers
- WHEN a person clicks Test
- THEN the row shows the tool count

### Requirement: REQ-007 Permissions

The MCP server SHALL follow the read-only lock and the permission levels of the assistant, as the other MCP servers do.

#### Scenario: Locked
- GIVEN the read-only lock is on
- WHEN a person turns the switch on
- THEN the system refuses and names the lock

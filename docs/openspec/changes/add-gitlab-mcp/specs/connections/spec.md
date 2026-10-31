# Spec: GitLab MCP server through the browser sign-in

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-31

## Goal

A person who signs in to GitLab with the browser can turn on the GitLab MCP server in one click, and the assistant uses its tools with no other token.

## Why

The owner registered the gitlab.com application with the `api` and `mcp` scopes. The sign-in token can then also open the GitLab MCP server. One sign-in for the forge and the assistant tools keeps the first hour easy for every role.

## Users And Scenarios

- Project manager: signs in to GitLab once, clicks the GitLab tools switch, then asks the assistant about the issues and merge requests of the project.
- Developer who signed in before this change: sees one "Sign in again" action on the connection, and gets the GitLab tools after it.

## Requirements

- REQ-001: The GitLab device sign-in asks for the scopes `api mcp`. A host whose application does not allow `mcp` falls back to `api` and the sign-in still works.
- REQ-002: The connection stores the scopes that GitLab granted. The UI shows the GitLab MCP switch only when the granted scopes hold `mcp`.
- REQ-003: The switch adds the GitLab MCP server of the connection host to the MCP servers of the project, with the Bearer token of the sign-in. The token is read from the secret store at launch and never written to a project file.
- REQ-004: The token refresh of the sign-in also serves the MCP server. An expired token is refreshed before the server starts.
- REQ-005: A connection with only `api` shows one "Sign in again" action next to the switch. After the new sign-in the switch is available.
- REQ-006: Test on the MCP server row says whether the GitLab MCP server answers and how many tools it gives, as for the other servers.
- REQ-007: The MCP server follows the read-only lock and the permission levels of the assistant, as the other MCP servers do.

[NEEDS CLARIFICATION: Which GitLab tiers and versions expose the MCP server, and at which address? See Q-131.]

## Non-Goals

- The GitLab Orbit knowledge graph server (`mcp_orbit`).
- GitLab Duo features (`ai_features`).
- MCP for GitHub. That is another change.

## Acceptance Criteria

- [ ] A new GitLab sign-in on gitlab.com asks for `api mcp`, and the connection shows the GitLab MCP switch.
- [ ] The switch on gives a working MCP server row; Test shows the tool count.
- [ ] No project file holds the token after the switch is on.
- [ ] An old sign-in with `api` only shows "Sign in again", and the switch shows after it.
- [ ] The read-only lock refuses the switch.

## Existing References

- Existing code/docs/specs: `crates/shipyard-app/src/device_login.rs`, `crates/shipyard-app/src/mcp_tools.rs`, `crates/shipyard-app/resources/oauth.env`
- Supersedes or extends: extends `docs/openspec/changes/add-connections/`

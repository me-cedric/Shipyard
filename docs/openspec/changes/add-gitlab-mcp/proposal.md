# add-gitlab-mcp

## Why

A person who signs in to GitLab with the browser must also get the GitLab tools in the assistant. Today the assistant cannot use the GitLab MCP server, and a second sign-in or a hand-made token is too hard for a person with little technical knowledge.

## What Changes

- The GitLab browser sign-in also asks for the `mcp` scope. The registered gitlab.com application already allows it.
- A GitLab connection that has the `mcp` scope offers the GitLab MCP server with one click, through the same sign-in.
- The assistant uses the GitLab tools of that server, with the same permission levels as other MCP servers.
- A person who signed in before this change signs in again once to get the scope. The app says so with one action.

## Impact

- Affected capability: `gitlab-mcp`
- Affected code/docs: `crates/shipyard-app/src/device_login.rs`, `crates/shipyard-app/src/mcp_tools.rs`, `src/features/settings/connections/`, `docs/guide/settings.md`

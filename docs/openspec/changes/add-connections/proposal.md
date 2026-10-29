# add-connections

## Why

Legacy is Jira-shaped: its repository issues depend on the Jira API, and credentials, MCP servers and assistants are set up on different pages.
Shipyard serves teams on Jira, GitHub, GitLab, Azure DevOps and Linear. It needs one place to connect each external system, with secrets kept out of the repository.

## What Changes

- Add Settings / Connections, the one place to add, test and remove a connection.
- Add tracker connections: Jira Cloud, Jira Data Center, GitHub Issues, GitLab Issues, Azure DevOps, Linear. Each one states its capability flags: hierarchy, transitions, labels, comments, time tracking, assignee.
- Add forge connections: GitHub, GitLab, Azure DevOps.
- Add MCP server connections: catalogue, custom servers, start, stop, dependency check.
- Add the proxy and the relay: the one Shipyard MCP endpoint serves the tools of each active MCP server, and a stdio server stays open between agent turns.
- Add agent runners and model providers: Claude Code, Codex, GitHub Copilot (ACP), Gemini CLI, OpenCode, and HTTP model providers.
- Add secrets in the OS keychain. A secret never goes in an argument, a URL, a log or a repository file.
- Add a connection test that names the missing scope or permission.

## Impact

- Affected capability: `connections`
- Consumes: nothing.
- Produces: `conn:` entities and the tracker, forge, runner and provider adapters that `sync`, `factory`, `questions-loop`, `delivery`, `code`, `work`, `assistant` and `projects` use.
- Legacy parity: MCP servers (catalogue, custom, start, stop, deps), the relay and the proxy of the Legacy MCP server, Identifiants, Tickets setup, the assistant CLI detection, the PR forge setup.
- Affected code/docs: `crates/shipyard-trackers`, `crates/shipyard-forges`, `crates/shipyard-agents`, `src/features/settings/connections/`.

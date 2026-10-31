# Plan: gitlab-mcp

Spec: [spec.md](./spec.md)
Date: 2026-10-31

## Summary

The device sign-in asks for one more scope. The connection stores the granted scopes. One switch adds the GitLab MCP server with the sign-in token. This covers REQ-001 to REQ-007.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. Reuse the device sign-in and the MCP tools of `shipyard-app`. |
| Data/storage | The connection stores the granted scopes on the machine. The token stays in the secret store. No project file holds it. |
| APIs/contracts | `crates/shipyard-app/resources/oauth.env` keeps the scopes `api mcp`. The GitLab MCP address waits for Q-131. |
| Risks | Some tiers and versions have no MCP server. Q-131 decides how the switch shows. A person with an old sign-in signs in again once. |

## Affected Surfaces

- Code: `crates/shipyard-app/src/device_login.rs`, `crates/shipyard-app/src/mcp_tools.rs`, `crates/shipyard-app/resources/oauth.env`, `src/features/settings/connections/`.
- Tests: `crates/shipyard-app/src/device_login.rs`, `crates/shipyard-app/src/mcp_tools.rs`, `src/features/settings/connections/*.test.tsx`, `e2e/connections.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-gitlab-mcp/`, `docs/delivery/questions/Q-131.md`, `docs/guide/settings.md`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Approach

1. Answer Q-131.
2. Write tests, then add the scopes, the fallback to `api` and the stored grant.
3. Write tests, then add the GitLab server entry with the Bearer token and the refresh.
4. Add the switch and the "Sign in again" action, in English and French.

## Validation

```bash
cargo test --workspace
pnpm test
pnpm playwright test e2e/connections.spec.ts
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-gitlab-mcp --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

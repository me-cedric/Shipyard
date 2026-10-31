# Tasks: GitLab MCP server through the browser sign-in

Spec: [spec.md](./spec.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [ ] T001 Answer Q-131 (tiers, versions, address of the GitLab MCP server).
- [ ] T002 Write tests in `crates/shipyard-app/src/device_login.rs` for the `api mcp` scopes, the fallback to `api` and the stored granted scopes. Covers REQ-001, REQ-002.
- [ ] T003 Implement the scopes and the stored grant in `crates/shipyard-app/src/device_login.rs`. Covers REQ-001, REQ-002.
- [ ] T004 Write tests in `crates/shipyard-app/src/mcp_tools.rs` for the GitLab server entry: Bearer token from the secret store, refresh before start, no token in a project file, read-only lock. Covers REQ-003, REQ-004, REQ-007.
- [ ] T005 Implement the GitLab server entry in `crates/shipyard-app/src/mcp_tools.rs`. Covers REQ-003, REQ-004, REQ-006, REQ-007.
- [ ] T006 Add the switch and the "Sign in again" action in `src/features/settings/connections/`, with typed mock handlers and tests. Covers REQ-002, REQ-005.
- [ ] T007 Update `docs/guide/settings.md` and add one EN and one FR changelog line.
- [ ] T008 Run `cargo test --workspace`, `pnpm test` and `e2e/connections.spec.ts`.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

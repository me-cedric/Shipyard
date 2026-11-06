# Plan: team-rights

Spec: [spec.md](./spec.md)
Date: 2026-11-06

## Summary

The core gets a pure rights module: the role table, the overrides, the narrowing and the identity match. The app finds the person, reads the team file of the default branch, and puts one right check in front of each write command and each MCP write tool, in the place of the read-only check. The check writes the audit log. The view reads the rights once per project and turns controls off. Home / Today gets the role panels, the shell gets the first tab of each role, the Inbox gets the routing, and Work / Team gets the guided setup, the join request and the migration proposal. This covers REQ-001 to REQ-017 and the modified requirements of `shell`, `projects` and `work`.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. The team file goes through `crates/shipyard-store/src/yaml.rs`. The default branch file comes from the git adapter (`git show origin/<default>:.shipyard/team.yaml`). |
| Data/storage | The roles and the rights stay in `.shipyard/team.yaml`. The audit log is `audit/<project key>.jsonl` in the app data folder (constitution 1.3), one JSON line per write, kept 90 days. The per-machine `page_modes` and `assignments` of the registry go after the migration. The personal role and `read_only` stay in the registry. |
| APIs/contracts | IPC: new `rightsGet` (member, how found, rights, warning), `teamJoin`, `teamMigrationProposal`, `teamMigrationApply`, `auditTail`. Each write command returns the error `missing right <right> (<role>)`. MCP: each write tool returns the same error (`docs/api/shipyard-mcp.yaml`). |
| Identity | The code host and issue tracker adapters already call the account endpoint to test a connection. The app keeps that login for the session. `git config user.email` is the fallback. |
| Risks | A person can edit the files with another tool: the branch protection of the code host is the wall (ADR 0019). An older Shipyard refuses a team file with the new fields (`deny_unknown_fields`) and keeps its last valid team: ship the reader before the writer. The e-mail match is not verified (Q-151). A fetch that is old gives old rights: the warning shows the date of the last fetch. |

## Affected Surfaces

- Code: `crates/shipyard-core/src/rights.rs` (new), `crates/shipyard-core/src/work.rs` (`Member`), `crates/shipyard-store/src/project.rs` (`Overrides`, `PROFILE_ROLES`), `crates/shipyard-store/src/prefs.rs` (roles), `crates/shipyard-app/src/rights.rs` (new: identity, check, audit), `crates/shipyard-app/src/work.rs` (`refuse_read_only` and its 43 calls), `crates/shipyard-app/src/factory.rs` (`approve`, `approve_plan`, `automation_save`, workflow saves), `crates/shipyard-app/src/outside.rs`, `crates/shipyard-mcp/src/outside.rs`, `src/lib/prefs/prefs.tsx`, `src/lib/rights/` (new hook), `src/features/shell/spaces.ts` (`ROLE_HOME`, `ROLE_TAB`), `src/features/home/`, `src/features/work/` (team), `src/features/settings/` (`ProfilesCard` goes), `src/lib/i18n/`.
- Tests: `crates/shipyard-core/tests/rights.rs` (table, overrides, narrowing, identity), app tests for each gated command (one refusal each), `crates/shipyard-mcp/src/outside.rs`, `src/features/shell/*.test.tsx`, `src/features/home/*.test.tsx`, `src/features/work/*.test.tsx`, `e2e/team.spec.ts`.
- Docs/specs: `docs/api/shipyard-mcp.yaml`, `docs/designs/screens.json` and the pictures of Home / Today and Work / Team, `docs/guide/` (EN, FR), `docs/plan/MASTER-PLAN.md` (sections 5.8 and 6), `docs/openspec/constitution.md` (rules 3.1, 3.2), `docs/delivery/test-plans/team-rights.feature`, `shell.feature`, `projects.feature`, `work.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Validation

```bash
cargo test -p shipyard-core -p shipyard-store -p shipyard-app -p shipyard-mcp
pnpm test src/features/shell src/features/home src/features/work src/features/settings src/lib/ipc
pnpm test:e2e e2e/team.spec.ts
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-team-rights --strict
```

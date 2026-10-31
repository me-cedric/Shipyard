# Plan: extensions

Spec: [spec.md](spec.md)
Date: 2026-10-29

## Summary

Two Settings views in `src/features/settings/extensions/`. Rust reads the compass files of the pinned submodule and runs `ac sync`. A catalog and plugin writer applies files with a no-overwrite rule. A child project deploy works in a local clone.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). |
| Compass source | The compass path that the active project pins, read only. Shipyard pins `docs/agent-compass` (ADR 0010). A project with no pin gets one Add compass action. |
| Apply | `shipyard-app` runs `node <compass path>/bin/ac.mjs sync` for the chosen entries. The system `ac` is not the compass tool on some machines. |
| Sync state | The compass lock `.agents/compass.lock.json` gives the state. `ac check --frozen` gives the drift. |
| Catalog | Component definitions as files in a catalog folder. A project-level record of deployed components and versions lives in `.shipyard/project.yaml`, written by `shipyard-store` codecs. |
| Plugin format | A manifest and a payload folder in a `.zip`. Parsed as data with a JSON Schema. No code runs. Paths are checked against the project root. |
| Plugin MCP servers | Handed to `connections`. A local command is refused. No secret in a plugin. |
| Roles and skills | `.shipyard/roles/<role>.md` (factory REQ-014) and `.agents/skills/`. The engine reads them at run start, the assistant at turn start. |
| Child projects | `shipyard-git` clones the child, creates a branch and commits. Publication follows Q-051. |
| Health | `shipyard-core` exposes the compass check as findings to `projects`. |
| Frontend | `src/features/settings/extensions/`. It imports only `ui`, `lib` and its own folder. |
| APIs/contracts | Tauri commands in an `extensions` module of `shipyard-app`. `tauri-specta` generates types and mocks. |
| Dependencies | No new dependency planned. W2 confirms which installed crate reads the `.zip`. |
| Risks | A plugin path may escape the project. Mitigation: reject any path outside the root and test it. An apply may overwrite a user file. Mitigation: one write function that refuses an existing file. |

## Affected Surfaces

- Code: `crates/shipyard-core`, `crates/shipyard-store`, `crates/shipyard-git`, `crates/shipyard-app`, `src/features/settings/extensions/`.
- Tests: `cargo test -p shipyard-core`, `cargo test -p shipyard-store`, `cargo test -p shipyard-git`, `cargo test -p shipyard-app`, `pnpm vitest run src/features/settings`, `e2e/extensions.spec.ts`.
- Docs/specs: this change, ADR 0010, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-050, Q-051, Q-052.

## Approach

1. Model entries, states and the no-overwrite write in `shipyard-core`.
2. Read the compass tree and the lock. Run `ac sync` for chosen entries in `shipyard-app`.
3. Add the catalog reader and the deploy writer with a preview step.
4. Add the plugin reader, the path check and the review model (item list with accept or decline).
5. Add the child project clone, branch and commit in `shipyard-git`.
6. Expose the compass check to `projects` Health and the fix action.
7. Build the two views with `ui` components. Add the roles and skills list.
8. Add the OpenSpec guidance as a catalog component for child projects.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-store
cargo test -p shipyard-git
cargo test -p shipyard-app
pnpm vitest run src/features/settings
pnpm playwright test e2e/extensions.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-extensions --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

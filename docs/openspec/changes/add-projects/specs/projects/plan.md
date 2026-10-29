# Plan: projects

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

Project file codecs and the registry live in `shipyard-store`. Git operations (clone, init, state) live in `shipyard-git`. Health rules are pure functions in `shipyard-core`. The UI is `src/features/projects/`. This covers REQ-001 to REQ-017.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). |
| Dependencies | No new dependency. Reuse `git2` through `shipyard-git`, `serde_yaml` and `rusqlite` or a JSON file for the registry. |
| Data/storage | `.shipyard/project.yaml` in the repository. The registry in the app data folder. |
| APIs/contracts | IPC commands `projects_list`, `projects_open`, `projects_clone`, `projects_create`, `projects_switch`, `health_run`, `health_fix`, `project_import`. Bindings are generated. |
| Credentials | Clone uses the connection credentials through `shipyard-git`, the one place for credentials. |
| Health rules | Pure functions in `shipyard-core` return findings with a fix id. `shipyard-store` and `shipyard-git` run the I/O. |
| Health inputs | Broken refs from `refs_check`. Compliance from the `extensions` compass check. |
| Ignore rules | `shipyard-git` writes an ignore file at creation only. A fix action can add rules on an existing repository after a click. |
| Import | A codec per Legacy file in `shipyard-store`. The import is read-only on the source and returns a report. |
| Risks | The Legacy file formats drift. Pin fixtures from the Legacy repository and read them only. Q-003 stays open. |

## Affected Surfaces

- Code: `crates/shipyard-core` (project types, health rules), `crates/shipyard-store` (project file, registry, import codecs), `crates/shipyard-git` (clone, init, state), `crates/shipyard-app` (commands), `crates/shipyard-cli` (`shipyard check`), `src/features/projects/`.
- Tests: `crates/*/tests`, `src/features/projects/*.test.tsx`, `e2e/projects.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-projects/`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-003, Q-014, Q-015.

## Approach

1. Define the project file type and its validation in `shipyard-core`.
2. Add the project file codec and the registry in `shipyard-store`.
3. Add clone, init and working copy state in `shipyard-git`. Write the OS ignore rules at creation only.
4. Add the health rules and the fix actions. Each fix returns a preview before it writes.
5. Add the Legacy import with a report and a conflict check.
6. Add the IPC commands.
7. Build first run, the switcher, Settings / Project, Settings / Health and the status bar dot. Add French and English keys.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-store
cargo test -p shipyard-git
pnpm vitest run src/features/projects
pnpm playwright test e2e/projects.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-projects --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

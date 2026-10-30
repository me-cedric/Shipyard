# Plan: projects

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

Project file codecs and the registry live in `shipyard-store`. Git operations (clone, init, state) live in `shipyard-git/src/project.rs` and run the `git` command. Health rules are pure functions in `shipyard-core`. The views are in `src/features/projects/`, the hooks in `src/lib/projects/`. This covers REQ-001 to REQ-017, except the project import (W9) and the credentials of a connection for a clone.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). |
| Dependencies | `serde_yaml` (new, in `shipyard-store`) and `tauri-plugin-dialog` (new, native folder picker). `project.rs` in `shipyard-git` runs the `git` command (clone, init, state), so a person's credential helpers apply. The registry is a JSON file. |
| Data/storage | `.shipyard/project.yaml` in the repository. `registry.json` and `prefs.json` in the app data folder. The registry holds the path, the last use, the last view and the overrides of each project. |
| APIs/contracts | IPC commands `projects_list`, `projects_active`, `projects_open`, `projects_clone`, `projects_create`, `projects_switch`, `projects_set_view`, `project_settings`, `project_file_save`, `project_overrides_save`, `health_run`, `health_fix`, `prefs_get`, `prefs_set`, `project_import` (stub). Each command is `async` and returns `Result<T, String>`. Bindings are generated. |
| Credentials | Not wired yet: a clone uses the git credential helpers of the machine. `connections` adds the token in `shipyard-git`, the one place for credentials. |
| Health rules | Pure functions in `shipyard-core` return findings with a fix id. `shipyard-store` and `shipyard-git` run the I/O. |
| Health inputs | Broken refs from `refs_check`. Compliance: the project file, the invalid values with their line, the OS ignore rules. Tool checks: `git`, `node` and the compass helper `docs/agent-compass/bin/ac.mjs check` when the working copy holds it. The group of generated files stays empty until a capability generates files. |
| Ignore rules | `shipyard-git` writes an ignore file at creation only. A fix action can add rules on an existing repository after a click. |
| Import | Stub: `project_import` returns a report with one skipped item. W9 adds a codec for each file of the existing layout in `shipyard-store`. The import stays read-only on the source. |
| Risks | The file formats of the existing layout drift. Pin fixtures from a sample repository and read them only. Q-003 stays open. |

## Affected Surfaces

- Code: `crates/shipyard-core` (project types, health rules), `crates/shipyard-store` (project file, registry, preferences), `crates/shipyard-git` (clone, init, state), `crates/shipyard-app/src/commands/` (commands), `src/lib/projects/`, `src/features/projects/`, `src/ui/molecules/` (ProjectSwitcher, FindingRow). `shipyard check` (`shipyard-cli`) waits for W5.
- Tests: `crates/*/tests`, `crates/shipyard-app/src/commands/*` (unit tests), `src/features/projects/projects.test.tsx`, `e2e/projects.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-projects/`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-003, Q-014, Q-015.

## Approach

1. Define the project file type and its validation in `shipyard-core`.
2. Add the project file codec and the registry in `shipyard-store`.
3. Add clone, init and working copy state in `shipyard-git`. Write the OS ignore rules at creation only.
4. Add the health rules and the fix actions. Each fix returns a preview before it writes.
5. Project import: stub until W9.
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

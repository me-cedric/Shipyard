# Plan: project-creator

Spec: [spec.md](./spec.md)
Date: 2026-11-06

## Summary

The core gets the `languages` field of the project file, the language text of an agent brief and the French pull request headings. The engine adds the language text to each brief and uses the pull request language. The store bundles the workflow `bootstrap`. The app adds a creator module that builds the files from the answers, shows them, creates the project, the remote and the push, and starts the bootstrap run. The view adds the creator in five steps, opened from Home / Projects and the first run. The starter issues use the existing `work_item_create`. This covers REQ-001 to REQ-014.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. The YAML goes through the shared writers (`write_project_file`, `write_team`, `yaml.rs`). |
| Data/storage | `.shipyard/project.yaml` gets `languages: {docs, pulls}` (`adr:0020`). `.shipyard/team.yaml`, `docs/brief.md`, `AGENTS.md`, `README.md` and `.gitignore` are new files of the new repository. No machine state. |
| APIs/contracts | IPC: `creatorOptions`, `creatorDraft`, `creatorPreview`, `creatorCreate(plan, click)`, `creatorBootstrap(click)`. The issues: existing `workItemCreate(row, click)` with the ref `est:starter#sN`. |
| Network | Existing calls only: `create_repo` of the code host (GitHub, GitLab), `git push` to `origin`, the issue create of the issue tracker. Each one follows the click on Create or Create issues (constitution 5.4). |
| Risks | An older Shipyard refuses a project file with `languages` (`deny_unknown_fields`). A run needs a code host: its last step opens a pull request (Q-156). The admin of the team file comes with `team-rights` (Q-154). |

## Affected Surfaces

- Code: `crates/shipyard-core/src/project.rs`, `crates/shipyard-core/src/delivery.rs`, `crates/shipyard-engine/src/run_engine.rs`, `crates/shipyard-engine/src/pull_request.rs`, `crates/shipyard-store/src/factory_files.rs`, `crates/shipyard-store/templates/factory/workflows/bootstrap.yaml`, `crates/shipyard-app/src/creator.rs`, `crates/shipyard-app/src/factory.rs`, `crates/shipyard-app/src/lib.rs`, `src/features/projects/new-project/`, `src/features/projects/first-run.tsx`, `src/features/projects/projects-page.tsx`, `src/features/projects/settings-project.tsx`, `src/lib/i18n/`.
- Tests: `crates/shipyard-app/src/creator.rs`, `crates/shipyard-core/src/project.rs`, `crates/shipyard-engine/tests/`, `crates/shipyard-store/tests/factory_files.rs`, `src/features/projects/new-project/*.test.tsx`, `src/lib/ipc/mock-creator.test.ts`, `e2e/new-project.spec.ts`.
- Docs/specs: `docs/guide/start.md`, `docs/guide/fr/start.md`, `docs/designs/screens.json`, `docs/assets/screenshots/new-project.png`, `docs/delivery/test-plans/project-creator.feature`, `docs/decisions/0020-project-languages.md`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Validation

```bash
cargo test -p shipyard-core -p shipyard-store -p shipyard-engine -p shipyard-app
pnpm ipc:gen
pnpm typecheck && npx biome check . && pnpm test src/features/projects src/lib/ipc
CI=1 npx playwright test e2e/new-project.spec.ts
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-project-creator --strict
```

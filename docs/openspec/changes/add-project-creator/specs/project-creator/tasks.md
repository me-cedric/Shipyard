# Tasks: project-creator

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 `languages` in the project file, the language text of a brief and the French pull request headings, in `crates/shipyard-core/src/project.rs` and `crates/shipyard-core/src/delivery.rs`, with tests. Covers REQ-004, REQ-005, REQ-006.
- [x] T002 The language text in each brief and the pull request language, in `crates/shipyard-engine/src/run_engine.rs`, `crates/shipyard-engine/src/pull_request.rs` and `crates/shipyard-app/src/factory.rs`, with tests. Covers REQ-005, REQ-006.
- [x] T003 The workflow `bootstrap` in `crates/shipyard-store/templates/factory/workflows/bootstrap.yaml` and `crates/shipyard-store/src/factory_files.rs`, with the test of the presets. Covers REQ-013.
- [x] T004 The creator module and its commands in `crates/shipyard-app/src/creator.rs` and `crates/shipyard-app/src/lib.rs`, with tests. Covers REQ-002, REQ-003, REQ-007 to REQ-011, REQ-013.
- [x] T005 `pnpm ipc:gen`, and the mocks in `src/lib/ipc/mock-creator.ts` and `src/lib/ipc/mock.ts`.
- [x] T006 The creator in `src/features/projects/new-project/`, its entries in `first-run.tsx` and `projects-page.tsx`, the languages in `settings-project.tsx`, EN and FR, with tests. Covers REQ-001 to REQ-004, REQ-007 to REQ-012, REQ-014.
- [x] T007 [P] E2E paths in `e2e/new-project.spec.ts`: local only, and a new repository with starter issues.
- [x] T008 [P] Guide pages, `docs/designs/screens.json` and its picture, the test plan, the changelog lines.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

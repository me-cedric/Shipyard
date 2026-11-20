# Tasks: runs-recipes

Spec: [spec.md](spec.md)
Plan: [plan.md](plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.
- Shared files (`src/lib/ipc/mock.ts`, `crates/shipyard-app/src/lib.rs`, `src/lib/i18n/*.ts`, `CHANGELOG.md`, `CHANGELOG.fr.md`, `docs/designs/screens.json`, `docs/assets/screenshots/`): one writer at a time. The four groups hand these edits to the merge task of the lead.

## Order Rules

- REQ-001 (Pause) changes the run states: update `docs/diagrams/run-state-machine.mmd` in the same task.
- REQ-005 (Limit) and REQ-006 (Warn at and Then) share `crates/shipyard-engine/src/budget.rs`: do REQ-006 first, then REQ-005.
- REQ-006 comes before `spec:shell-setup-rights#REQ-007` (group D reads Warn at).

## Tasks

- [ ] T001 Tests for REQ-001 (F02, Pause an agent): each scenario of the spec, beside `crates/shipyard-engine/src/run_engine.rs`, `crates/shipyard-app/src/factory.rs`. REQ-001.
- [ ] T002 Tests for REQ-002 (F03, Take it over): each scenario of the spec, beside `src/features/flow/feature/stop-card.tsx`, `src/lib/factory/index.ts`. REQ-002.
- [ ] T003 Tests for REQ-003 (F05, Attach a file in the agent chat): each scenario of the spec, beside `src/features/flow/feature/chat.tsx`, `crates/shipyard-app/src/factory.rs`. REQ-003.
- [ ] T004 Tests for REQ-004 (F07, Add a document to a new feature): each scenario of the spec, beside `src/features/flow/new-feature.tsx`, `crates/shipyard-app/src/specs.rs`. REQ-004.
- [ ] T005 Tests for REQ-005 (F08, Limit of a new feature): each scenario of the spec, beside `src/features/flow/new-feature.tsx`, `crates/shipyard-app/src/factory.rs`. REQ-005.
- [ ] T006 Tests for REQ-006 (F16, Warn at and Then of budgets): each scenario of the spec, beside `crates/shipyard-core/src/run.rs`, `crates/shipyard-engine/src/budget.rs`. REQ-006.
- [ ] T007 Tests for REQ-007 (F17, Stage limits of Automation): each scenario of the spec, beside `crates/shipyard-core/src/pickup.rs`, `crates/shipyard-engine/src/run_engine.rs`. REQ-007.
- [ ] T008 Tests for REQ-008 (F18, Role of a human step): each scenario of the spec, beside `crates/shipyard-core/src/workflow.rs`, `src/features/crew/recipes.tsx`. REQ-008.
- [ ] T009 Tests for REQ-009 (F19, Rows of a recipe step): each scenario of the spec, beside `src/features/crew/recipe-file.tsx`, `crates/shipyard-core/src/workflow.rs`. REQ-009.
- [ ] T010 Build REQ-001 (F02, Pause an agent): `crates/shipyard-engine/src/run_engine.rs`, `crates/shipyard-app/src/factory.rs`, `src/features/flow/feature/agent-card.tsx`, `src/features/flow/feature/stop-card.tsx`, `src/lib/factory/index.ts`, `src/lib/ipc/mock-factory.ts`, `docs/diagrams/run-state-machine.mmd`. REQ-001.
- [ ] T011 Build REQ-002 (F03, Take it over): `src/features/flow/feature/stop-card.tsx`, `src/lib/factory/index.ts`, `src/lib/ipc/mock-factory.ts`. REQ-002.
- [ ] T012 Build REQ-003 (F05, Attach a file in the agent chat): `src/features/flow/feature/chat.tsx`, `crates/shipyard-app/src/factory.rs`, `src/lib/ipc/mock-factory.ts`. REQ-003.
- [ ] T013 Build REQ-004 (F07, Add a document to a new feature): `src/features/flow/new-feature.tsx`, `crates/shipyard-app/src/specs.rs`, `src/lib/ipc/mock-specs.ts`. REQ-004.
- [ ] T014 Build REQ-005 (F08, Limit of a new feature): `src/features/flow/new-feature.tsx`, `crates/shipyard-app/src/factory.rs`, `crates/shipyard-engine/src/budget.rs`, `src/lib/ipc/mock-factory.ts`. REQ-005.
- [ ] T015 Build REQ-006 (F16, Warn at and Then of budgets): `crates/shipyard-core/src/run.rs`, `crates/shipyard-engine/src/budget.rs`, `crates/shipyard-app/src/factory.rs`, `src/features/crew/spend.tsx`, `src/features/crew/budgets.tsx`, `src/features/crew/spend-const.ts`, `src/lib/ipc/mock-factory.ts`. REQ-006.
- [ ] T016 Build REQ-007 (F17, Stage limits of Automation): `crates/shipyard-core/src/pickup.rs`, `crates/shipyard-engine/src/run_engine.rs`, `src/features/sync/automation.tsx`, `src/features/sync/automation-draft.ts`, `src/lib/ipc/mock-sync.ts`. REQ-007.
- [ ] T017 Build REQ-008 (F18, Role of a human step): `crates/shipyard-core/src/workflow.rs`, `src/features/crew/recipes.tsx`, `src/features/crew/recipe-file.tsx`, `src/lib/ipc/mock-factory.ts`. REQ-008.
- [ ] T018 Build REQ-009 (F19, Rows of a recipe step): `src/features/crew/recipe-file.tsx`, `crates/shipyard-core/src/workflow.rs`, `src/lib/ipc/mock-factory.ts`. REQ-009.
- [ ] T019 Shared files: add the commands to the map of `src/lib/ipc/mock.ts` and to `crates/shipyard-app/src/lib.rs`, run `pnpm ipc:gen`, add the strings in English, French, German and Spanish to `src/lib/i18n/`.
- [ ] T020 Docs: `docs/diagrams/run-state-machine.mmd` (Pause), `docs/openspec/specs/factory/` after archive; the scenarios in `docs/delivery/test-plans/runs-recipes.feature`; the pictures in `docs/assets/screenshots/` and `docs/designs/screens.json` for each changed screen; one bullet each in `CHANGELOG.md` and `CHANGELOG.fr.md`; the page of the guide in four languages.
- [ ] T021 Run the commands of the Validation block of `plan.md`.
- [ ] T022 Compare the build with the spec and fix stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

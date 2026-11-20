# Tasks: shell-setup-rights

Spec: [spec.md](spec.md)
Plan: [plan.md](plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.
- Shared files (`src/lib/ipc/mock.ts`, `crates/shipyard-app/src/lib.rs`, `src/lib/i18n/*.ts`, `CHANGELOG.md`, `CHANGELOG.fr.md`, `docs/designs/screens.json`, `docs/assets/screenshots/`): one writer at a time. The four groups hand these edits to the merge task of the lead.

## Order Rules

- REQ-007 (Budget notice) starts after `spec:runs-recipes#REQ-006` is built and merged.
- REQ-006 (Model for each agent role): put the command in the new file `crates/shipyard-app/src/role_model.rs`. Do not edit `crates/shipyard-app/src/factory.rs`: group A owns it. Register the command in `crates/shipyard-app/src/lib.rs` in the shared-files task.

## Tasks

- [ ] T001 Tests for REQ-001 (F01, Sign out): each scenario of the spec, beside `src/features/shell/account-menu.tsx`, `src/features/settings/me.tsx`. REQ-001.
- [ ] T002 Tests for REQ-002 (F20, Take control and live output of a session): each scenario of the spec, beside `src/features/crew/sessions.tsx`, `src/features/crew/sessions-side.tsx`. REQ-002.
- [ ] T003 Tests for REQ-003 (F21, Processor, Memory and tool calls): each scenario of the spec, beside `src/features/crew/spend-how.tsx`, `crates/shipyard-app/src/machine.rs`. REQ-003.
- [ ] T004 Tests for REQ-004 (F22, Plan right and the levels of Rights): each scenario of the spec, beside `crates/shipyard-core/src/rights.rs`, `crates/shipyard-app/src/rights.rs`. REQ-004.
- [ ] T005 [P] Tests for REQ-005 (F25, Fill from my work): each scenario of the spec, beside `src/features/plan/time.tsx`, `crates/shipyard-app/src/work.rs`. REQ-005.
- [ ] T006 Tests for REQ-006 (F40, A model for each agent role): each scenario of the spec, beside `src/features/settings/agents-rules.tsx`, `crates/shipyard-app/src/role_model.rs`. REQ-006.
- [ ] T007 Tests for REQ-007 (F41, Budget notice, Sound and Release channel): each scenario of the spec, beside `src/features/settings/me.tsx`, `crates/shipyard-app/src/shell/`. REQ-007.
- [ ] T008 [P] Tests for REQ-008 (F42, Data folder and Portable mode): each scenario of the spec, beside `crates/shipyard-app/src/window.rs`, `src/features/settings/look-rows.tsx`. REQ-008.
- [ ] T009 [P] Tests for REQ-009 (F43, Attach a file to feedback): each scenario of the spec, beside `src/features/projects/health-feedback.tsx`. REQ-009.
- [ ] T010 Tests for REQ-010 (F44, The permissions moment): each scenario of the spec, beside `src/features/onboarding/permissions.tsx`, `crates/shipyard-app/src/permissions.rs`. REQ-010.
- [ ] T011 Tests for REQ-011 (F45, Places hidden for each role): each scenario of the spec, beside `crates/shipyard-core/src/rights.rs`, `src/features/crew/rights.tsx`. REQ-011.
- [ ] T012 [P] Tests for REQ-012 (F46, Ask before a project closes): each scenario of the spec, beside `src/lib/projects/index.ts`, `src/features/shell/close-guard.tsx`. REQ-012.
- [ ] T013 Build REQ-001 (F01, Sign out): `src/features/shell/account-menu.tsx`, `src/features/settings/me.tsx`, `crates/shipyard-app/src/connections.rs`, `crates/shipyard-secrets/`, `src/lib/ipc/mock-setup.ts`. REQ-001.
- [ ] T014 Build REQ-002 (F20, Take control and live output of a session): `src/features/crew/sessions.tsx`, `src/features/crew/sessions-side.tsx`, `crates/shipyard-app/src/machine.rs`, `src/lib/ipc/mock-machine.ts`. REQ-002.
- [ ] T015 Build REQ-003 (F21, Processor, Memory and tool calls): `src/features/crew/spend-how.tsx`, `crates/shipyard-app/src/machine.rs`, `src/lib/ipc/mock-machine.ts`. REQ-003.
- [ ] T016 Build REQ-004 (F22, Plan right and the levels of Rights): `crates/shipyard-core/src/rights.rs`, `crates/shipyard-app/src/rights.rs`, `src/features/crew/rights.tsx`, `src/lib/rights/`, `src/lib/ipc/mock.ts`. REQ-004.
- [ ] T017 [P] Build REQ-005 (F25, Fill from my work): `src/features/plan/time.tsx`, `crates/shipyard-app/src/work.rs`, `src/lib/ipc/mock-work.ts`. REQ-005.
- [ ] T018 Build REQ-006 (F40, A model for each agent role): `src/features/settings/agents-rules.tsx`, `crates/shipyard-app/src/role_model.rs`, `crates/shipyard-app/src/lib.rs`, `src/lib/ipc/mock-setup.ts`. REQ-006.
- [ ] T019 Build REQ-007 (F41, Budget notice, Sound and Release channel): `src/features/settings/me.tsx`, `crates/shipyard-app/src/shell/`, `src/lib/updates/index.ts`, `src/lib/ipc/mock.ts`. REQ-007.
- [ ] T020 [P] Build REQ-008 (F42, Data folder and Portable mode): `crates/shipyard-app/src/window.rs`, `src/features/settings/look-rows.tsx`, `src/lib/ipc/mock-extras.ts`. REQ-008.
- [ ] T021 [P] Build REQ-009 (F43, Attach a file to feedback): `src/features/projects/health-feedback.tsx`. REQ-009.
- [ ] T022 Build REQ-010 (F44, The permissions moment): `src/features/onboarding/permissions.tsx`, `crates/shipyard-app/src/permissions.rs`, `src/lib/ipc/mock.ts`. REQ-010.
- [ ] T023 Build REQ-011 (F45, Places hidden for each role): `crates/shipyard-core/src/rights.rs`, `src/features/crew/rights.tsx`, `src/lib/ipc/mock.ts`. REQ-011.
- [ ] T024 [P] Build REQ-012 (F46, Ask before a project closes): `src/lib/projects/index.ts`, `src/features/shell/close-guard.tsx`. REQ-012.
- [ ] T025 Shared files: add the commands to the map of `src/lib/ipc/mock.ts` and to `crates/shipyard-app/src/lib.rs`, run `pnpm ipc:gen`, add the strings in English, French, German and Spanish to `src/lib/i18n/`.
- [ ] T026 Docs: `docs/designs/screens.json` and the pictures for Rights, Sessions, Look and layout and the permissions card; `docs/api/shipyard-mcp.yaml` only if a tool changes; the scenarios in `docs/delivery/test-plans/shell-setup-rights.feature`; the pictures in `docs/assets/screenshots/` and `docs/designs/screens.json` for each changed screen; one bullet each in `CHANGELOG.md` and `CHANGELOG.fr.md`; the page of the guide in four languages.
- [ ] T027 Run the commands of the Validation block of `plan.md`.
- [ ] T028 Compare the build with the spec and fix stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

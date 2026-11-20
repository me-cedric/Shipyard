# Tasks: code-host-tickets

Spec: [spec.md](spec.md)
Plan: [plan.md](plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.
- Shared files (`src/lib/ipc/mock.ts`, `crates/shipyard-app/src/lib.rs`, `src/lib/i18n/*.ts`, `CHANGELOG.md`, `CHANGELOG.fr.md`, `docs/designs/screens.json`, `docs/assets/screenshots/`): one writer at a time. The four groups hand these edits to the merge task of the lead.

## Order Rules

- REQ-004 (Releases) comes before REQ-011 (Calendar) and before `spec:library-functions#REQ-009` (Release picker).
- REQ-001 and REQ-006 add calls to each code host: update `docs/flows/network-flows.json` and `docs/flows/bricks.json` in the same task.

## Tasks

- [ ] T001 Tests for REQ-001 (F04, Run again on the code host): each scenario of the spec, beside `crates/shipyard-forges/src/`, `crates/shipyard-app/src/code.rs`. REQ-001.
- [ ] T002 [P] Tests for REQ-002 (F06, Keep beside Undo): each scenario of the spec, beside `src/features/assistant/messages.tsx`, `src/features/assistant/use-assistant.ts`. REQ-002.
- [ ] T003 Tests for REQ-003 (F09, Recipe row of a ticket): each scenario of the spec, beside `src/features/work/ticket-detail.tsx`, `src/lib/ipc/mock-work.ts`. REQ-003.
- [ ] T004 Tests for REQ-004 (F10, Releases): each scenario of the spec, beside `crates/shipyard-core/src/work.rs`, `crates/shipyard-app/src/work/`. REQ-004.
- [ ] T005 Tests for REQ-005 (F11, Add a kind of ticket): each scenario of the spec, beside `crates/shipyard-app/src/commands/delivery_docs.rs`, `crates/shipyard-core/src/work_item.rs`. REQ-005.
- [ ] T006 Tests for REQ-006 (F12, Reviewers and Merge with): each scenario of the spec, beside `crates/shipyard-forges/src/`, `crates/shipyard-app/src/code.rs`. REQ-006.
- [ ] T007 Tests for REQ-007 (F13, Close and Mark as ready of a new pull request): each scenario of the spec, beside `src/features/code/open-pull.tsx`. REQ-007.
- [ ] T008 Tests for REQ-008 (F14, Author on pull request rows): each scenario of the spec, beside `crates/shipyard-app/src/delivery.rs`, `src/features/code/pull-requests.tsx`. REQ-008.
- [ ] T009 Tests for REQ-009 (F15, Action plan of the impact report): each scenario of the spec, beside `src/features/code/impact-report.tsx`, `crates/shipyard-app/src/code.rs`. REQ-009.
- [ ] T010 Tests for REQ-010 (F23, Accept and Refuse a join request): each scenario of the spec, beside `crates/shipyard-app/src/work/join.rs`, `src/features/work/team-rights.tsx`. REQ-010.
- [ ] T011 [P] Tests for REQ-011 (F24, Release and Go to Today of the calendar): each scenario of the spec, beside `src/features/plan/dates-page.tsx`. REQ-011.
- [ ] T012 Build REQ-001 (F04, Run again on the code host): `crates/shipyard-forges/src/`, `crates/shipyard-app/src/code.rs`, `src/features/flow/feature/checks.tsx`, `src/lib/ipc/mock-code-prs.ts`, `docs/flows/network-flows.json`, `docs/flows/bricks.json`. REQ-001.
- [ ] T013 [P] Build REQ-002 (F06, Keep beside Undo): `src/features/assistant/messages.tsx`, `src/features/assistant/use-assistant.ts`, `crates/shipyard-app/src/assistant.rs`, `src/lib/ipc/mock-assistant.ts`. REQ-002.
- [ ] T014 Build REQ-003 (F09, Recipe row of a ticket): `src/features/work/ticket-detail.tsx`, `src/lib/ipc/mock-work.ts`. REQ-003.
- [ ] T015 Build REQ-004 (F10, Releases): `crates/shipyard-core/src/work.rs`, `crates/shipyard-app/src/work/`, `crates/shipyard-forges/src/`, `src/features/work/ticket-detail.tsx`, `src/lib/ipc/mock-work.ts`, `docs/flows/network-flows.json`, `docs/flows/bricks.json`, `docs/data-models/`. REQ-004.
- [ ] T016 Build REQ-005 (F11, Add a kind of ticket): `crates/shipyard-app/src/commands/delivery_docs.rs`, `crates/shipyard-core/src/work_item.rs`, `src/features/projects/tickets-config.tsx`, `src/lib/ipc/mock-work.ts`. REQ-005.
- [ ] T017 Build REQ-006 (F12, Reviewers and Merge with): `crates/shipyard-forges/src/`, `crates/shipyard-app/src/code.rs`, `src/features/code/open-pull.tsx`, `src/lib/ipc/mock-code-prs.ts`, `docs/flows/network-flows.json`, `docs/flows/bricks.json`. REQ-006.
- [ ] T018 Build REQ-007 (F13, Close and Mark as ready of a new pull request): `src/features/code/open-pull.tsx`. REQ-007.
- [ ] T019 Build REQ-008 (F14, Author on pull request rows): `crates/shipyard-app/src/delivery.rs`, `src/features/code/pull-requests.tsx`, `src/features/code/pulls-page.tsx`, `src/lib/ipc/mock-code-prs.ts`. REQ-008.
- [ ] T020 Build REQ-009 (F15, Action plan of the impact report): `src/features/code/impact-report.tsx`, `crates/shipyard-app/src/code.rs`, `src/lib/ipc/mock-code.ts`. REQ-009.
- [ ] T021 Build REQ-010 (F23, Accept and Refuse a join request): `crates/shipyard-app/src/work/join.rs`, `src/features/work/team-rights.tsx`, `src/features/crew/team-page.tsx`, `src/lib/ipc/mock-work.ts`. REQ-010.
- [ ] T022 [P] Build REQ-011 (F24, Release and Go to Today of the calendar): `src/features/plan/dates-page.tsx`. REQ-011.
- [ ] T023 Shared files: add the commands to the map of `src/lib/ipc/mock.ts` and to `crates/shipyard-app/src/lib.rs`, run `pnpm ipc:gen`, add the strings in English, French, German and Spanish to `src/lib/i18n/`.
- [ ] T024 Docs: `docs/flows/network-flows.json` and `docs/flows/bricks.json` (re-run, reviewers, releases), `docs/data-models/*.dbml` (release in the mirror), `docs/models/architecture.c4` if a crate dependency changes; the scenarios in `docs/delivery/test-plans/code-host-tickets.feature`; the pictures in `docs/assets/screenshots/` and `docs/designs/screens.json` for each changed screen; one bullet each in `CHANGELOG.md` and `CHANGELOG.fr.md`; the page of the guide in four languages.
- [ ] T025 Run the commands of the Validation block of `plan.md`.
- [ ] T026 Compare the build with the spec and fix stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

# Tasks: library-functions

Spec: [spec.md](spec.md)
Plan: [plan.md](plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.
- Shared files (`src/lib/ipc/mock.ts`, `crates/shipyard-app/src/lib.rs`, `src/lib/i18n/*.ts`, `CHANGELOG.md`, `CHANGELOG.fr.md`, `docs/designs/screens.json`, `docs/assets/screenshots/`): one writer at a time. The four groups hand these edits to the merge task of the lead.

## Order Rules

- REQ-009 (Release picker) starts after `spec:code-host-tickets#REQ-004` is built and merged.

## Tasks

- [x] T001 [P] Tests for REQ-001 (F26, Opened last keeps items): each scenario of the spec, beside `src/features/library/recent.ts`, `src/features/library/library-home.tsx`. REQ-001.
- [x] T002 Tests for REQ-002 (F27, Earlier versions and History): each scenario of the spec, beside `crates/shipyard-git/`, `crates/shipyard-app/src/page_history.rs`. REQ-002.
- [x] T003 Tests for REQ-003 (F28, Add a file to Documents): each scenario of the spec, beside `src/features/knowledge/documents.tsx`, `crates/shipyard-app/src/documents.rs`. REQ-003.
- [x] T004 Tests for REQ-004 (F29, Slides of a Markdown deck): each scenario of the spec, beside `src/features/knowledge/slides.tsx`, `src/features/knowledge/work-slides.ts`. REQ-004.
- [ ] T005 Tests for REQ-005 (F30, Learn: Experts, Add a word and the second pill): each scenario of the spec, beside `src/features/knowledge/learn.tsx`, `src/features/knowledge/learn-paths.tsx`. REQ-005.
- [ ] T006 Tests for REQ-006 (F31, PDF and Markdown output of reports): each scenario of the spec, beside `crates/shipyard-app/src/reports.rs`, `crates/shipyard-app/src/decks.rs`. REQ-006.
- [ ] T007 Tests for REQ-007 (F32, Reports page cards and the dossier form): each scenario of the spec, beside `src/features/reports/reports-page.tsx`, `src/features/reports/forms.tsx`. REQ-007.
- [ ] T008 Tests for REQ-008 (F34, Chart kinds of dashboard tiles): each scenario of the spec, beside `src/features/knowledge/dashboards.tsx`, `crates/shipyard-core/src/tile.rs`. REQ-008.
- [ ] T009 Tests for REQ-009 (F35, Pin a dashboard to Today): each scenario of the spec, beside `src/features/knowledge/dashboards.tsx`, `src/features/home/role-panels.tsx`. REQ-009.
- [ ] T010 Tests for REQ-010 (F36, Release picker of Dashboards): each scenario of the spec, beside `src/features/knowledge/dashboards.tsx`. REQ-010.
- [ ] T011 [P] Tests for REQ-011 (F37, Check against the code of the flow matrix): each scenario of the spec, beside `src/features/design/flows.tsx`, `crates/shipyard-core/src/flows.rs`. REQ-011.
- [ ] T012 Tests for REQ-012 (F38, Stale chip on the map of the code): each scenario of the spec, beside `src/features/knowledge/graph.tsx`, `crates/shipyard-app/src/knowledge.rs`. REQ-012.
- [ ] T013 [P] Tests for REQ-013 (F39, Link from an endpoint to its feature): each scenario of the spec, beside `src/features/design/api.tsx`. REQ-013.
- [x] T014 [P] Build REQ-001 (F26, Opened last keeps items): `src/features/library/recent.ts`, `src/features/library/library-home.tsx`. REQ-001.
- [x] T015 Build REQ-002 (F27, Earlier versions and History): `crates/shipyard-git/`, `crates/shipyard-app/src/page_history.rs`, `src/features/knowledge/pages.tsx`, `src/features/specs/`, `src/lib/ipc/mock-knowledge.ts`. REQ-002.
- [x] T016 Build REQ-003 (F28, Add a file to Documents): `src/features/knowledge/documents.tsx`, `crates/shipyard-app/src/documents.rs`, `src/lib/ipc/mock-knowledge.ts`. REQ-003.
- [x] T017 Build REQ-004 (F29, Slides of a Markdown deck): `src/features/knowledge/slides.tsx`, `src/features/knowledge/work-slides.ts`, `crates/shipyard-app/src/decks.rs`, `src/lib/ipc/mock-knowledge.ts`. REQ-004.
- [ ] T018 Build REQ-005 (F30, Learn: Experts, Add a word and the second pill): `src/features/knowledge/learn.tsx`, `src/features/knowledge/learn-paths.tsx`, `crates/shipyard-app/src/knowledge.rs`, `crates/shipyard-app/src/learning.rs`, `src/lib/ipc/mock-learning.ts`. REQ-005.
- [ ] T019 Build REQ-006 (F31, PDF and Markdown output of reports): `crates/shipyard-app/src/reports.rs`, `crates/shipyard-app/src/decks.rs`, `src/features/reports/reports-page.tsx`, `src/features/reports/forms.tsx`, `src/features/reports/export-menu.tsx`, `src/lib/ipc/mock-reports.ts`. REQ-006.
- [ ] T020 Build REQ-007 (F32, Reports page cards and the dossier form): `src/features/reports/reports-page.tsx`, `src/features/reports/forms.tsx`, `crates/shipyard-app/src/reports.rs`, `src/lib/ipc/mock-reports.ts`. REQ-007.
- [ ] T021 Build REQ-008 (F34, Chart kinds of dashboard tiles): `src/features/knowledge/dashboards.tsx`, `crates/shipyard-core/src/tile.rs`, `crates/shipyard-app/src/knowledge.rs`, `src/lib/ipc/mock-knowledge.ts`. REQ-008.
- [ ] T022 Build REQ-009 (F35, Pin a dashboard to Today): `src/features/knowledge/dashboards.tsx`, `src/features/home/role-panels.tsx`, `src/lib/knowledge/`. REQ-009.
- [ ] T023 Build REQ-010 (F36, Release picker of Dashboards): `src/features/knowledge/dashboards.tsx`. REQ-010.
- [ ] T024 [P] Build REQ-011 (F37, Check against the code of the flow matrix): `src/features/design/flows.tsx`, `crates/shipyard-core/src/flows.rs`, `crates/shipyard-app/src/design.rs`, `src/lib/ipc/mock-design.ts`. REQ-011.
- [ ] T025 Build REQ-012 (F38, Stale chip on the map of the code): `src/features/knowledge/graph.tsx`, `crates/shipyard-app/src/knowledge.rs`, `src/lib/ipc/mock-knowledge.ts`. REQ-012.
- [ ] T026 [P] Build REQ-013 (F39, Link from an endpoint to its feature): `src/features/design/api.tsx`. REQ-013.
- [ ] T027 Shared files: add the commands to the map of `src/lib/ipc/mock.ts` and to `crates/shipyard-app/src/lib.rs`, run `pnpm ipc:gen`, add the strings in English, French, German and Spanish to `src/lib/i18n/`.
- [ ] T028 Docs: `docs/flows/network-flows.json` is NOT changed (no new call); `docs/designs/screens.json` and the pictures for Slides, Learn, Reports, Dashboards and the flow matrix; the scenarios in `docs/delivery/test-plans/library-functions.feature`; the pictures in `docs/assets/screenshots/` and `docs/designs/screens.json` for each changed screen; one bullet each in `CHANGELOG.md` and `CHANGELOG.fr.md`; the page of the guide in four languages.
- [ ] T029 Run the commands of the Validation block of `plan.md`.
- [ ] T030 Compare the build with the spec and fix stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

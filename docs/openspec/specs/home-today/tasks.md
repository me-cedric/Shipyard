# Tasks: home-today

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write tests in `src/features/home/today.test.tsx` for the sections, their hiding, the grouping, my runs only, the events since the last visit and the empty state. Covers REQ-002 to REQ-006.
- [x] T002 Build `src/features/home/today.tsx` from the Inbox list, the ticket rows and the run and event rows; store the last visit in the prefs. Covers REQ-002 to REQ-006, REQ-009.
- [x] T003 Change the Home tabs to Today and Projects in `src/features/shell/spaces.ts` and `src/app/tab-view.tsx`, and redirect the old addresses in `src/app/router.tsx`. Covers REQ-001, REQ-008.
- [x] T004 Move the pinned tiles to the top of Knowledge / Dashboards (`src/features/knowledge/pinned.tsx`, `dashboards.tsx`) with a test. Covers REQ-007.
- [x] T005 Update the tests, e2e and personas that open the old tabs. Covers REQ-001, REQ-008.
- [x] T006 [P] English and French texts in `src/lib/i18n/`. Covers REQ-009.
- [x] T007 Update `docs/guide/home.md` (EN, FR), `docs/designs/screens.json` and the Home screenshots, and one EN and one FR changelog line.
- [x] T008 Run the validation commands of `plan.md`. Run 2026-11-05: full suite passed (Vitest, Playwright, openspec strict).

## Completion Check

- [x] All acceptance criteria are met.
- [x] Required validation passed or failures are marked pre-existing.
- [x] Specs, docs, and code agree.

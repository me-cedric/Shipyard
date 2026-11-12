# Tasks: ux-declutter

Spec: [spec.md](spec.md)
Plan: [plan.md](plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.
- A wave ends with: Opus review, fixer, lead checks, one local commit, one line in `.agents/progress/ux-declutter.md`.

## Tasks

Wave 1, first run

- [x] T001 [P] (A) Inventory test: each palette action and each route of today exists (`src/features/shell/inventory.test.tsx`, a fixed list). REQ-016.
- [x] T002 (A) One checklist module with one rule per item; one card on Today and in Settings / Me; remove the second card. REQ-001, REQ-002, REQ-003.
- [x] T003 (A) Tour opens once after the first project; each exit marks it seen; Continue on the role step; permissions loading; install confirmation. REQ-004, REQ-005, REQ-007.
- [x] T004 (A) Update `changes/add-onboarding-tour` REQ-001, REQ-005, REQ-013 and `onboarding.feature`.
- [x] T005 [P] (B) One no-project page for every space, with the three ways to open. REQ-006.
- [x] T006 [P] (B) Empty pages name the missing step: Runs with no AI tool, Backlog with no issue tracker. REQ-007.
- [x] T007 [P] (B) Glossary molecule and its eight terms in four languages; used in the empty pages. The lead wires it into the checklist and the tour after A. REQ-008, REQ-026.

Wave 2, top bar

- [x] T008 (A) Activity button and panel; remove the three counters. REQ-009.
- [x] T009 (A) Avatar menu; remove "?" and theme buttons; Ask split button. REQ-010, REQ-011.
- [x] T010 (A) Ahead and behind on Sync; changed files beside Commit; remove the chip; count test at 1100 px. REQ-012, REQ-013.
- [x] T011 [P] (B) Twin tabs leave the tab bars; addresses keep working; tab icons. REQ-014, REQ-021.
- [x] T012 [P] (B) Remove the Home tiles; numbers in panel headings. REQ-015.

Wave 3, patterns

- [x] T013 (A) Visible page header on every tab; shared loading and empty patterns where a page shows nothing or bare text. REQ-017, REQ-018.
- [x] T014 (A) Section list on every Settings page; sliding pill on inner tab rows. REQ-019, REQ-022.
- [x] T015 [P] (B) Shared data table for the team rights tables, the Work / Team members table and learning paths. REQ-020.

Wave 4, motion

- [x] T016 (A) One motion source; the six places follow it. REQ-023.
- [x] T017 [P] (B) Toast in and out; removed rows; springs on sidebar and inspector; no local timing. REQ-024, REQ-025.

Wave 5, close

- [ ] T018 Docs: `screens.json`, screenshots, guide in four languages, `ux-declutter.feature`, both changelogs.
- [ ] T019 Final Opus review of `main...HEAD`, one fixer.
- [ ] T020 Run the validation commands of `plan.md`.
- [ ] T021 Compare the build with the spec; tick the acceptance criteria.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

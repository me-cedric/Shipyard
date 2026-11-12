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

- [x] T018 Docs: `screens.json`, screenshots, guide in four languages, `ux-declutter.feature`, both changelogs.
- [x] T019 Final Opus review of `main...HEAD`, one fixer.
- [x] T020 Run the validation commands of `plan.md`.
- [x] T021 Compare the build with the spec; tick the acceptance criteria.

Second pass, defects

- [x] T022 Diagram frame fits and pans; screen preview placement; a tool that ends names itself. REQ-039, REQ-040.

Wave 7, the run page

- [x] T023 (A) A run has an address; each run link opens it; Start again opens the new run; Activity and Today rows are links. REQ-027, REQ-028.
- [x] T024 [P] (B) Run summary, one action per state, needs-you block, three tabs, plain text, the word Stop. REQ-029 to REQ-033.

Wave 8, the Runs list and the other Factory pages

- [x] T025 (A) Runs bar with search, filter and Board and History; five lanes that fit; History; the run card. REQ-034 to REQ-037.
- [x] T026 [P] (B) Sessions, Usage, Agents map and Workflows. REQ-038.

Wave 9, close

- [x] T027 Docs: `screens.json`, screenshots, guide in four languages, `ux-declutter.feature`, `factory.feature`, both changelogs; a MODIFIED delta for each settled `factory` requirement that changes.
- [x] T028 Opus review of the second pass, one fixer, the validation commands of `plan.md`.

Third pass, the pull request page

- [ ] T029 (wave 10) Page and list: own address, header, tabs, merge box, Overview with Markdown description and sidebar, list with search and filter. REQ-041 to REQ-044.
- [ ] T030 (wave 10) Files changed: shared `FileDiffList` (collapsed, counts, Expand all, viewed), file tree and filter, line numbers in `DiffView`, files beyond 100. REQ-045, REQ-046, REQ-051.
- [ ] T031 (wave 11) General comments read and post, thread reply and resolve: forge methods, IPC commands, mocks, the conversation. REQ-047, REQ-048, REQ-052.
- [ ] T032 (wave 12) Inline comments: gutter action, pending review kept on this computer, Submit review with a verdict, single comment, forge refusals. REQ-049, REQ-050, REQ-051.
- [ ] T033 (wave 13) Docs, test plans, screens, guide, changelogs, final Opus review and fixer, the validation commands of `plan.md`.

## Completion Check

- [x] All acceptance criteria are met.
- [x] Required validation passed or failures are marked pre-existing.
- [x] Specs, docs, and code agree.

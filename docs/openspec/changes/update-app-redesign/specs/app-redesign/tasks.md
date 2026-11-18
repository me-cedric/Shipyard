# Tasks: app-redesign

Spec: [spec.md](spec.md)
Plan: [plan.md](plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.
- One session per wave. A wave ends with: the removal of the old pages that the wave replaced, the inventory test, an audit of the wave's functions against the map of `plan.md`, a review in a fresh context, the docs of the wave, one line in `.agents/progress/app-redesign.md`.

## Tasks

Wave 0, decisions

- [x] T001 Owner decision on `adr:0023`: accepted on 2026-11-16. `adr:0004` is superseded. The constitution keeps its text: the six areas stay the loop.
- [x] T002 The owner's answers: no open question is left: `q:Q-168`, `q:Q-169`, `q:Q-170` and `q:Q-171` are folded.
- [x] T003 Keep the design source: the pictures are in `docs/assets/screenshots/redesign/`, the sources and the index in `docs/designs/redesign/`.

Wave 1, foundation

- [x] T004 [P] Extend the inventory test with each route and each palette action of today (`src/features/shell/inventory.test.tsx`). REQ-003.
- [x] T005 [P] Unit tests, then the map from each run state to a stage and a mark in `crates/shipyard-core/`. REQ-010.
- [x] T006 Unit tests, then the feature read model that joins ticket, spec change, run and pull request in `crates/shipyard-core/`; one read command in `crates/shipyard-app/`; update `src/lib/ipc/mock*.ts`. REQ-012.
- [x] T007 [P] Tokens of the new look in `src/ui/tokens/` for Light, Dark, OLED and System; the attention colour as one token; Light as the default for a person with no chosen theme, a chosen theme kept (`q:Q-168`). REQ-025.
- [x] T008 [P] Shared components with gallery entries in `src/ui/`: place menu, Ask bar, stage line, attention card, section switch, door, value row. Each is 44 px high or more. REQ-026, REQ-028.
- [x] T009 New shell with the six places and Setup, on main with no switch (`q:Q-171`); redirects for each old address in `src/app/router.tsx`. REQ-001, REQ-002, REQ-029.

Wave 2, Today and Ask

- [x] T010 Today: one thing at a time with its answer, the queue, the count in the title; the views Needs you, News, Activity; the menu bar panel reads the same list (`src/features/home/`, `src/features/tray/`). REQ-007, REQ-008.
- [x] T011 [P] Role panels, the person's work, "since you were away" and the time reminder on Today (`src/features/home/role-panels.tsx`). REQ-009.
- [x] T012 Ask bar: answer, go to, do; the palette shortcut; the full assistant with every control of today (`src/features/assistant/`, `src/features/shell/palette-host.tsx`). REQ-004, REQ-005.

Wave 3, Flow and one feature

- [x] T013 Flow with the five stages and the views Flow, List, Done (`src/features/work/`, `src/features/factory/runs/`). REQ-010, REQ-011.
- [x] T014 Feature page: stage line, Story, Brief, Design, Changes, Checks, Chat, from the run page, the change detail, the ticket detail and the pull request page. REQ-012, REQ-015.
- [x] T015 One approval for one intent, each effect approvable alone, the durable permission of a recipe (one command in `crates/shipyard-app/`, mocks updated). REQ-013.
- [x] T016 [P] One main action for each stop state. REQ-014.
- [x] T017 [P] New feature page and "start from a ticket". REQ-003.

Wave 4, Crew and Plan

- [x] T018 Crew: people and agents, Recipes with every step field, Sessions, Spend with budgets, Rights with the team file (`src/features/crew/`, `src/features/work/team-rights.tsx`, `src/features/factory/`). REQ-016.
- [x] T019 [P] Live work rows in place of the agents map. REQ-017.
- [x] T020 Plan: title with the end date, Timeline, People with proposals, Estimates, Costing, Time, dates and days off, Excel import, send preview (`src/features/plan/`, `src/features/work/`). REQ-018, REQ-019.
- [x] T035 Tests, then "Ask an agent to estimate": proposal per task, accept per task, off on a sealed sheet, budget and stop (`src/features/plan/estimate-agent.tsx`, `crates/shipyard-app/src/estimate_agent.rs`, mocks updated). REQ-030, REQ-033.

Wave 5, Library

- [ ] T021 Library doors with the waiting items; each Design, Knowledge and spec reference view opens from a door. REQ-020.
- [ ] T022 [P] Picture-first readers with the text on demand for models, diagrams, specs, test plans and decisions. REQ-021.
- [ ] T023 [P] Reports, the map of the code, the flow matrix and the manual in their new place. REQ-003.
- [ ] T036 Tests, then "Build a tile for me": proposed tile, Accept and Discard, budget and stop (`src/features/knowledge/dashboards.tsx`). REQ-032, REQ-033.

Wave 6, Code, Health and Setup

- [ ] T024 Code with Now, History, Branches, Terminal and the sync mark (`src/features/code/`). REQ-022.
- [ ] T025 [P] Health as a view of Flow; impacts from the Checks of a feature. REQ-023.
- [ ] T026 Setup: guided start with every checklist item, the scopes This project, This computer, Me, one place for each setting (`src/features/settings/`, `src/features/onboarding/`). REQ-024.
- [ ] T027 [P] Projects page, new project steps and the system moments (no project, permissions, tour, close guard, unsaved changes). REQ-003.
- [ ] T037 Tests, then "Fix all with an agent": one feature in Flow with the findings in its Brief, normal review, budget and stop (`src/features/projects/doctor-compliance.tsx`). REQ-031, REQ-033.

Wave 7, roles, words, removal

- [ ] T028 Role views: hidden places by level, first page per role (`spaces.ts`). REQ-006.
- [ ] T029 [P] Plain words in English, French, German and Spanish, with the English names of `q:Q-169`; use the French, German and Spanish names of `q:Q-172` (the default is a translation of each name); the check for "tracker" and "forge" (`src/lib/i18n/`). REQ-027.
- [ ] T030 Remove the old shell and each old page that a wave did not remove yet. REQ-029.
- [ ] T031 Accessibility and size run at 960 by 600 on each page. REQ-026.
- [ ] T032 Docs: `docs/designs/screens.json`, `docs/assets/screenshots/`, `docs/guide/` in four languages, the specs of the touched capabilities, `CHANGELOG.md` and `CHANGELOG.fr.md`.
- [ ] T033 Run the validation commands of `plan.md`.
- [ ] T034 Compare the implementation against the spec and update the stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

# Tasks: knowledge

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write unit tests in `crates/shipyard-core/tests/knowledge.rs`: orphan mark, stale mark, path order, glossary terms. Covers REQ-007, REQ-020, REQ-021.
- [x] T002 Implement those rules in `crates/shipyard-core/src/knowledge.rs`. Covers REQ-007, REQ-020, REQ-021.
- [x] T003 [P] Write codec tests in `crates/shipyard-store/tests/knowledge.rs`: page, deck, theme, dashboard, newer version stays read-only. Covers REQ-010, REQ-012, REQ-017, REQ-018, REQ-022, REQ-025.
- [x] T004 Implement the codecs in `crates/shipyard-store/src/knowledge.rs`. Covers REQ-010, REQ-012, REQ-017, REQ-018, REQ-022, REQ-025.
- [x] T005 [P] Write export tests in `crates/shipyard-store/tests/export.rs`: five sections, cover, empty section, unreadable source, no sealed day rate, `.xlsx`. Covers REQ-013 to REQ-016.
- [x] T006 Implement the exports in `crates/shipyard-store/src/export.rs`. Covers REQ-013 to REQ-016.
- [x] T007 [P] Write app tests in `crates/shipyard-app/tests/knowledge.rs`: code graph through a fake MCP server. Covers REQ-002, REQ-008.
- [x] T008 Implement the commands in `crates/shipyard-app/src/knowledge.rs`. Covers REQ-002, REQ-008, REQ-023.
- [x] T009 [P] Write component tests for the renderer in `src/ui/graph-canvas.test.tsx`: selection, keyboard, table view, reduced motion. Covers REQ-003, REQ-005, REQ-006.
- [x] T010 Build `GraphCanvas` in `src/ui/graph-canvas.tsx` and switch the Agents map to it. Covers REQ-003.
- [x] T011 [P] Write component tests for Graph in `src/features/knowledge/graph.test.tsx`: kinds, filter, focus, source switch, marks. Covers REQ-001, REQ-002, REQ-004, REQ-005, REQ-007.
- [x] T012 Build Graph in `src/features/knowledge/`. Covers REQ-001, REQ-002, REQ-004, REQ-005, REQ-007.
- [x] T013 [P] Write component tests for Explain in `src/features/knowledge/explain.test.tsx`. Covers REQ-008, REQ-009.
- [x] T014 Build the Explain action in `src/features/knowledge/`. Covers REQ-008, REQ-009.
- [x] T015 [P] Write component tests for Handbook and Documents in `src/features/knowledge/handbook.test.tsx` and `documents.test.tsx`. Covers REQ-010 to REQ-016, REQ-025.
- [x] T016 Build Handbook, Documents and the editor in `src/features/knowledge/`. Covers REQ-010 to REQ-016, REQ-025.
- [x] T017 [P] Write component tests for Slides in `src/features/knowledge/slides.test.tsx`. Covers REQ-017 to REQ-019.
- [x] T018 Build Slides in `src/features/knowledge/`. Covers REQ-017 to REQ-019.
- [x] T019 [P] Write component tests for Learn in `src/features/knowledge/learn.test.tsx`. Covers REQ-020, REQ-021.
- [x] T020 Build Learn in `src/features/knowledge/`. Covers REQ-020, REQ-021.
- [x] T021 [P] Write component tests for Dashboards and Home widgets in `src/features/knowledge/dashboards.test.tsx`. Covers REQ-022 to REQ-024.
- [x] T022 Build Dashboards and the Home widgets in `src/features/knowledge/`. Covers REQ-022 to REQ-024.
- [x] T023 Write the e2e test `e2e/knowledge.spec.ts`: graph, Explain, handbook, export, deck, path, dashboard. Covers REQ-001 to REQ-026. Done: six tests on the mock. Open: none.
- [ ] T024 Add French and English keys and one entry each to `CHANGELOG.md` and `CHANGELOG.fr.md`. Covers REQ-026.
- [ ] T025 Run the validation commands of `plan.md`. Covers REQ-001 to REQ-026.
- [ ] T026 Compare the code with `spec.md`, update stale artifacts, then close Q-044, Q-045 and Q-046. Covers REQ-002, REQ-016, REQ-021.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

# Plan: library-functions

Spec: [spec.md](spec.md)
Date: 2026-11-20

## Summary

Build the 13 requirements of the spec on the commands and stores of today. Each requirement adds a field or a command to a store that exists, and a control on a page that exists. The writer group C owns the files below. No other group edits them.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | The existing stack: Rust crates and the React frontend. |
| Dependencies | None new. A crate for process metrics enters only if the standard library cannot read them (`spec:shell-setup-rights#REQ-003`). |
| Data/storage | A field on an existing file or record. A new table or column goes in `docs/data-models/*.dbml`. |
| APIs/contracts | A new IPC command for a control with no command today. The IPC bindings are generated. The IPC mocks follow each command change. |
| Risks | A write to the code host or the issue tracker needs the permission of other writes. The shared files make a merge conflict: see the order rules in `tasks.md`. |

## Affected Surfaces

- Code: `crates/shipyard-app/src/decks.rs`, `crates/shipyard-app/src/design.rs`, `crates/shipyard-app/src/documents.rs`, `crates/shipyard-app/src/knowledge.rs`, `crates/shipyard-app/src/learning.rs`, `crates/shipyard-app/src/page_history.rs`, `crates/shipyard-app/src/reports.rs`, `crates/shipyard-core/src/flows.rs`, `crates/shipyard-core/src/tile.rs`, `crates/shipyard-git/`, `src/features/design/api.tsx`, `src/features/design/flows.tsx`, `src/features/home/role-panels.tsx`, `src/features/knowledge/dashboards.tsx`, `src/features/knowledge/documents.tsx`, `src/features/knowledge/graph.tsx`, `src/features/knowledge/learn-paths.tsx`, `src/features/knowledge/learn.tsx`, `src/features/knowledge/pages.tsx`, `src/features/knowledge/slides.tsx`, `src/features/knowledge/work-slides.ts`, `src/features/library/library-home.tsx`, `src/features/library/recent.ts`, `src/features/reports/export-menu.tsx`, `src/features/reports/forms.tsx`, `src/features/reports/reports-page.tsx`, `src/features/specs/`, `src/lib/ipc/mock-design.ts`, `src/lib/ipc/mock-knowledge.ts`, `src/lib/ipc/mock-learning.ts`, `src/lib/ipc/mock-reports.ts`, `src/lib/knowledge/`
- Tests: a test beside each file, and the Rust tests of each crate.
- Docs/specs: `docs/flows/network-flows.json` is NOT changed (no new call); `docs/designs/screens.json` and the pictures for Slides, Learn, Reports, Dashboards and the flow matrix; the test plan `docs/delivery/test-plans/library-functions.feature`; `CHANGELOG.md` and `CHANGELOG.fr.md`; `docs/guide/` (four languages).

## Approach

- REQ-001 (F26): `src/features/library/recent.ts`, `src/features/library/library-home.tsx`.
- REQ-002 (F27): `crates/shipyard-git/`, `crates/shipyard-app/src/page_history.rs`, `src/features/knowledge/pages.tsx`, `src/features/specs/`, `src/lib/ipc/mock-knowledge.ts`.
- REQ-003 (F28): `src/features/knowledge/documents.tsx`, `crates/shipyard-app/src/documents.rs`, `src/lib/ipc/mock-knowledge.ts`.
- REQ-004 (F29): `src/features/knowledge/slides.tsx`, `src/features/knowledge/work-slides.ts`, `crates/shipyard-app/src/decks.rs`, `src/lib/ipc/mock-knowledge.ts`.
- REQ-005 (F30): `src/features/knowledge/learn.tsx`, `src/features/knowledge/learn-paths.tsx`, `crates/shipyard-app/src/knowledge.rs`, `crates/shipyard-app/src/learning.rs`, `src/lib/ipc/mock-learning.ts`.
- REQ-006 (F31): `crates/shipyard-app/src/reports.rs`, `crates/shipyard-app/src/decks.rs`, `src/features/reports/reports-page.tsx`, `src/features/reports/forms.tsx`, `src/features/reports/export-menu.tsx`, `src/lib/ipc/mock-reports.ts`.
- REQ-007 (F32): `src/features/reports/reports-page.tsx`, `src/features/reports/forms.tsx`, `crates/shipyard-app/src/reports.rs`, `src/lib/ipc/mock-reports.ts`.
- REQ-008 (F34): `src/features/knowledge/dashboards.tsx`, `crates/shipyard-core/src/tile.rs`, `crates/shipyard-app/src/knowledge.rs`, `src/lib/ipc/mock-knowledge.ts`.
- REQ-009 (F35): `src/features/knowledge/dashboards.tsx`, `src/features/home/role-panels.tsx`, `src/lib/knowledge/`.
- REQ-010 (F36): `src/features/knowledge/dashboards.tsx`.
- REQ-011 (F37): `src/features/design/flows.tsx`, `crates/shipyard-core/src/flows.rs`, `crates/shipyard-app/src/design.rs`, `src/lib/ipc/mock-design.ts`.
- REQ-012 (F38): `src/features/knowledge/graph.tsx`, `crates/shipyard-app/src/knowledge.rs`, `src/lib/ipc/mock-knowledge.ts`.
- REQ-013 (F39): `src/features/design/api.tsx`.
- Decision for REQ-006: PDF reuses the print path of `deck_pdf`, so it works on macOS only.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
cargo test --workspace
pnpm ipc:check
cd docs && pnpm dlx @fission-ai/openspec@2.0.0 validate add-redesign-functions --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Docs of the table in `CLAUDE.md` are updated for each requirement that alters them.
- [ ] API contracts updated if a command changed.
- [ ] Env examples updated if config changed.

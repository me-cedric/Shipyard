# Plan: runs-recipes

Spec: [spec.md](spec.md)
Date: 2026-11-20

## Summary

Build the 9 requirements of the spec on the commands and stores of today. Each requirement adds a field or a command to a store that exists, and a control on a page that exists. The writer group A owns the files below. No other group edits them.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | The existing stack: Rust crates and the React frontend. |
| Dependencies | None new. A crate for process metrics enters only if the standard library cannot read them (`spec:shell-setup-rights#REQ-003`). |
| Data/storage | A field on an existing file or record. A new table or column goes in `docs/data-models/*.dbml`. |
| APIs/contracts | A new IPC command for a control with no command today. The IPC bindings are generated. The IPC mocks follow each command change. |
| Risks | A write to the code host or the issue tracker needs the permission of other writes. The shared files make a merge conflict: see the order rules in `tasks.md`. |

## Affected Surfaces

- Code: `crates/shipyard-app/src/factory.rs`, `crates/shipyard-app/src/specs.rs`, `crates/shipyard-core/src/pickup.rs`, `crates/shipyard-core/src/run.rs`, `crates/shipyard-core/src/workflow.rs`, `crates/shipyard-engine/src/budget.rs`, `crates/shipyard-engine/src/run_engine.rs`, `docs/diagrams/run-state-machine.mmd`, `src/features/crew/budgets.tsx`, `src/features/crew/recipe-file.tsx`, `src/features/crew/recipes.tsx`, `src/features/crew/spend-const.ts`, `src/features/crew/spend.tsx`, `src/features/flow/feature/agent-card.tsx`, `src/features/flow/feature/chat.tsx`, `src/features/flow/feature/stop-card.tsx`, `src/features/flow/new-feature.tsx`, `src/features/sync/automation-draft.ts`, `src/features/sync/automation.tsx`, `src/lib/factory/index.ts`, `src/lib/ipc/mock-factory.ts`, `src/lib/ipc/mock-specs.ts`, `src/lib/ipc/mock-sync.ts`
- Tests: a test beside each file, and the Rust tests of each crate.
- Docs/specs: `docs/diagrams/run-state-machine.mmd` (Pause), `docs/openspec/specs/factory/` after archive; the test plan `docs/delivery/test-plans/runs-recipes.feature`; `CHANGELOG.md` and `CHANGELOG.fr.md`; `docs/guide/` (four languages).

## Approach

- REQ-001 (F02): `crates/shipyard-engine/src/run_engine.rs`, `crates/shipyard-app/src/factory.rs`, `src/features/flow/feature/agent-card.tsx`, `src/features/flow/feature/stop-card.tsx`, `src/lib/factory/index.ts`, `src/lib/ipc/mock-factory.ts`, `docs/diagrams/run-state-machine.mmd`.
- REQ-002 (F03): `src/features/flow/feature/stop-card.tsx`, `src/lib/factory/index.ts`, `src/lib/ipc/mock-factory.ts`.
- REQ-003 (F05): `src/features/flow/feature/chat.tsx`, `crates/shipyard-app/src/factory.rs`, `src/lib/ipc/mock-factory.ts`.
- REQ-004 (F07): `src/features/flow/new-feature.tsx`, `crates/shipyard-app/src/specs.rs`, `src/lib/ipc/mock-specs.ts`.
- REQ-005 (F08): `src/features/flow/new-feature.tsx`, `crates/shipyard-app/src/factory.rs`, `crates/shipyard-engine/src/budget.rs`, `src/lib/ipc/mock-factory.ts`.
- REQ-006 (F16): `crates/shipyard-core/src/run.rs`, `crates/shipyard-engine/src/budget.rs`, `crates/shipyard-app/src/factory.rs`, `src/features/crew/spend.tsx`, `src/features/crew/budgets.tsx`, `src/features/crew/spend-const.ts`, `src/lib/ipc/mock-factory.ts`.
- REQ-007 (F17): `crates/shipyard-core/src/pickup.rs`, `crates/shipyard-engine/src/run_engine.rs`, `src/features/sync/automation.tsx`, `src/features/sync/automation-draft.ts`, `src/lib/ipc/mock-sync.ts`.
- REQ-008 (F18): `crates/shipyard-core/src/workflow.rs`, `src/features/crew/recipes.tsx`, `src/features/crew/recipe-file.tsx`, `src/lib/ipc/mock-factory.ts`.
- REQ-009 (F19): `src/features/crew/recipe-file.tsx`, `crates/shipyard-core/src/workflow.rs`, `src/lib/ipc/mock-factory.ts`.
- Decision for REQ-006: Go on makes the budget a warning only (`q:Q-174`). The default stays Stop and ask. The kill switch and the stall timeout stay. The max turns went later (`adr:0025`). The constitution (section 5, rule 5) says each run has a budget. A budget with Go on still exists and still warns. An ADR may be needed: see the checklist.
- Decision for REQ-001: Pause is cooperative. The engine sets a flag, and the run moves to `Paused` at the end of the turn.

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

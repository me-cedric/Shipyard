# Plan: work

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

The team and estimate codecs live in `shipyard-store`. Pure rules (suggestion, estimate maths, Gantt, plan diff) live in `shipyard-core`. Tracker writes go through the `Tracker` trait. The UI is `src/features/work/`. This covers REQ-001 to REQ-029.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). TanStack Table and Virtual for lists. |
| Dependencies | No new dependency. Excel read and write needs a crate or package. Reuse one that the workspace already holds, else raise an ADR before adding it. |
| Data/storage | `.shipyard/team.yaml`. Estimate sheets in `docs/costing/<slug>.yaml`. Plan decisions in `docs/planning/plan.yaml`, calendar in `docs/planning/calendar.yaml`. Time in `docs/time/<handle>/<yyyy-mm>.yaml`. All are text in the repository. The mirror stays in the app data folder. |
| APIs/contracts | Uses the `Tracker` trait for assignee, labels, transitions, worklog and create or update. IPC commands `work_team`, `work_assign`, `work_suggest`, `estimate_*`, `plan_*`, `time_*`, `apply_preview`, `apply_run`, `work_item_create`. Bindings are generated. |
| Suggestion | A pure function scores skill match and free capacity. It returns a ranked list with reasons. |
| Estimates | A pure function computes totals from entries and role rates. No total reaches the file. |
| Seal | Authenticated encryption of the sheet files and the day rate field. The passphrase lives in the keychain (`add-connections` REQ-011). |
| Gantt | A pure function schedules tasks over capacity, availability and calendar. Only the decision file is written. |
| Time | Write the local entry, send, then store the receipt. The worklog note carries `shipyard log=<id>`. The day anchors at 09:00 in the machine offset. |
| Apply | A pure diff of rows against the mirror. Each row carries its `est:<slug>#<row-id>` ref as a ticket label for matching (Q-033). One item from a ref uses the same apply (REQ-029). Split apply code lives here only. |
| Risks | A sealed file cannot merge. A lost worklog response. Excel layout drift. The dedupe mark and the import preview cover the last two. |

## Affected Surfaces

- Code: `crates/shipyard-core` (rules), `crates/shipyard-store` (team, estimate, plan, time codecs, seal), `crates/shipyard-trackers` (assign, worklog, apply calls), `crates/shipyard-app` (commands), `src/features/work/`.
- Tests: `crates/*/tests`, `src/features/work/*.test.tsx`, `e2e/work.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-work/`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-032, Q-033, Q-034, Q-060.

## Approach

1. Write the pure rules in `shipyard-core` with unit tests: suggestion, estimate maths, Gantt, plan diff.
2. Add the codecs for team, sheets, plan decisions, calendar and time in `shipyard-store`, with the seal.
3. Add the Excel import and export.
4. Add the tracker calls: assign, label, transition, worklog, create and update.
5. Add the IPC commands and the `member:` and `est:` entities.
6. Build Backlog and Board on the mirror.
7. Build Team and the assignment with its suggestion.
8. Build Estimates with its four views, seal and Excel actions.
9. Build Plan and Time.
10. Build the apply preview and apply. Add French and English keys.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-store
cargo test -p shipyard-trackers
pnpm vitest run src/features/work
pnpm playwright test e2e/work.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-work --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

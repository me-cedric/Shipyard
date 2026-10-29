# Plan: sync

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

The tick, reconcile, pickup and claims live in `shipyard-engine`. The mirror and the claim table live in `shipyard-store`. Pure pickup and reconcile rules live in `shipyard-core`. The UI is the status bar action and the connection state rows. This covers REQ-001 to REQ-017.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). The engine is synchronous, like the adapters: the app runs `Engine::run` on its own thread. A `Clock` trait gives the time, so a test uses a fake clock. |
| Dependencies | No new dependency. `shipyard-engine` depends on `shipyard-core` and `shipyard-store` only. Jitter uses a small generator in the engine: it needs no quality, and no random crate is a direct dependency of the workspace. |
| Data/storage | SQLite mirror, claim table, event outbox and links in one file, `mirror.sqlite`, in the app data folder (ADR 0007). Rows are keyed by connection id. Pickup rules in `.shipyard/automation.yaml` (snake_case keys): `interval`, `pickup`, `concurrency`, `status_map`, `writes`. |
| APIs/contracts | The engine reads its sources through the ports `TrackerPort`, `ForgePort` and `Dispatch` (`crates/shipyard-engine/src/ports.rs`). The app wraps the `Tracker` and `Forge` adapters of `add-connections` in the first two, and `factory` implements `Dispatch`. The ports keep the engine free of the HTTP crates and of the tracker write work. IPC commands `sync_now`, `sync_state`, `sync_import_backlog`, `sync_adopt`, `sync_link`. Events `sync_tick`, `comment_new`, `pr_event`. Bindings are generated. |
| Tick | One timer per connection. The interval has a floor of 30 s. Jitter adds up to 20 % of the interval. A poll sends the start time of the last good poll, minus 2 minutes. A failed poll waits `min(interval x 2^n, 5 min)`, or the interval when it is longer. |
| Reconcile | Pure functions in `shipyard-core::pickup` take the mirror and the fetched items. They return the changed tickets, the pull request events and the runs to stop. The order is fixed by the engine. A ticket of an active run that the list leaves out is read by key. |
| Pickup | A pure function takes the mirror, the filter, the limits and the active runs. It returns the tickets to claim, oldest update first. The engine reads each ticket again before it claims it. Nothing is picked up while the last poll of the tracker failed. An empty status set means the `Todo` category. |
| Claim | A row in the store with a primary key on the connection and the ticket. The stamp is a comment that holds the machine id, written through `TrackerPort`. The oldest live stamp wins. The port gives the age of a stamp by the clock of the tracker. The stale time is 10 minutes (Q-021, working assumption). |
| Write switches | The claim stamp follows the `tracker_comment` switch (Q-020, option 2). Without it the claim stays in the local store and the engine still reads stamps. The four switches stay in `factory`. |
| Failure | A failed poll keeps the mirror and backs off up to a maximum. A run with a pull request is not stopped while the forge poll fails. |
| Events | The compare step writes each comment and pull request event to an outbox in the same transaction as the mirror update. The hand-off step sends the outbox and removes an event after the listener took it. A refusal or a crash keeps the event for the next tick. |
| Risks | Rate limits and clock drift between machines. The stamp holds the claim time from the tracker, not the local clock. Q-020 and Q-021 stay open. |

## Affected Surfaces

- Code: `crates/shipyard-core` (reconcile and pickup rules), `crates/shipyard-store` (mirror, claims), `crates/shipyard-engine` (tick, claims), `crates/shipyard-app` (commands, events), `src/features/sync/`, the status bar of `src/features/shell/`.
- Tests: `crates/*/tests`, `src/features/sync/*.test.tsx`, `e2e/sync.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-sync/`, `docs/decisions/0007-polling-sync-with-local-mirror.md`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-020, Q-021.

## Approach

1. Write the reconcile and pickup rules in `shipyard-core` with unit tests.
2. Add the mirror and claim table in `shipyard-store`, with the atomic claim.
3. Add the `automation.yaml` codec for filter, concurrency and status mapping.
4. Add the tick loop in `shipyard-engine`: poll, jitter, updated-since, backoff.
5. Add the reconcile order, the stop of terminal runs, and the pickup with claims and stamps.
6. Add the hand-off events for comments and for pull request, CI and merge.
7. Add the adopt, link and import commands.
8. Add the IPC commands and the `wi:` and `pr:` entities.
9. Build the connection state rows and wire the status bar action. Add French and English keys.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-store
cargo test -p shipyard-engine
pnpm vitest run src/features/sync
pnpm playwright test e2e/sync.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-sync --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

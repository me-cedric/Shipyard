# Plan: sync

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

The tick, reconcile, pickup and claims live in `shipyard-engine`. The mirror and the claim table live in `shipyard-store`. Pure pickup and reconcile rules live in `shipyard-core`. The UI is the status bar action and the connection state rows. This covers REQ-001 to REQ-017.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). Async tick on the existing runtime. |
| Dependencies | No new dependency. Reuse `rusqlite` through `shipyard-store`. Use a random source already in the workspace for jitter. |
| Data/storage | SQLite mirror and claim table in the app data folder (ADR 0007). Pickup rules in `.shipyard/automation.yaml`. |
| APIs/contracts | Uses the `Tracker` and `Forge` traits of `add-connections`. IPC commands `sync_now`, `sync_state`, `sync_import_backlog`, `sync_adopt`, `sync_link`. Events `sync_tick`, `comment_new`, `pr_event`. Bindings are generated. |
| Tick | One timer per connection. The interval has a floor of 30 s. Jitter is a random share of the interval. A poll sends the last good tick time. |
| Reconcile | A pure function takes the mirror and the fetched items. It returns changes and the runs to stop. The order is fixed by the engine. |
| Pickup | A pure function takes the mirror, the filter, the limits and the active runs. It returns the tickets to claim. |
| Claim | A row in the store with a unique key on the ticket ref. The stamp is a tracker write through the `Tracker` trait. Its form is open (Q-020). The stale time is open (Q-021). |
| Write switches | The claim stamp follows the Q-020 working assumption. The four switches stay in `factory`. |
| Failure | A failed poll keeps the mirror and backs off up to a maximum. |
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

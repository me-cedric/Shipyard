# Plan: refs

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

The ref grammar and the parser live in `shipyard-core` and do no I/O. The ref index lives in `shipyard-store`. The UI part is `RefChip` and `BacklinkList` in `src/features/refs/`. This covers REQ-001 to REQ-014.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). |
| Dependencies | No new dependency. Reuse `rusqlite`, `cmdk` and the generated IPC. |
| Data/storage | A `ref_index` table in the SQLite store of the app data folder. It is derived data and can be rebuilt. |
| APIs/contracts | IPC commands `refs_resolve`, `refs_backlinks`, `refs_search`, `refs_check`. Events `refs_changed`. Bindings are generated. |
| Parser | One grammar in `shipyard-core`. A pure function returns the refs of a text. |
| Index sources | Repository files by a codec in `shipyard-store`, the mirror table and the run log table. |
| Update | The file watcher and the sync tick write the changed sources. A full rebuild exists for repair. |
| Search | SQLite FTS over refs and titles. A ref match ranks first. |
| Broken refs | `refs_check` returns findings. `projects` renders them in Settings / Health. |
| Agent access | `shipyard-mcp` calls `refs_resolve` and `refs_backlinks` for `read_ref`. |
| Risks | A large repository slows the first index. Index in the background and show a progress count only. |

## Affected Surfaces

- Code: `crates/shipyard-core` (ref types, parser), `crates/shipyard-store` (index, check), `crates/shipyard-mcp` (`read_ref`), `crates/shipyard-app` (commands), `src/features/refs/`, `src/ui/` (RefChip and BacklinkList consumers).
- Tests: `crates/shipyard-core/tests`, `crates/shipyard-store/tests`, `src/features/refs/*.test.tsx`, `e2e/refs.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-refs/`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-011, Q-012.

## Approach

1. Define the kinds and the grammar in `shipyard-core`. Test each kind.
2. Add the text detector. Skip code spans and code blocks (Q-011 option 1).
3. Add the index and its writers for the three sources.
4. Add resolve, backlinks, search and check on the index.
5. Mark a tracker ref unresolved until the next sync (Q-012 option 1).
6. Add the IPC commands and the `read_ref` handler.
7. Build RefChip behaviour and BacklinkList in `src/features/refs/`. Add French and English keys.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-store
cargo test -p shipyard-mcp
pnpm vitest run src/features/refs
pnpm playwright test e2e/refs.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-refs --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

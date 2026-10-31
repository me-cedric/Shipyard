# Plan: refs

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

The ref grammar, the parser and the text detector live in `shipyard-core` and do no I/O. The ref index lives in `shipyard-store`. The hooks live in `src/lib/refs/`, `BacklinkList` and `RefChip` in `src/ui/molecules/`, and the inspector content in `src/features/shell/`. This covers REQ-001 to REQ-014.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). |
| Dependencies | `rusqlite` with the `bundled` feature (new). Reuse `cmdk` and the generated IPC. |
| Data/storage | One SQLite file for each project in `<app data>/refs/<project id>.sqlite`: the tables `sources`, `entities`, `citations`. It is derived data and can be rebuilt. |
| APIs/contracts | IPC commands `refs_parse`, `refs_resolve`, `refs_backlinks`, `refs_search`, `refs_check`, `refs_reindex`. No event: the views refetch. Bindings are generated. |
| Parser | One grammar in `shipyard-core`. `parse` reads one ref and `detect` returns the refs of a text. The UI calls `refs_parse`. The mock keeps a TypeScript copy of the grammar (`src/lib/ipc/mock-refs.ts`) with the same test cases. |
| Index sources | Repository files (ADRs, RAID questions, OpenSpec changes and specs with their requirements, workflows, the project file) by `repo_scan`. The mirror and the run log call `set_source` when `sync` and `factory` land. |
| Update | No file watcher. Each query first compares the stamp (time and size) of each scanned file with the index and re-reads the files that changed. `refs_reindex` rebuilds the index for repair. |
| Search | `LIKE` over refs and titles. A ref match ranks first. Move to FTS when an index grows past a few thousand entities. |
| Broken refs | `refs_check` returns findings. `projects` renders them in Settings / Health. A missing target is broken only for the kinds that the repository files cover (`adr`, `q`, `change`, `spec`, `wf`, `doc` under the scanned folders). Other kinds stay unresolved until their capability indexes its source (Q-012). |
| Agent access | `shipyard_mcp::tools::read_ref` reads the index. The MCP server itself comes with `factory`. |
| Risks | A large repository slows the first index. Index in the background and show a progress count only. |

## Affected Surfaces

- Code: `crates/shipyard-core` (ref types, parser, detector), `crates/shipyard-store` (index, check), `crates/shipyard-mcp` (`read_ref`), `crates/shipyard-app/src/commands/refs.rs`, `src/lib/refs/`, `src/ui/molecules/` (RefChip, BacklinkList), `src/features/shell/` (inspector, palette).
- Tests: `crates/shipyard-core/tests`, `crates/shipyard-store/tests`, `src/features/shell/refs.test.tsx`, `src/ui/molecules/*.test.tsx`, `e2e/projects.spec.ts`.
- Docs/specs: `docs/openspec/changes/archive/2026-10-31-add-refs/`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-011, Q-012.

## Approach

1. Define the kinds and the grammar in `shipyard-core`. Test each kind.
2. Add the text detector. Skip code spans and code blocks (Q-011 option 1).
3. Add the index and its writers for the three sources.
4. Add resolve, backlinks, search and check on the index.
5. Mark a tracker ref unresolved until the next sync (Q-012 option 1).
6. Add the IPC commands and the `read_ref` handler.
7. Build RefChip behaviour and BacklinkList in `src/ui/molecules/`, and the inspector content in `src/features/shell/`. Add French and English keys.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-store
cargo test -p shipyard-mcp
pnpm vitest run src/features/shell src/ui/molecules
pnpm playwright test e2e/projects.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-refs --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

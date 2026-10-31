# Plan: knowledge

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

One graph renderer lives in `src/ui/`. Pure rules (stale and orphan marks, learning path, glossary) live in `shipyard-core`. File codecs and exports live in `shipyard-store`. The UI is `src/features/knowledge/`. This covers REQ-001 to REQ-026.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). xyflow for the renderer. TanStack Table for the table views. |
| Dependencies | reveal.js for slides, named in the proposal. A `.docx` writer is new. The `.xlsx` writer is the one that `add-work` picks. Add no package before an ADR names it. |
| Data/storage | Handbook pages in `docs/handbook/`. Documents in `docs/documents/`. Decks in `docs/slides/<slug>.md` and the theme in `docs/slides/theme.yaml`. Dashboards in `docs/dashboards/<slug>.yaml` with a version field. Pins in the app data folder. The paths come from the artifact paths of the project file. |
| APIs/contracts | IPC commands `graph_*`, `explain_context`, `doc_*`, `export_*`, `slide_*`, `dashboard_*`, `learn_*`. Bindings are generated. |
| Graph renderer | A `GraphCanvas` organism in `src/ui/` takes nodes and edges. Knowledge and `add-factory` Agents map both import it. A force layout that settles is the default. |
| Reference graph | Nodes and edges come from the ref index of `add-refs`. Kinds come from the ref prefixes. |
| Code graph | Q-045 option 1: the codebase-memory MCP server, listed as a `conn:` entity. The calls go through `shipyard-mcp`. The Index action calls its index tool. |
| Stale and orphan | A pure function. The time of an entity is the last commit time of its file, or the file time when uncommitted. An orphan has zero backlinks. |
| Explain | The app builds the context from the entity and its one-hop neighbours. It starts the assistant in ask mode. A post check drops any cited ref that the ref index cannot resolve. |
| Exports | `shipyard-store` assembles the `.docx` and `.xlsx` files. The frontend renders the architecture views to images at the click. Each source is read at the click. |
| Learn | A pure function orders the path: architecture models, ADRs by number, capability specs. The glossary reads the terms that Q-046 option 1 defines. |
| Dashboards | A fixed catalogue of tiles. Each tile has a query on the store or the mirror. A newer file version opens read-only. |
| Risks | A source that cannot be read must not fail an export: a test covers it. A leaked day rate in the annex: a test covers it. A graph with many nodes: virtual rendering and the table view. |

## Affected Surfaces

- Code: `crates/shipyard-core` (rules), `crates/shipyard-store` (codecs, exports), `crates/shipyard-app` (commands, Explain context, code graph calls), `src/ui/` (GraphCanvas), `src/features/knowledge/`. The Agents map of `add-factory` imports `GraphCanvas`.
- Tests: `crates/*/tests`, `src/ui/organisms/graph-canvas.test.tsx`, `src/features/knowledge/*.test.tsx`, `e2e/knowledge.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-knowledge/`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-044, Q-045, Q-046.

## Approach

1. Write the pure rules in `shipyard-core` with unit tests: stale and orphan marks, learning path, glossary.
2. Add the codecs for pages, decks, the theme and dashboards in `shipyard-store`.
3. Add the `.docx` and `.xlsx` exports with their gap and cover rules.
4. Add the IPC commands, the Explain context and the code graph calls in `shipyard-app`.
5. Build `GraphCanvas` in `src/ui/`. Build Graph. Switch the Agents map to the same component.
6. Build Handbook, Documents and the shared editor.
7. Build Slides with the theme and the present mode.
8. Build Learn, then Dashboards, the pins and the Home widgets.
9. Add French and English keys and the changelog entries.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-store
cargo test -p shipyard-app
pnpm vitest run src/ui/organisms/graph-canvas.test.tsx
pnpm vitest run src/features/knowledge
pnpm playwright test e2e/knowledge.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-knowledge --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

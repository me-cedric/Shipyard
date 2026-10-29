# Plan: design

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

Design files stay in the repository. `shipyard-store` holds the MADR codec and the file listing. `shipyard-core` holds the flow row rules. The views live in `src/features/design/` and sit in the EditorFrame. This covers REQ-001 to REQ-023.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). |
| Dependencies | Excalidraw, Mermaid, LikeC4, an OpenAPI parser and a DBML parser run in the webview. Add each one only in this change, after a check of its licence. |
| Data/storage | Files only: `docs/decisions/`, and diagram, model, API, DBML, flow and design doc files under `docs/`. No database table. |
| APIs/contracts | IPC commands `design_list`, `design_read`, `design_write`, `design_adr_create`, `design_adr_decide`, `design_try`. Bindings are generated. |
| Refs | The slug is the file name without extension. The ADR number is the file prefix. `add-refs` indexes them. |
| MADR | A codec in `shipyard-store` reads and writes the front matter status, date and decision comment. |
| draw.io and BPMN | Open per Q-040. A viewer in the EditorFrame is the baseline. |
| Flow table | A YAML or CSV file under `docs/`. A pure validator in `shipyard-core` rejects a row with a missing field. |
| Try view | The request leaves from the Rust side so that a secret stays out of the webview and logs. Server policy follows Q-039. |
| Design to code | Follows Q-038. It reuses the factory pickup and the write switches. |
| Writes | Atomic write by temp file and rename. A modified-time check before replace. |
| Risks | Large dependencies slow the build. Load each editor lazily by route. |

## Affected Surfaces

- Code: `crates/shipyard-store` (MADR codec, listing, safe write), `crates/shipyard-core` (flow rules), `crates/shipyard-app` (commands), `src/features/design/`.
- Tests: `crates/shipyard-store/tests`, `crates/shipyard-core/tests`, `src/features/design/*.test.tsx`, `e2e/design.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-design/`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-038, Q-039, Q-040.

## Approach

1. Write the file listing and the slug rule. Test with fixtures.
2. Write the MADR codec with create and decide (REQ-009, REQ-010).
3. Write the flow row validator.
4. Write the safe write.
5. Add the IPC commands.
6. Build the seven views, one per route, with lazy editors. Add French and English keys.
7. Build the try view on the Rust side.
8. Add the design to code action once Q-038 is answered.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-store
pnpm vitest run src/features/design
pnpm playwright test e2e/design.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-design --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

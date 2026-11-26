# Plan: refs

Spec: [spec.md](./spec.md)
Date: 2026-11-26

## Summary

Add `ref_read` to the tools for outside agents and give it the ref index of the active project through a port. This covers REQ-015.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace. No new runtime. |
| Dependencies | None new. |
| Data/storage | The ref index of the active project, read only. |
| APIs/contracts | One new MCP tool `ref_read` with the input `ref`. The answer is the JSON of `read_ref`. |
| Risks | A security control: the tool must refuse a hidden area and leave out its backlinks. The map from a ref kind to an area is `ref_area` of `shipyard-core`, the map of `read_ref`. |

## Affected Surfaces

- Code: `crates/shipyard-mcp/src/outside.rs`, `crates/shipyard-mcp/src/server.rs`, `crates/shipyard-app/src/outside.rs`.
- Tests: the tests in `crates/shipyard-mcp/src/outside.rs`, `crates/shipyard-mcp/tests/outside.rs`, `crates/shipyard-app/src/outside.rs`, `src/lib/ipc/mock-doctor-extras.test.ts`.
- Docs/specs: `docs/api/shipyard-mcp.yaml`, `docs/delivery/test-plans/refs.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Approach

1. Write the tests: off by default, resolved, hidden area refused, backlinks filtered, not a ref, no project.
2. Add the tool, its group and its area check to `outside.rs`.
3. Add the port to the app, as for the tickets.

## Validation

```bash
cargo test -p shipyard-mcp
cargo test -p shipyard-app --lib outside
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-outside-ref-read --strict
```

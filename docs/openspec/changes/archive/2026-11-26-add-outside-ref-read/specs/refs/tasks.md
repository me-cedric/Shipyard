# Tasks: refs

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write the tests in `crates/shipyard-mcp/src/outside.rs` and `crates/shipyard-mcp/tests/outside.rs`: off by default, resolved, hidden area refused, backlinks filtered, not a ref, no project. Covers REQ-015.
- [x] T002 Add `ref_read` to `crates/shipyard-mcp/src/outside.rs` and the ref template to `crates/shipyard-mcp/src/server.rs`. Covers REQ-015.
- [x] T003 Give the ref index of the active project through a port in `crates/shipyard-app/src/outside.rs`, with a test. Covers REQ-015.
- [x] T004 Update `docs/api/shipyard-mcp.yaml`, `src/lib/ipc/mock-doctor.ts` and `docs/delivery/test-plans/refs.feature`.
- [x] T005 Add one EN and one FR changelog line.

## Completion Check

- [x] All acceptance criteria are met.
- [x] Required validation passed or failures are marked pre-existing.
- [x] Specs, docs, and code agree.

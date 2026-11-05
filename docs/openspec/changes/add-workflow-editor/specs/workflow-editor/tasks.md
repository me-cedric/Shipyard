# Tasks: workflow-editor

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Render a workflow through the shared YAML writer, keep the top comment, set a new id in a text, in `crates/shipyard-store/src/factory_files.rs`, with the round-trip test of the six presets. Covers REQ-006.
- [x] T002 Commands `workflowCheck` (parsed workflow), `workflowRender`, `workflowOptions`, `workflowCreate`, `workflowRename`, `workflowDelete` in `crates/shipyard-app/src/factory.rs`, with tests. Covers REQ-005, REQ-007, REQ-008.
- [x] T003 Proposals and the group `workflows` in `crates/shipyard-app/src/factory.rs`, `crates/shipyard-app/src/outside.rs` and `crates/shipyard-mcp/src/outside.rs`, with tests; `docs/api/shipyard-mcp.yaml`. Covers REQ-009, REQ-010.
- [x] T004 `pnpm ipc:gen`, and the mocks in `src/lib/ipc/mock-factory.ts` and `src/lib/ipc/mock.ts`.
- [x] T005 The form, the Form / Text switch, the presets, copy, rename, delete and the proposals in `src/features/factory/workflows/`, the switch in `src/features/settings/`, EN and FR, with tests. Covers REQ-001 to REQ-005, REQ-007, REQ-008, REQ-010.
- [x] T006 [P] E2E path in `e2e/factory.spec.ts`: new workflow from a preset, edit in the form, save.
- [x] T007 [P] Guide pages, `docs/designs/screens.json` and its picture, test plan, changelog lines.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

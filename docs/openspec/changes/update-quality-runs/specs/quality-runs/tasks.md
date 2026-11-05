# Tasks: quality-runs

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 YAML style: one writer helper in `crates/shipyard-store/src/` used by every YAML write, with tests (nested lists, block scalars). Covers REQ-006.
- [x] T002 Scanner scope and secret fixtures in `crates/shipyard-app/src/scanners.rs` and `code.rs`, with tests; mark the fixtures of the repository. Covers REQ-004, REQ-005.
- [x] T003 Verify all docs skips submodules in `crates/shipyard-app/src/qa.rs`, with a test. Covers REQ-007.
- [x] T004 Progress event of a running check or scanner in `crates/shipyard-app/src/qa.rs` / `code.rs`. Covers REQ-001.
- [x] T005 [P] The running state, the elapsed time, the output lines, Open in terminal and the info popovers in `src/features/code/quality.tsx`, EN and FR, with tests. Covers REQ-001, REQ-002, REQ-003.
- [x] T006 Triage the findings of the code and dependencies scanners on this repository: fix, update or ignore each one with a reason.
- [x] T007 Guide, `AGENTS.md` fixture rule, changelog lines.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

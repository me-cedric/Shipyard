# Tasks: windows-relay

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Add a Windows job for `cargo test -p shipyard-mcp` to `.github/workflows/ci.yml` (plan first: a CI change).
- [x] T002 Write tests in `crates/shipyard-mcp/tests/` for the Windows relay: a second turn reuses the server, a closed app starts it, another user is refused. Covers REQ-001, REQ-002.
- [x] T003 Implement the named pipe in `crates/shipyard-mcp/src/relay.rs` and listen on it in `crates/shipyard-app/src/lib.rs` under `cfg(windows)`. Covers REQ-001, REQ-002.
- [x] T004 Add one EN and one FR changelog line.

- [ ] T005 Add the Windows tests that T002 names but the first build lacks: a second turn reuses the open server, a closed app starts the server, another user is refused; and a read timeout for the Windows `ask` like the Unix 120 s. Covers REQ-001, REQ-002.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

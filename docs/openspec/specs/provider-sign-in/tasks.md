# Tasks: provider-sign-in

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Answer Q-132 to Q-135 in `docs/delivery/questions/`.
- [x] T002 Write tests in `crates/shipyard-agents/src/runners.rs` for the `agy` detection and for the state from `codex login status` and `claude auth status` (exit 0, exit 1, no program). Covers REQ-002, REQ-004.
- [x] T003 Implement `agy` detection and the status read in `crates/shipyard-agents/src/runners.rs`. The code reads the exit code and the `authMethod` field only. Covers REQ-002, REQ-003, REQ-004.
- [x] T004 Write tests for the sign-in launch: the right command for each tool, a key on stdin for `--with-api-key`, no token read. Covers REQ-003, REQ-009.
- [x] T005 Implement the sign-in launch in `crates/shipyard-app/src/` in the place that Q-133 chooses. Covers REQ-003, REQ-009.
- [x] T006 Write tests in `crates/shipyard-app/src/device_login.rs` for OpenRouter PKCE: the challenge, the callback, the exchange, an expired code, the keychain write. Use a fake server. Covers REQ-005, REQ-009.
- [x] T007 Implement OpenRouter PKCE in `crates/shipyard-app/src/device_login.rs`. Covers REQ-005.
- [x] T008 Moved to the change `add-azure-sign-in` (Q-132).
- [x] T009 Moved to the change `add-azure-sign-in` (Q-132).
- [x] T010 [P] Write tests and implement the localhost probe of Ollama, LM Studio, vLLM and LiteLLM in `crates/shipyard-agents/src/runners.rs`. A non-local address is refused. Covers REQ-008.
- [x] T011 [P] Write tests and implement the key paste with the "Get a key" link and the test on save in `crates/shipyard-app/src/`. A failed test stores nothing. Covers REQ-007, REQ-009.
- [x] T012 Build the one view in `src/features/settings/agents-rules.tsx` with typed mock handlers, tests, English and French labels, and a keyboard path. Covers REQ-001, REQ-010.
- [x] T013 Update `docs/guide/settings.md`, the two changelogs, `docs/models/architecture.c4` if a crate changes, and run the validation commands of `plan.md`.

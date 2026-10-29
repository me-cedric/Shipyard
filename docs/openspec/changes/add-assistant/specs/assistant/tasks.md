# Tasks: assistant

Spec: [spec.md](spec.md)
Plan: [plan.md](plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [ ] T001 Write unit tests for thread, context and mode rules in `crates/shipyard-core/tests/assistant.rs` (REQ-002, REQ-004, REQ-005, REQ-007, REQ-008).
- [ ] T002 Implement the thread, context and mode types in `crates/shipyard-core/src/assistant.rs` (REQ-002, REQ-004, REQ-005, REQ-007, REQ-008).
- [ ] T003 Write store tests for threads in the app data folder in `crates/shipyard-store/tests/threads.rs` (REQ-002, REQ-003).
- [ ] T004 Implement thread storage in `crates/shipyard-store/src/threads.rs` (REQ-002, REQ-003).
- [ ] T005 Write runner tests with a fake runner in `crates/shipyard-agents/tests/assistant_turn.rs`: quoted text, per-thread runner, denied permission, quota failure, retry without replay, secret filter (REQ-006, REQ-010, REQ-011, REQ-018, REQ-020).
- [ ] T006 Implement the turn path in `crates/shipyard-agents/src/assistant.rs` (REQ-006, REQ-010, REQ-011, REQ-018, REQ-020).
- [ ] T007 Write tests for budget booking in `crates/shipyard-engine/tests/assistant_budget.rs` (REQ-012).
- [ ] T008 Implement budget booking for assistant turns in `crates/shipyard-engine/src/budget.rs` (REQ-012).
- [ ] T009 Write tests that ask and plan modes change no file and agent mode uses a worktree in `crates/shipyard-agents/tests/assistant_modes.rs` (REQ-007, REQ-008, REQ-009).
- [ ] T010 Implement the modes and the worktree use in `crates/shipyard-agents/src/assistant_modes.rs` (REQ-007, REQ-008, REQ-009).
- [ ] T011 Write tests for rule and skill loading in `crates/shipyard-agents/tests/assistant_rules.rs` (REQ-013).
- [ ] T012 Implement rule and skill loading per turn in `crates/shipyard-agents/src/assistant_rules.rs` (REQ-013).
- [ ] T013 Write tests for Send to factory and Explain in `crates/shipyard-app/tests/assistant_send.rs` (REQ-014, REQ-015, REQ-016).
- [ ] T014 Implement the Send to factory and Explain commands in `crates/shipyard-app/src/assistant.rs` (REQ-014, REQ-015, REQ-016).
- [ ] T015 Write tests for project defaults in `crates/shipyard-store/tests/assistant_defaults.rs` (REQ-019).
- [ ] T016 Implement project defaults in `crates/shipyard-store/src/assistant_defaults.rs` (REQ-019).
- [ ] T017 Write panel tests in `src/features/assistant/assistant.test.tsx` for open, threads, context, add refs, reply actions (REQ-001, REQ-002, REQ-004, REQ-005, REQ-017).
- [ ] T018 Implement the panel in `src/features/assistant/` (REQ-001, REQ-002, REQ-004, REQ-005, REQ-017).
- [ ] T019 Write the keyboard, focus, label, contrast, reduced-motion and language tests in `src/features/assistant/a11y.test.tsx` (REQ-021).
- [ ] T020 Implement the interface rules in `src/features/assistant/` (REQ-021).
- [ ] T021 Write panel tests for the trace, the ring, the reply buttons, and the width and side in `src/features/assistant/panel_extras.test.tsx` (REQ-022, REQ-023, REQ-024, REQ-025).
- [ ] T022 Implement the trace, the ring, the reply buttons, and the width and side in `src/features/assistant/` (REQ-022, REQ-023, REQ-024, REQ-025).
- [ ] T023 Write the end-to-end test in `e2e/assistant.spec.ts` for ask, plan, agent, Send to factory and Explain (REQ-007, REQ-008, REQ-009, REQ-014, REQ-015, REQ-016, REQ-022 to REQ-025).
- [ ] T024 [P] Add the changelog entry in `CHANGELOG.md` and `CHANGELOG.fr.md` (REQ-001).
- [ ] T025 Run `cd docs && npx -y @fission-ai/openspec@latest validate add-assistant --strict` and the commands of `plan.md` (REQ-001 to REQ-025).
- [ ] T026 Compare the code with the spec and update stale artifacts in `docs/openspec/changes/add-assistant/`. Close Q-047, Q-048 and Q-049 (REQ-009, REQ-015).

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

# Tasks: agent-pr

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [ ] T001 Write tests for the review prompt (with and without the compass skill and role), the draft review shape and the one-review-per-head rule. Covers REQ-002, REQ-003, REQ-006.
- [ ] T002 Add the one-off agent review in `crates/shipyard-app/src/pr_agent.rs` on top of `crates/shipyard-engine/src/review.rs`: read-only worktree at the head, draft result, session in Factory / Sessions, budget and kill switch. Covers REQ-001, REQ-002, REQ-003, REQ-008, REQ-009.
- [ ] T003 Add the post of an edited draft through the existing `pull_verdict` and inline comments. Covers REQ-004, REQ-007.
- [ ] T004 Add "Write with an agent" for the new pull request form: title and body from the diff, ticket and spec, `pr-flow` rules. Covers REQ-005, REQ-009.
- [ ] T005 Add `auto_review` to `crates/shipyard-core/src/pickup.rs` and the sync tick trigger in the engine. Covers REQ-006, REQ-007, REQ-008.
- [ ] T006 UI in `src/features/code/` (buttons, draft review with findings on the diff, form fill) and Settings / Project choice, with typed mock handlers and tests, EN and FR. Covers REQ-001, REQ-004, REQ-005, REQ-010.
- [ ] T007 Update `docs/guide/code.md` and `docs/guide/settings.md`; one EN and one FR changelog line.
- [ ] T008 Run `cargo test --workspace`, `pnpm test`, `e2e/code.spec.ts` and `e2e/a11y.spec.ts`.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

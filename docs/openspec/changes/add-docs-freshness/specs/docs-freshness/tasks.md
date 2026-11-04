# Tasks: docs-freshness

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [ ] T001 Write tests in `crates/shipyard-core/src/project.rs` for the `docs` list: a valid rule, a missing list, a pattern with `..`, an empty pattern, a bad target. Covers REQ-001, REQ-010.
- [ ] T002 Add `DocRule` and its validation to `crates/shipyard-core/src/project.rs`. Covers REQ-001, REQ-010.
- [ ] T003 Write tests in `crates/shipyard-core/src/docs_fresh.rs` for the matcher, a stale doc, a followed doc, the default rules and a rename. Covers REQ-002, REQ-003.
- [ ] T004 Implement `docs_fresh::stale` in `crates/shipyard-core/src/docs_fresh.rs`. Covers REQ-002, REQ-003.
- [ ] T005 Write tests in `crates/shipyard-app/src/commands/overview.rs` for the commit gate, the push gate and the branch watch with a rule of the project and with no rule. Covers REQ-004, REQ-005.
- [ ] T006 Replace the `CHAIN` table in `crates/shipyard-app/src/commands/overview.rs` with the rules of the project. Keep `ChainWarning` and the acknowledgements in `crates/shipyard-app/src/commands/chain_acks.rs`. Covers REQ-004, REQ-005.
- [ ] T007 Write tests in `crates/shipyard-app/src/qa.rs` and `src/features/code/quality.test.tsx` for the Docs check: stale, clean, report kept, no file written. Covers REQ-006, REQ-011.
- [ ] T008 Add the Docs check to `crates/shipyard-app/src/qa.rs` and `src/features/code/quality.tsx`. Covers REQ-006, REQ-011.
- [ ] T009 Write tests for the `docs-update` run: no run without a click, one run after a click, only files of the doc target change, a doc that does not parse leaves the pull request. Files: `crates/shipyard-app/src/commands/overview.rs`, `src/features/code/chain-ack.test.tsx`. Covers REQ-007, REQ-008, REQ-009.
- [ ] T010 Add the `docs-update` workflow to `crates/shipyard-store/src/factory_files.rs`, the "Update with an agent" action to `src/features/code/chain-watch.tsx` and `src/features/code/chain-ack.tsx`, and the read-back of the changed docs. Covers REQ-007, REQ-008, REQ-009.
- [ ] T011 [P] Add the French and English texts in `src/lib/i18n/`. Covers REQ-012.
- [ ] T012 [P] Update `docs/guide/code.md` and `docs/guide/settings.md`, and add one EN and one FR changelog line.
- [ ] T013 Update the docs that the change itself alters: `docs/models/architecture.c4`, `docs/data-models/*.dbml`, `docs/flows/network-flows.json`, `docs/delivery/test-plans/docs-freshness.feature`.
- [ ] T014 Run `cargo test -p shipyard-core -p shipyard-app`, `pnpm test src/features/code` and `e2e/code.spec.ts`. Covers all.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

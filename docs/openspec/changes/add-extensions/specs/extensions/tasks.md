# Tasks: extensions

Spec: [spec.md](spec.md)
Plan: [plan.md](plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [ ] T001 Write tests for the no-overwrite write and the entry states in `crates/shipyard-core/tests/extensions.rs` (REQ-003, REQ-004, REQ-010).
- [ ] T002 Implement entries, states and the no-overwrite write in `crates/shipyard-core/src/extensions.rs` (REQ-003, REQ-004, REQ-010).
- [ ] T003 Write tests for reading the compass tree, the lock, the patterns and the stack mark in `crates/shipyard-store/tests/compass.rs` (REQ-001, REQ-002, REQ-004).
- [ ] T004 Implement the compass reader, the patterns list and the stack mark in `crates/shipyard-store/src/compass.rs` (REQ-001, REQ-002, REQ-004).
- [ ] T005 Write tests for apply, upgrade and no silent pin change in `crates/shipyard-app/tests/compass_apply.rs` (REQ-003, REQ-005, REQ-006).
- [ ] T006 Implement the apply and upgrade commands in `crates/shipyard-app/src/extensions/compass.rs` (REQ-003, REQ-005, REQ-006).
- [ ] T007 Write tests for the compass Health findings and fixes in `crates/shipyard-core/tests/compass_health.rs` (REQ-007).
- [ ] T008 Implement the compass check for Health in `crates/shipyard-core/src/compass_health.rs` (REQ-007).
- [ ] T009 Write tests for the roles and skills list in `crates/shipyard-store/tests/roles_skills.rs` (REQ-008).
- [ ] T010 Implement the roles and skills list in `crates/shipyard-store/src/roles_skills.rs` (REQ-008).
- [ ] T011 Write tests for the catalog and deploy in `crates/shipyard-store/tests/catalog.rs` (REQ-009, REQ-010).
- [ ] T012 Implement the catalog reader and the deploy writer in `crates/shipyard-store/src/catalog.rs` (REQ-009, REQ-010).
- [ ] T013 Write tests for plugin import, bad paths, review and MCP servers in `crates/shipyard-store/tests/plugins.rs` (REQ-011, REQ-012, REQ-013, REQ-014).
- [ ] T014 Implement the plugin reader and the review model in `crates/shipyard-store/src/plugins.rs` (REQ-011, REQ-012, REQ-013, REQ-014).
- [ ] T015 Write tests for child project clone, branch and commit in `crates/shipyard-git/tests/child_deploy.rs` (REQ-015, REQ-016, REQ-017, REQ-018).
- [ ] T016 Implement the child deploy in `crates/shipyard-git/src/child_deploy.rs` (REQ-015, REQ-016, REQ-017, REQ-018).
- [ ] T017 Write view tests in `src/features/settings/extensions/extensions.test.tsx` (REQ-001, REQ-002, REQ-009, REQ-012, REQ-015).
- [ ] T018 Implement the two views in `src/features/settings/extensions/` (REQ-001, REQ-002, REQ-006, REQ-008, REQ-009, REQ-012, REQ-015).
- [ ] T019 Write the keyboard, focus, label, contrast, reduced-motion and language tests in `src/features/settings/extensions/a11y.test.tsx` (REQ-019).
- [ ] T020 Implement the interface rules in `src/features/settings/extensions/` (REQ-019).
- [ ] T021 Write the end-to-end test in `e2e/extensions.spec.ts` for apply, plugin import with review, and child deploy (REQ-003, REQ-011, REQ-012, REQ-016, REQ-017).
- [ ] T022 [P] Add the changelog entry in `CHANGELOG.md` and `CHANGELOG.fr.md` (REQ-001).
- [ ] T023 Run `cd docs && npx -y @fission-ai/openspec@latest validate add-extensions --strict` and the commands of `plan.md` (REQ-001 to REQ-019).
- [ ] T024 Compare the code with the spec and update stale artifacts in `docs/openspec/changes/add-extensions/`. Close Q-050, Q-051 and Q-052 (REQ-005, REQ-014, REQ-016).

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

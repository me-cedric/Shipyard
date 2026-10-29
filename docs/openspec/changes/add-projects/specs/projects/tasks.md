# Tasks: projects

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [ ] T001 Write project file validation tests in `crates/shipyard-core/tests/project_file.rs`. Covers REQ-007, REQ-010.
- [ ] T002 Implement the project types and validation in `crates/shipyard-core/src/project.rs`. Covers REQ-007, REQ-010, REQ-017.
- [ ] T003 Write codec and registry tests in `crates/shipyard-store/tests/project_registry.rs`. Covers REQ-008, REQ-009, REQ-019.
- [ ] T004 Implement the project file codec and the registry in `crates/shipyard-store/src/project.rs`. Covers REQ-007, REQ-008, REQ-009, REQ-019.
- [ ] T005 Write clone, init and state tests with a fake remote in `crates/shipyard-git/tests/project_git.rs`. Covers REQ-002, REQ-003, REQ-004, REQ-005, REQ-006.
- [ ] T006 Implement clone, init, ignore rules and state in `crates/shipyard-git/src/project.rs`. Covers REQ-002, REQ-003, REQ-004, REQ-005, REQ-006.
- [ ] T007 Write health rule tests in `crates/shipyard-core/tests/health.rs`. Covers REQ-011, REQ-012, REQ-013, REQ-018.
- [ ] T008 Implement the health rules and fix previews in `crates/shipyard-core/src/health.rs`. Covers REQ-011, REQ-012, REQ-013, REQ-018.
- [ ] T009 Write import tests with Legacy fixture files in `crates/shipyard-store/tests/project_import.rs`. Covers REQ-014, REQ-015.
- [ ] T010 Implement the Legacy import in `crates/shipyard-store/src/project_import.rs`. Covers REQ-014, REQ-015.
- [ ] T011 Add the IPC commands in `crates/shipyard-app/src/projects.rs`, then regenerate the bindings with the project command. Covers REQ-001 to REQ-017.
- [ ] T012 Write view tests in `src/features/projects/projects.test.tsx`. Covers REQ-001, REQ-006, REQ-009, REQ-011, REQ-013, REQ-016, REQ-019.
- [ ] T013 Implement first run, the switcher, Settings / Project, Settings / Health and the status dot in `src/features/projects/`. Covers REQ-001, REQ-006, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013, REQ-016, REQ-018, REQ-019.
- [ ] T014 [P] Add French and English keys in `src/i18n/` for `projects`. Covers REQ-016.
- [ ] T015 Write the end-to-end test in `e2e/projects.spec.ts`. Covers REQ-001, REQ-006, REQ-012.
- [ ] T016 Add one entry to `CHANGELOG.md` and `CHANGELOG.fr.md`.
- [ ] T017 Run the validation commands from `plan.md`.
- [ ] T018 Compare the code with `spec.md` and update stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

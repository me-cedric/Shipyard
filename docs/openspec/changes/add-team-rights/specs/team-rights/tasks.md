# Tasks: team-rights

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Owner decision on ADR 0019 and Q-144 to Q-151. Amend rules 3.1 and 3.2 of `docs/openspec/constitution.md`.
- [ ] T002 Role table, overrides, narrowing and identity match in `crates/shipyard-core/src/rights.rs`, with `crates/shipyard-core/tests/rights.rs`. Covers REQ-003 to REQ-006.
- [ ] T003 New fields of `Member` in `crates/shipyard-core/src/work.rs` and the health findings for an unknown role or right. Covers REQ-001, `work` REQ-003.
- [ ] T004 Identity, team file of the default branch, warning, right check and audit log in `crates/shipyard-app/src/rights.rs`, with tests. Covers REQ-002, REQ-003, REQ-010.
- [ ] T005 Replace `refuse_read_only` with the right check in each write command of `crates/shipyard-app/src/`, and add it to `approve`, `approve_plan`, `automation_save`, the workflow saves and `project_overrides_save`. One refusal test for each right. Covers REQ-007, `projects` REQ-009, REQ-010.
- [ ] T006 The run keeps its member, and a write without the right waits in the Inbox, in `crates/shipyard-engine/src/run_engine.rs` and `crates/shipyard-app/src/factory.rs`, with tests. Covers REQ-009.
- [ ] T007 The right check in each write tool of `crates/shipyard-mcp/src/outside.rs`, with tests; `docs/api/shipyard-mcp.yaml`. Covers REQ-007.
- [ ] T008 `pnpm ipc:gen`, and the mocks in `src/lib/ipc/mock.ts` and `src/lib/ipc/mock-factory.ts`.
- [ ] T009 The rights hook in `src/lib/rights/`, the off controls with their reason in each view, EN and FR, with tests. Covers REQ-008, REQ-017.
- [ ] T010 Roles, first tab and sidebar order in `src/lib/prefs/prefs.tsx` and `src/features/shell/spaces.ts`; remove the hiding by role. Covers REQ-013, `shell` REQ-009, REQ-016.
- [ ] T011 [P] Role panels in `src/features/home/`, with tests. Covers REQ-012.
- [ ] T012 [P] Inbox routing and the view "Everyone" in `src/features/home/`, with tests. Covers REQ-014.
- [ ] T013 Guided setup, join request, migration proposal and audit tail in `src/features/work/`; remove `ProfilesCard` from `src/features/settings/`. Covers REQ-011, REQ-015, REQ-016.
- [ ] T014 [P] E2E path in `e2e/team.spec.ts`: solo project, add two members, an unknown person reads and cannot save.
- [ ] T015 [P] Guide pages, `docs/designs/screens.json` and its pictures, `docs/plan/MASTER-PLAN.md` sections 5.8 and 6, the test plans `team-rights.feature`, `shell.feature`, `projects.feature`, `work.feature`, changelog lines.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

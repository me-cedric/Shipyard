# Tasks: onboarding

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 `tourSeen` and `permissionsAsked` in `crates/shipyard-store/src/prefs.rs`, with a test. Covers REQ-001.
- [x] T002 `crates/shipyard-app/src/permissions.rs`: the list, the ask and the System Settings addresses for each OS, with tests; three commands; `pnpm ipc:gen`; the mocks. Covers REQ-006, REQ-007, REQ-008.
- [x] T003 Help / Replay the tour in `crates/shipyard-app/src/shell/menu.rs` and the palette action in `src/features/shell/actions.ts`. Covers REQ-004.
- [x] T004 The tour and the permissions list in `src/features/onboarding/`, EN and FR, with tests; mount in the shell; the section in Settings / Me. Covers REQ-001 to REQ-005, REQ-009, REQ-010.
- [x] T005 `e2e/onboarding.spec.ts`: skip, finish, replay and the permissions list.
- [x] T006 Guide (EN, FR), `screens.json`, the screenshot, the test plan, the changelog lines.
- [x] T007 `src/features/onboarding/checklist.tsx` (first `setup.tsx`, replaced by the change `update-ux-declutter`): the Get started items, the actions, the Home / Today card and the Settings / Me section; step rows in the tour; anchors `tools` and `tiers`; the `project` form intent; EN, FR, DE, ES; tests and `e2e/onboarding.spec.ts`. Covers REQ-011 to REQ-013.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

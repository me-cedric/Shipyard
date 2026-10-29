# Tasks: shell

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [ ] T001 Write route and role-home tests in `src/features/shell/routes.test.tsx`. REQ-001, REQ-002, REQ-009, REQ-016.
- [ ] T002 Implement the routes, the sidebar and the role-home map in `src/features/shell/`. REQ-001, REQ-002, REQ-009, REQ-016.
- [ ] T003 Write action registry and palette tests in `src/features/shell/palette.test.tsx`. REQ-005, REQ-012, REQ-013.
- [x] T004 Implement the action registry, the palette, the native menu and the context menus in `src/features/shell/` and `crates/shipyard-app/src/shell/menu.rs`. REQ-005, REQ-012, REQ-013. The context menus are `src/ui/molecules/context-menu.tsx` and the one table in `src/lib/menus/`. The native menu items show no accelerator: the webview handles the shortcuts.
- [ ] T005 Write inspector and backlink tests in `src/features/shell/inspector.test.tsx`. REQ-006.
- [ ] T006 Implement the inspector panel in `src/features/shell/inspector.tsx`. REQ-006.
- [ ] T007 Write status bar tests in `src/features/shell/statusbar.test.tsx`. REQ-007.
- [ ] T008 Implement the status bar in `src/features/shell/statusbar.tsx`. REQ-007.
- [ ] T009 Write event list tests in `crates/shipyard-app/src/shell/events.rs` (`cargo test -p shipyard-app`). REQ-008.
- [ ] T010 Implement the event list, the notification centre and the system notifications in `crates/shipyard-app/src/shell/events.rs` and `src/features/shell/notifications.tsx`. REQ-008. Done except: the list lives in the UI (`src/lib/notifications/`, `src/features/shell/events.ts`) and the Rust side is the `notify_os` command only. The sources today are the update check, a failed sync and a moved remote head. No approval or question source exists yet, and Settings / Me does not choose the sources.
- [x] T011 Write Home tests in `src/features/home/home.test.tsx`. REQ-003, REQ-004.
- [ ] T012 Implement Inbox, My work and Activity in `src/features/home/`. REQ-003, REQ-004.
- [ ] T013 Write Settings / Me and language tests in `src/features/settings/me/me.test.tsx`. REQ-010, REQ-011.
- [ ] T014 Implement Settings / Me and the language switch in `src/features/settings/me/` and `src/lib/i18n/`. REQ-010, REQ-011.
- [x] T015 [P] Write update check and last-view tests in `crates/shipyard-app/src/shell/prefs.rs` (`cargo test -p shipyard-app`). REQ-014, REQ-015. The update check tests are in `crates/shipyard-app/src/shell/update.rs`.
- [ ] T016 Implement the update check and the last view store in `crates/shipyard-app/src/shell/prefs.rs`. REQ-014, REQ-015. Done except: the changelog sections after an update. The check reads the `releaseUrl` preference, informs and installs nothing.
- [ ] T017 Write the shell e2e (keyboard path, first run, restart) in `e2e/shell.spec.ts`. REQ-015, REQ-016, REQ-017.
- [ ] T018 Add one entry each to `CHANGELOG.md` and `CHANGELOG.fr.md`. All REQ.
- [ ] T019 Run the validation commands from `plan.md`.
- [ ] T020 Compare the code with `spec.md` and update stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

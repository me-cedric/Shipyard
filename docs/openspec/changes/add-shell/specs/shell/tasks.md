# Tasks: shell

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write route and role-home tests in `src/features/shell/routes.test.tsx`. REQ-001, REQ-002, REQ-009, REQ-016. Router and sidebar tests also live in `src/app/app.test.tsx`.
- [x] T002 Implement the routes, the sidebar and the role-home map in `src/features/shell/`. REQ-001, REQ-002, REQ-009, REQ-016. Junior mode is the role home only (Q-062).
- [x] T003 Write action registry and palette tests in `src/features/shell/palette.test.tsx`. REQ-005, REQ-012, REQ-013.
- [x] T004 Implement the action registry, the palette, the native menu and the context menus in `src/features/shell/` and `crates/shipyard-app/src/shell/menu.rs`. REQ-005, REQ-012, REQ-013. The context menus are `src/ui/molecules/context-menu.tsx` and the one table in `src/lib/menus/`. The native menu items show no accelerator: the webview handles the shortcuts.
- [x] T005 Write inspector and backlink tests in `src/features/shell/inspector.test.tsx`. REQ-006.
- [x] T006 Implement the inspector panel in `src/features/shell/inspector.tsx`. REQ-006. The code is `src/ui/organisms/inspector.tsx` and `src/features/shell/ref-detail.tsx`.
- [x] T007 Write status bar tests in `src/features/shell/statusbar.test.tsx`. REQ-007.
- [x] T008 Implement the status bar in `src/features/shell/statusbar.tsx`. REQ-007. The code is `src/features/shell/status-bar.tsx`. The runs count shows the runs in the working and needs-you lanes.
- [x] T009 Write event list tests in `crates/shipyard-app/src/shell/events.rs` (`cargo test -p shipyard-app`). REQ-008. Covered by the tests in `src/features/shell/notifications.test.tsx` (the list lives in the UI).
- [x] T010 Implement the event list, the notification centre and the system notifications in `crates/shipyard-app/src/shell/events.rs` and `src/features/shell/notifications.tsx`. REQ-008. Note: the list lives in the UI (`src/lib/notifications/`, `src/features/shell/events.ts`) and the Rust side is the `notify_os` command only. The sources today are the update check, a failed sync and a moved remote head. The preference `notifyOff` (sources that do not notify, default none) is in `shipyard-store` `Prefs` with the `EventSource` list. The Rust side needs nothing more than `notify_os`. The approval, question and run sources and the switches in Settings / Me for `notifyOff` are done: `push` skips a source in `notifyOff` for the centre and the system.
- [x] T011 Write Home tests in `src/features/home/home.test.tsx`. REQ-003, REQ-004.
- [x] T012 Implement Inbox, My work and Activity in `src/features/home/`. REQ-003, REQ-004. My work and Activity do not show pinned tiles yet (`add-knowledge` REQ-024).
- [x] T013 Write Settings / Me and language tests in `src/features/settings/me/me.test.tsx`. REQ-010, REQ-011.
- [x] T014 Implement Settings / Me and the language switch in `src/features/settings/me/` and `src/lib/i18n/`. REQ-010, REQ-011. The code is `src/features/settings/me.tsx`. Open: fonts, shortcuts and notification sources (Q-099).
- [x] T015 [P] Write update check and last-view tests in `crates/shipyard-app/src/shell/prefs.rs` (`cargo test -p shipyard-app`). REQ-014, REQ-015. The update check tests are in `crates/shipyard-app/src/shell/update.rs`.
- [x] T016 Implement the update check and the last view store in `crates/shipyard-app/src/shell/prefs.rs`. REQ-014, REQ-015. The check reads the `releaseUrl` preference, informs and installs nothing. `UpdateInfo.notes` holds the changelog sections after `seenVersion` (Q-098). The UI shows `notes` once in the notification centre and records `seenVersion`.
- [x] T017 Write the shell e2e (keyboard path, first run, restart) in `e2e/shell.spec.ts`. REQ-015, REQ-016, REQ-017. The e2e restart check is the vitest test in `src/features/projects/projects.test.tsx` (Q-100).
- [ ] T018 Add one entry each to `CHANGELOG.md` and `CHANGELOG.fr.md`. All REQ.
- [ ] T019 Run the validation commands from `plan.md`.
- [ ] T020 Compare the code with `spec.md` and update stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

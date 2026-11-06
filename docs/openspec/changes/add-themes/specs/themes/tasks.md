# Tasks: themes

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Theme check in `crates/shipyard-core/src/theme.rs` with tests: fields, colours, radius, font, token list. Covers REQ-003, REQ-004.
- [x] T002 Theme library and file read and write in `crates/shipyard-store/src/themes.rs` with tests: JSON line of a fault, round trip, token list same as `src/lib/themes/tokens.json`. Covers REQ-005, REQ-007, REQ-008.
- [x] T003 Theme values `oled` and `system-oled`, and the pref `customTheme`, in `crates/shipyard-store/src/prefs.rs`. Covers REQ-002.
- [x] T004 Plugin themes in `crates/shipyard-store/src/plugins.rs` and `crates/shipyard-app/src/extensions/mod.rs`, with tests in `crates/shipyard-store/tests/plugins.rs`. Covers REQ-009.
- [x] T005 Commands in `crates/shipyard-app/src/commands/themes.rs`, `pnpm ipc:gen`, mocks in `src/lib/ipc/`. Covers REQ-005 to REQ-008.
- [x] T006 [P] OLED tokens in `src/ui/tokens/tokens.css` with a contrast test in `tokens.test.ts`. Covers REQ-001.
- [x] T007 Apply a theme in `src/lib/prefs/prefs.tsx` and `src/lib/themes/`, the theme select, import, preview, export and remove in `src/features/settings/`, the shortcut cycle in `src/features/shell/actions.ts`, EN and FR, with tests. Covers REQ-002, REQ-005 to REQ-008, REQ-010.
- [x] T008 `adr:0018`, theming guide (EN, FR), sample theme, plugin sample, screens, test plan, changelog lines.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

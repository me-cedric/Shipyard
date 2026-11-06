# Tasks: languages

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 [P] German catalogue in `src/lib/i18n/de/`, typed by the English catalogue. Covers REQ-002, REQ-003.
- [x] T002 [P] Spanish catalogue in `src/lib/i18n/es/`, typed by the English catalogue. Covers REQ-002, REQ-003.
- [x] T003 Pack check in `crates/shipyard-core/src/language.rs` and library in `crates/shipyard-store/src/languages.rs`, with tests. Covers REQ-004, REQ-005, REQ-007, REQ-008.
- [x] T004 Prefs `lang` (`de`, `es`), `langPack` and the prompt language in `crates/shipyard-store/src/prefs.rs`. Covers REQ-001.
- [x] T005 Plugin packs in `crates/shipyard-store/src/plugins.rs` and `crates/shipyard-app/src/extensions/mod.rs`, with tests in `crates/shipyard-store/tests/plugins.rs`. Covers REQ-009.
- [x] T006 Commands in `crates/shipyard-app/src/commands/prefs.rs`, `pnpm ipc:gen`, mocks in `src/lib/ipc/`. Covers REQ-005, REQ-007, REQ-008.
- [x] T007 Key check, fallback and marker in `src/lib/i18n/packs.ts` and `i18n.tsx`, error sentences of a pack in `errors.ts`, with tests. Covers REQ-005, REQ-006.
- [x] T008 Language select and rows in `src/features/settings/languages.tsx`, prompts in `src/lib/assistant/prompts.ts` and `src/lib/menus/ask.ts`, the palette in `src/features/shell/actions.ts`, with tests. Covers REQ-001, REQ-005 to REQ-008, REQ-011.
- [x] T009 Guide fallback in `src/features/knowledge/manual.tsx`, `docs/guide/{de,es}/start.md`. Covers REQ-010.
- [x] T010 `adr:0021`, RAID Q-160 to Q-164, settings guide, plugin schema, screens, test plan, constitution, changelog lines.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

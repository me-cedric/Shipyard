# Plan: shell

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

Build the frame on the Shell template of `add-design-system`. Rust holds the event list, the update check and the stored last views. React holds the routes, the palette and Home. Covers REQ-001 to REQ-017.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Tauri (`shipyard-app`), React 19, TanStack Router and Query |
| Dependencies | `cmdk` for the palette, Tauri menu and notification APIs, Tauri updater. No new dependency. |
| Data/storage | Per-machine preferences and last view per project in the app data folder. Nothing in the repository. |
| APIs/contracts | Generated IPC (`tauri-specta`): event stream, preferences, update check, action registry. |
| Routing | One typed route per space and view. Role home maps a role to a route. |
| Risks | Hidden duplicate actions: the action registry holds one entry per action. Update install policy (Q-009). Tours (Q-008). |

## Affected Surfaces

- Code: `src/features/shell/`, `src/features/home/`, `src/features/settings/me/`, `src/ui/templates/`, `src/lib/i18n/`, `crates/shipyard-app/src/shell/`.
- Tests: `src/features/shell/*.test.tsx`, `src/features/home/*.test.tsx`, `cargo test -p shipyard-app`, `e2e/shell.spec.ts`.
- Docs/specs: `docs/plan/MASTER-PLAN.md` section 4, `docs/decisions/0004-seven-spaces-information-architecture.md`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Approach

1. Define the routes of the seven spaces and Settings, and the role-to-home map.
2. Build the action registry. The palette, the native menu, the context menus and the status bar read it.
3. Build the event list in `shipyard-app`. The notification centre and the system notifications read it.
4. Build Home: Inbox (questions and approvals), My work, Activity.
5. Build Settings / Me on per-machine preferences.
6. Store the last view per project. Restore it on open.
7. Add the update check and the French and English catalogues.

## Validation

```bash
cargo test -p shipyard-app
pnpm tsc --noEmit
pnpm vitest run src/features/shell
pnpm vitest run src/features/home
pnpm playwright test e2e/shell.spec.ts
cd /Users/mecedric/Documents/Projects/shipyard/docs && npx -y @fission-ai/openspec@latest validate add-shell --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

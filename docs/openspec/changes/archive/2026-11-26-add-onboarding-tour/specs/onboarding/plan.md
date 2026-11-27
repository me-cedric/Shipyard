# Plan: onboarding

Spec: [spec.md](./spec.md)
Date: 2026-11-05

## Summary

A new backend module reads and asks for the OS permissions. The preferences keep whether the tour was seen and which permissions were asked. A new feature folder holds the tour dialog and the permissions list. The shell mounts the tour, and the Help menu, the palette and Settings / Me open it again. This covers REQ-001 to REQ-010.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | `objc2-user-notifications` and `block2` for macOS only. Both are already in `Cargo.lock` through `tauri`. |
| Data/storage | `prefs.json` gets `tourSeen` (patchable) and `permissionsAsked` (written by the backend only). No SQLite change. |
| APIs/contracts | Three commands: `permissions_list`, `permissions_request(kind)`, `permissions_open_settings(kind)`. The UI sends a kind, never a URL: the backend holds the fixed System Settings addresses. Send a test reuses `notify_os`. |
| macOS notifications | `UNUserNotificationCenter` reads the state and asks. It needs a `.app` bundle: an unbundled dev build shows unknown. |
| macOS folders | A list of the folder after the click on Allow triggers the system prompt. Before the first ask, the state is not asked and no folder is read. After it, a list of each folder gives on or off with no prompt. |
| UI | The tour uses the `Dialog` organism (focus trap, Escape). The pictures use `src/ui/` icons and the colour tokens. No image file. |
| Risks | An existing install has no `tourSeen`: the tour opens once after the update (Q-138). The macOS prompt text comes from `Info.plist` usage strings. |

## Affected Surfaces

- Code: `crates/shipyard-app/src/permissions.rs`, `crates/shipyard-app/src/commands/shell.rs`, `crates/shipyard-app/src/lib.rs`, `crates/shipyard-app/src/shell/menu.rs`, `crates/shipyard-app/Info.plist`, `crates/shipyard-store/src/prefs.rs`, `src/features/onboarding/`, `src/features/shell/actions.ts`, `src/features/shell/events.ts`, `src/features/shell/app-shell.tsx`, `src/features/settings/me.tsx`, `src/lib/i18n/`.
- Tests: `permissions.rs`, `prefs.rs`, `menu.rs`, `src/features/onboarding/*.test.tsx`, `e2e/onboarding.spec.ts`.
- Docs/specs: `docs/guide/start.md` (EN, FR), `docs/designs/screens.json`, `docs/assets/screenshots/tour.png`, `docs/delivery/test-plans/onboarding.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Validation

```bash
cargo clippy -p shipyard-store -p shipyard-app --all-targets -- -D warnings
cargo test -p shipyard-store -p shipyard-app
pnpm ipc:gen
pnpm typecheck && pnpm lint
pnpm test src/features/onboarding src/features/shell src/features/settings
pnpm exec playwright test e2e/onboarding.spec.ts
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-onboarding-tour --strict
```

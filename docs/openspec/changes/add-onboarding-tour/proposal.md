# Onboarding tour and OS permissions

## Why

A new person opens Shipyard and sees the first-run page: a role and three ways to open a project. Nothing shows what Shipyard does, what to connect, or what to do next. The manual has the answers, but it is long text. The system also asks for permissions at random moments: macOS asks for the Documents folder when a person opens a project there, and the person does not know why. The owner asked for a short, visual tour at the first launch, and for one place that asks for the permissions (2026-11-05).

## What Changes

- At the first launch, a tour of six steps opens: what Shipyard does, open a project, connect the issue tracker and the code host, choose the AI tool, the permissions, and the first run on a ticket. Each step has a title, one sentence and a picture made from the icons and the colours of the app.
- The tour closes at any step. It does not open again by itself. Help / Replay the tour, the palette and Settings / Me open it again.
- The last step opens the manual. The manual stays: it holds the reference text that a tour cannot hold (Q-136).
- A permissions list shows each permission that Shipyard uses on this computer, with its state and one action: Allow, Open System Settings or Send a test. The tour shows it, and Settings / Me shows it again.
- On macOS, Shipyard asks for the notifications and for the Documents, Desktop and Downloads folders only after a click. It does not ask for Full Disk Access (Q-137).
- Each step that maps to a setting shows its state and one action: the project, the AI tool, the models, the issue tracker, the code host and the team. A Setup checklist with the same items shows on Home / Today while one is to do, and in Settings / Me.

## Impact

- Affected capability: `onboarding` (new). It extends `shell` (Help menu, palette) and `projects` (first run).
- Affected code/docs: `crates/shipyard-app/src/permissions.rs` (new), `crates/shipyard-app/src/commands/`, `crates/shipyard-store/src/prefs.rs`, `crates/shipyard-app/src/shell/menu.rs`, `src/features/onboarding/` (new), `src/features/shell/`, `src/features/settings/me.tsx`, `src/lib/i18n/`, `src/lib/ipc/mock.ts`, `docs/guide/start.md` (EN, FR), `docs/designs/screens.json`, `docs/delivery/test-plans/onboarding.feature`.
- Questions: Q-136, Q-137, Q-138.

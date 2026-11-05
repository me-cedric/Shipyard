# Themes

## Why

The owner asked for an OLED theme (deep dark, true black) and for themes that a person can import, from a file or from a plugin (2026-11-05). Teams want the look of their company, and people with an OLED screen want true black. Today Shipyard has a light and a dark theme only, and a person cannot change a colour other than the accent.

## What Changes

- An OLED theme: a true black base, surfaces that are barely lifted, and text that meets WCAG AA on each surface. The accent stays.
- The theme choice adds OLED and "System, OLED when dark". The theme shortcut cycles through Light, Dark, OLED and System.
- A theme file format in JSON, version 1. A simple level gives the base, the accent, the background, the text colour, the corner radius and the font. An advanced level gives any colour token.
- Settings / Me imports a theme file, shows a preview, adds the theme, exports the current theme and removes an imported theme.
- A plugin can contribute themes. The plugin review lists each theme, and only an accepted theme goes to the theme library.
- A theme is data: no script, no web address and no font download.

## Impact

- New capability: `themes`. It extends `design-system` (REQ-011, REQ-012) and `extensions` (REQ-011, REQ-012).
- Affected code: `crates/shipyard-core/src/theme.rs`, `crates/shipyard-store/src/{themes,prefs,plugins}.rs`, `crates/shipyard-app/src/commands/themes.rs`, `src/ui/tokens/tokens.css`, `src/lib/prefs/`, `src/lib/themes/`, `src/features/settings/`, `src/features/shell/actions.ts`, `src/lib/i18n/`, `src/lib/ipc/`.
- Affected docs: ADR 0018, `docs/guide/theming.md` (EN, FR), `docs/guide/settings.md` (EN, FR), `examples/theme-sample/`, `examples/plugin-sample/`, `docs/designs/screens.json`, `docs/delivery/test-plans/themes.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

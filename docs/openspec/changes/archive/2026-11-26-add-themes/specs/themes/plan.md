# Plan: themes

Spec: [spec.md](./spec.md)
Date: 2026-11-05

## Summary

The OLED theme is one more token block in `tokens.css`. A theme file is checked in the domain crate, read and kept in the app data folder by the store, and applied by the view as CSS variables on the root element. A plugin lists themes in its manifest, and the review gives one item for each. This covers REQ-001 to REQ-010.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. |
| Data/storage | `<app data>/themes/<id>.json`, one file per theme. The pref `customTheme` holds the id of the current theme. |
| APIs/contracts | Commands `themeList`, `themeRead`, `themeAdd`, `themeRemove`, `themeExport`. The plugin item kind `theme`. The theme values `oled` and `system-oled`. |
| Format | `adr:0018`: JSON, version 1. The token list is `src/lib/themes/tokens.json`, read by the view and by a test of the store. |
| Risks | A value reaches CSS: only hex colours and colour functions with numbers pass, so no `url()` and no `var()`. With high contrast on, only the radius of a theme applies. |

## Affected Surfaces

- Code: `crates/shipyard-core/src/theme.rs`, `crates/shipyard-store/src/{themes,prefs,plugins}.rs`, `crates/shipyard-app/src/commands/themes.rs`, `crates/shipyard-app/src/extensions/mod.rs`, `src/ui/tokens/tokens.css`, `src/lib/themes/`, `src/lib/prefs/prefs.tsx`, `src/features/settings/{me,themes}.tsx`, `src/features/shell/actions.ts`, `src/lib/i18n/`, `src/lib/ipc/`.
- Tests: `theme.rs`, `themes.rs`, `crates/shipyard-store/tests/plugins.rs`, `src/ui/tokens/tokens.test.ts`, `src/features/settings/themes.test.tsx`.
- Docs/specs: `adr:0018`, `docs/guide/theming.md` (EN, FR), `docs/guide/settings.md` (EN, FR), `examples/theme-sample/`, `examples/plugin-sample/`, `docs/designs/screens.json`, `docs/delivery/test-plans/themes.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Validation

```bash
cargo test -p shipyard-core -p shipyard-store -p shipyard-app
cargo clippy -p shipyard-core -p shipyard-store -p shipyard-app --all-targets -- -D warnings
pnpm ipc:gen && pnpm typecheck && pnpm lint
pnpm test src/ui/tokens src/features/settings src/features/shell src/lib
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-themes --strict
```

# Plan: languages

Spec: [spec.md](./spec.md)
Date: 2026-11-06

## Summary

German and Spanish are two more catalogues typed by the English catalogue, so a missing key fails the typecheck. A pack is checked in two places: the domain crate checks the file (fields, code, text only, size), and the view checks each key against the English base, which only the view knows. The store keeps packs in the app data folder. The view lays a pack over English. A plugin lists packs in its manifest, as for themes. This covers REQ-001 to REQ-011.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. |
| Data/storage | `<app data>/languages/<code>.json`, one file per pack. The pref `lang` gains `de` and `es`; the pref `langPack` holds the code of the current pack. |
| APIs/contracts | Commands `languageList`, `languageRead`, `languageAdd`, `languageRemove`, `languageExport`. The plugin item kind `language`. The prompt language values `de` and `es`. |
| Format | ADR 0021: JSON, version 1, a flat map of keys. Errors are `error.<code>`, action labels are `action.<kind>`. |
| Risks | A text reaches the view: React shows it as text, so no markup runs. A pack cannot replace a built-in language. Dates and numbers keep the English format with a pack (Q-162). |

## Affected Surfaces

- Code: `crates/shipyard-core/src/language.rs`, `crates/shipyard-store/src/{languages,prefs,plugins}.rs`, `crates/shipyard-app/src/commands/prefs.rs`, `crates/shipyard-app/src/extensions/mod.rs`, `src/lib/i18n/`, `src/lib/assistant/prompts.ts`, `src/lib/menus/ask.ts`, `src/features/settings/`, `src/features/shell/actions.ts`, `src/features/assistant/ask-menu.tsx`, `src/features/knowledge/manual.tsx`, `src/lib/ipc/`.
- Tests: `language.rs`, `languages.rs`, `prefs.rs`, `crates/shipyard-store/tests/plugins.rs`, `src/lib/i18n/{i18n.test.tsx,errors.test.ts,packs.test.ts}`, `src/features/settings/languages.test.tsx`, `e2e/smoke.spec.ts`.
- Docs/specs: ADR 0021, `docs/guide/{de,es}/start.md`, `docs/guide/settings.md` (EN, FR), plugin manifest schema, `docs/designs/screens.json`, `docs/delivery/test-plans/languages.feature`, constitution rule 4.4, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Validation

```bash
cargo test -p shipyard-core -p shipyard-store -p shipyard-app
cargo clippy -p shipyard-core -p shipyard-store -p shipyard-app --all-targets -- -D warnings
pnpm ipc:gen && pnpm typecheck && pnpm lint
pnpm test src/lib src/features/settings
pnpm exec playwright test e2e/smoke.spec.ts
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-languages --strict
```

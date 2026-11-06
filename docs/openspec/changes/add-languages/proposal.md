# Languages

## Why

The owner asked for more app languages, from the main languages of the world, starting with German and Spanish, and for a way to add translations with plugins (2026-11-06). Shipyard serves many profiles, often non-technical, in many countries. Today the app speaks English and French only, and a team cannot add a language without a change to the code.

## What Changes

- German and Spanish ship as complete built-in languages, next to English and French. The type of the English catalogue makes a missing key fail the build.
- The assistant prompts and the prompt language choice offer the four built-in languages.
- A language pack format in JSON, version 1: a code, a name and a flat map of message keys to text. A pack is data: no script, no markup, no web address.
- Settings / Me imports a pack from a file, checks each key against the English base, adds the pack and selects it, exports the English base as the start of a new pack, and removes a pack.
- A text that a pack does not translate shows in English. A switch marks each such text, so a translator sees what is left.
- A plugin can contribute language packs. The plugin review lists each pack, and only an accepted pack goes to the language library.
- The user guide has its start page in German and Spanish. A page with no file in a language shows the English page.
- No other built-in language now (Q-163): a built-in language must stay complete, and packs cover the others.

## Impact

- New capability: `languages`. It changes `shell` REQ-011 and extends `extensions` (plugin items) like `themes` REQ-009.
- Affected code: `crates/shipyard-core/src/language.rs`, `crates/shipyard-store/src/{languages,prefs,plugins}.rs`, `crates/shipyard-app/src/commands/prefs.rs`, `crates/shipyard-app/src/extensions/mod.rs`, `src/lib/i18n/` (`de/`, `es/`, `packs.ts`, `i18n.tsx`, `errors.ts`), `src/lib/assistant/prompts.ts`, `src/lib/menus/ask.ts`, `src/features/settings/{me,languages}.tsx`, `src/features/settings/extensions/extensions.tsx`, `src/features/shell/actions.ts`, `src/features/assistant/ask-menu.tsx`, `src/features/knowledge/manual.tsx`, `src/lib/ipc/`.
- Affected docs: `adr:0021`, `docs/guide/de/start.md`, `docs/guide/es/start.md`, `docs/guide/settings.md` (EN, FR), `examples/plugin-sample/plugin-manifest.schema.json`, `docs/designs/screens.json`, `docs/delivery/test-plans/languages.feature`, `docs/openspec/constitution.md` (rule 4.4), `CHANGELOG.md`, `CHANGELOG.fr.md`.
- The language of project documents is a different setting (the new project creator). This change is about the language of the interface only.

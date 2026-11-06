# Spec: languages

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:add-languages`

### Goal

A person uses Shipyard in English, French, German or Spanish, or installs a language pack from a file or a plugin. A translator starts a pack from the English base and sees each text that is left to translate.

### Why

Shipyard has English and French only. Teams in other countries need the app in their language, and a team must add a language without a change to the code.

### Users And Scenarios

- PM in Munich: picks German in Settings / Me, and every screen, error and assistant prompt is German.
- BA in Madrid: picks Spanish, and the guide opens on a Spanish start page.
- Functional lead in São Paulo: imports the Portuguese pack that a colleague sent, sees how many texts it translates, then adds it.
- Architect: exports the English base, gives it to a translator, and ships the result in the team plugin.
- Translator: turns on the marker and sees each text that the pack does not translate yet.
- Developer, QA, junior: use the same choice. No role loses a language.

### Requirements

- REQ-001: The language choice in Settings / Me SHALL offer English, French, German and Spanish, then each installed language pack. The choice SHALL apply without a restart and SHALL stay after a restart. The prompt language choice SHALL offer the four built-in languages.
- REQ-002: Each built-in language SHALL have every message key of English and no other key, with the same placeholders and no empty text. A missing key SHALL fail the build.
- REQ-003: Each built-in language SHALL use one term for each concept: issue tracker, code host, AI tool, agent, run, spec, ticket and the space names. Product names, code, paths and commands SHALL stay as they are.
- REQ-004: A language pack SHALL be JSON with the format version 1, a language code, a name and a flat map of message keys to text. A pack SHALL be data only: the system SHALL refuse an unknown field, a value that is not text, a code of a built-in language and a file larger than 2 MB. The view SHALL show a text as text, never as markup.
- REQ-005: The system SHALL import a pack from a file. It SHALL refuse a key that is not in the English base and a text whose placeholders differ from English, SHALL list each fault, and SHALL save nothing when a fault exists. Without a fault, it SHALL show the number of translated texts, and Add SHALL save the pack in the library of the machine and select it.
- REQ-006: A text that the pack does not translate SHALL show in English. The person SHALL turn on a marker that shows each such text with a mark. The marker SHALL not stay after a restart.
- REQ-007: The system SHALL export the English base as a pack file: every message key with its English text, the error sentences and the action labels.
- REQ-008: The person SHALL remove an installed pack. When it is the current language, English SHALL apply.
- REQ-009: A plugin MAY list language packs. The plugin review SHALL list each pack as an item, a pack SHALL pass the same file check as a file, only an accepted pack SHALL go to the library, and a different pack with the same code SHALL stay. The view SHALL show English for a key of a pack that is not in the English base or whose placeholders differ.
- REQ-010: The user guide SHALL show the page of the current language when it exists, else the English page. The start page SHALL exist in German and Spanish.
- REQ-011: The language rows SHALL work by keyboard, show a focus ring and labels for assistive technology.

### Non-Goals

- A translation editor in the app. A translator edits the JSON file.
- A machine translation.
- A pack that replaces a built-in language. A team that wants other words opens a change.
- Other built-in languages now (Q-163).
- Dates and numbers in the format of a pack language (Q-162).
- The language of project documents. It is a setting of the new project creator.

### Acceptance Criteria

- [x] The choice offers the four languages and each pack, and German and Spanish apply. Test: `src/features/settings/languages.test.tsx`, `e2e/smoke.spec.ts`.
- [x] German and Spanish have every key, the same placeholders and no empty text. Test: `src/lib/i18n/i18n.test.tsx`, `src/lib/i18n/errors.test.ts`.
- [x] A pack with a script field, a nested value or a built-in code fails the file check. Test: `crates/shipyard-core/src/language.rs`, `crates/shipyard-store/src/languages.rs`.
- [x] An unknown key and other placeholders are refused, and nothing is saved. Test: `src/lib/i18n/packs.test.ts`, `src/features/settings/languages.test.tsx`.
- [x] A missing text shows in English, and the marker shows it. Test: `src/lib/i18n/packs.test.ts`, `src/features/settings/languages.test.tsx`.
- [x] Export gives the English base, and remove of the current pack applies English. Test: `src/features/settings/languages.test.tsx`.
- [x] A plugin pack shows in the review and only an accepted pack goes to the library. Test: `crates/shipyard-store/tests/plugins.rs`.
- [x] The language and the pack code persist. Test: `crates/shipyard-store/src/prefs.rs`.

### Links

- Consumes: `shell` REQ-011 (language), `extensions` (plugin import and review), `themes` REQ-009 (the pattern of a library item from a plugin), ADR 0018 (the pattern of a data-only file).
- Produces: ADR 0021 (language pack format).
- Screen: SCR-024

### Existing References

- Existing code/docs/specs: `src/lib/i18n/`, `crates/shipyard-store/src/prefs.rs`, `crates/shipyard-store/src/plugins.rs`, `docs/openspec/specs/shell/spec.md`, `docs/openspec/specs/extensions/spec.md`.
- Supersedes or extends: changes `shell` REQ-011, extends `extensions`.

### Clarifications

- Q-160 What does a plugin pack with an unknown key do?: open. Until the answer, the backend checks the file and the view ignores an unknown key when it loads the pack.
- Q-161 Which form of address do German and Spanish use?: open. Until the answer, German uses "Sie" and Spanish uses "tú".
- Q-162 Which format do dates and numbers use with a pack?: open. Until the answer, the English format.
- Q-163 Which other languages ship built in?: open. Until the answer, none.
- Q-164 Who reviews German and Spanish?: open. Until the answer, they ship without a native-speaker review.

## ADDED Requirements

### Requirement: REQ-001 Language choice

The language choice in Settings / Me SHALL offer English, French, German and Spanish, then each installed language pack. The choice SHALL apply without a restart and SHALL stay after a restart. The prompt language choice SHALL offer the four built-in languages.

#### Scenario: Pick German
- GIVEN the language is English
- WHEN the person picks German
- THEN the sidebar, the settings and the menus show German

#### Scenario: Pick a pack
- GIVEN the Portuguese pack is installed
- WHEN the person picks Português
- THEN the texts of the pack show and the page language is pt

### Requirement: REQ-002 Complete built-in languages

Each built-in language SHALL have every message key of English and no other key, with the same placeholders and no empty text. A missing key SHALL fail the build.

#### Scenario: Missing key
- GIVEN a new English key with no German text
- WHEN the build runs
- THEN the typecheck fails

### Requirement: REQ-003 One term per concept

Each built-in language SHALL use one term for each concept: issue tracker, code host, AI tool, agent, run, spec, ticket and the space names. Product names, code, paths and commands SHALL stay as they are.

#### Scenario: Code host in German
- GIVEN the language is German
- WHEN a screen names the code host
- THEN it says "Code-Plattform"

### Requirement: REQ-004 Pack file

A language pack SHALL be JSON with the format version 1, a language code, a name and a flat map of message keys to text. A pack SHALL be data only: the system SHALL refuse an unknown field, a value that is not text, a code of a built-in language and a file larger than 2 MB. The view SHALL show a text as text, never as markup.

#### Scenario: Script field
- GIVEN a pack file with a field "script"
- WHEN the person imports it
- THEN the import lists the unknown field and saves nothing

#### Scenario: Built-in code
- GIVEN a pack file with the code fr
- WHEN the person imports it
- THEN the import says that fr ships with the app

### Requirement: REQ-005 Import from a file

The system SHALL import a pack from a file. It SHALL refuse a key that is not in the English base and a text whose placeholders differ from English, SHALL list each fault, and SHALL save nothing when a fault exists. Without a fault, it SHALL show the number of translated texts, and Add SHALL save the pack in the library of the machine and select it.

#### Scenario: Unknown key
- GIVEN a pack with the key common.gone
- WHEN the person imports it
- THEN the dialog lists "common.gone: not a message key" and offers no Add

#### Scenario: Add
- GIVEN a pack with no fault
- WHEN the person imports it and clicks Add
- THEN the pack is in the library and is the current language

### Requirement: REQ-006 English fallback and marker

A text that the pack does not translate SHALL show in English. The person SHALL turn on a marker that shows each such text with a mark. The marker SHALL not stay after a restart.

#### Scenario: Missing text
- GIVEN a pack that does not translate "Import language"
- WHEN the person turns on the marker
- THEN the button shows "⟦Import language⟧"

### Requirement: REQ-007 Export the English base

The system SHALL export the English base as a pack file: every message key with its English text, the error sentences and the action labels.

#### Scenario: Start a pack
- GIVEN Settings / Me
- WHEN the person exports English
- THEN the file holds each key with its English text and passes the file check

### Requirement: REQ-008 Remove a pack

The person SHALL remove an installed pack. When it is the current language, English SHALL apply.

#### Scenario: Remove the current pack
- GIVEN the current language is the Portuguese pack
- WHEN the person removes it
- THEN English applies and the library is empty

### Requirement: REQ-009 Plugin packs

A plugin MAY list language packs. The plugin review SHALL list each pack as an item, a pack SHALL pass the same file check as a file, only an accepted pack SHALL go to the library, and a different pack with the same code SHALL stay. The view SHALL show English for a key of a pack that is not in the English base or whose placeholders differ.

#### Scenario: Wrong placeholders
- GIVEN a plugin pack whose text for a key has other placeholders than English
- WHEN the pack is the current language
- THEN that text shows in English

#### Scenario: Accept a pack
- GIVEN a plugin that lists the pack pt
- WHEN the person accepts the item in the review
- THEN the pack is in the language library and not in the project

#### Scenario: Bad pack
- GIVEN a plugin whose pack has a nested value
- WHEN the person opens the plugin
- THEN the review names the pack file and nothing is written

### Requirement: REQ-010 Guide pages

The user guide SHALL show the page of the current language when it exists, else the English page. The start page SHALL exist in German and Spanish.

#### Scenario: Page with no translation
- GIVEN the language is Spanish
- WHEN the person opens the Code page of the guide
- THEN the English page shows

### Requirement: REQ-011 Accessible rows

The language rows SHALL work by keyboard, show a focus ring and labels for assistive technology.

#### Scenario: Keyboard
- GIVEN Settings / Me
- WHEN the person tabs to Import language and presses Enter
- THEN the file picker opens

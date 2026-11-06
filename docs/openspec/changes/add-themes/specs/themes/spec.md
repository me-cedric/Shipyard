# Spec: themes

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-05
Change: `change:add-themes`

### Goal

A person picks an OLED theme with true black, or imports a theme from a file or a plugin, sees it before it applies, exports the current theme and removes an imported one.

### Why

Shipyard has a light and a dark theme only. People with an OLED screen want true black, and teams want the colours of their company without a change to the code.

### Users And Scenarios

- Developer: works at night on an OLED laptop and picks OLED, or "System, OLED when dark".
- PM: imports the company theme that the architect sent as a file, sees the preview, then adds it.
- Architect: exports the current theme as an example, changes the accent and three tokens, and ships it in the team plugin.
- Junior: reads the theming guide to learn which token changes which part of the screen.
- QA, BA, functional lead: use the same choice in Settings / Me. No role loses a theme.

### Requirements

- REQ-001: The system SHALL provide an OLED theme: the base surface is black (`#000`), each raised surface is lifted by a small step, text meets WCAG AA (4.5:1) on each surface, and the accent stays the same as in the dark theme.
- REQ-002: The theme choice SHALL offer Light, Dark, OLED, System, and System with OLED when the system is dark. The theme shortcut SHALL cycle Light, Dark, OLED, System.
- REQ-003: A theme file SHALL be JSON with the format version 1, an id, a name and a base (light, dark or oled). The simple level SHALL give an accent, a background, a text colour, a corner radius and a font. The advanced level SHALL give a value for any colour token of the token list.
- REQ-004: A theme SHALL be data only. A colour SHALL be a hex colour or a CSS colour function with numbers. A font SHALL be one of the font stacks of the machine. The system SHALL refuse a web address, a variable, a script and an unknown field or token.
- REQ-005: The system SHALL import a theme from a file. It SHALL list each fault with its field, or the line for a JSON fault, and SHALL save nothing when a fault exists.
- REQ-006: The system SHALL show a preview of an imported theme before it applies. Add SHALL save the theme in the library of the machine and select it. Cancel SHALL change nothing.
- REQ-007: The system SHALL export the current theme as a theme file. An export that the system imports again SHALL give the same theme.
- REQ-008: The person SHALL remove an imported theme. When it is the current theme, the base theme of the removed theme SHALL apply.
- REQ-009: A plugin MAY list themes. The plugin review SHALL list each theme as an item, a theme SHALL pass the same checks as a file, and only an accepted theme SHALL go to the library.
- REQ-010: The theme rows SHALL work by keyboard, show a focus ring and labels for assistive technology, and show French and English.

### Non-Goals

- A theme editor in the app. A person edits the JSON file.
- A downloaded font, a picture or any web address in a theme.
- A theme for the terminal or the code editor.
- A project theme file in the repository. The project override of `projects` REQ-010 stays the one project setting.
- A contrast check of an imported theme (Q-140).

### Acceptance Criteria

- [x] The OLED surface 0 is black, and text tokens meet 4.5:1 on each surface. Test: `src/ui/tokens/tokens.test.ts`.
- [x] The theme select offers five themes and each imported theme, and the shortcut cycles four. Test: `src/features/settings/themes.test.tsx`.
- [x] A valid file reads, and a file with a web address, an unknown token or a bad colour gives each fault. Test: `crates/shipyard-core/src/theme.rs`, `crates/shipyard-store/src/themes.rs`.
- [x] Import shows the preview, Add selects the theme, Cancel saves nothing. Test: `src/features/settings/themes.test.tsx`.
- [x] Export then import gives the same theme. Test: `crates/shipyard-store/src/themes.rs`.
- [x] Remove of the current theme applies its base. Test: `src/features/settings/themes.test.tsx`.
- [x] A plugin theme shows in the review and only an accepted theme goes to the library. Test: `crates/shipyard-store/tests/plugins.rs`.
- [x] The theme rows work by keyboard with labels, in French and English, and the OLED theme passes axe. Test: `src/features/settings/themes.test.tsx`, `e2e/design-system.spec.ts`.

### Links

- Consumes: `design-system` REQ-001 (tokens), REQ-011 (themes), REQ-012 (high contrast); `extensions` REQ-011, REQ-012 (plugin import and review); `adr:0014` (visual language v2).
- Produces: `adr:0018` (theme file format), the theming guide.
- Screen: SCR-019

### Existing References

- Existing code/docs/specs: `src/ui/tokens/tokens.css`, `src/lib/prefs/prefs.tsx`, `crates/shipyard-store/src/plugins.rs`, `docs/openspec/specs/design-system/spec.md`, `docs/openspec/specs/extensions/spec.md`.
- Supersedes or extends: extends `design-system` and `extensions`.

### Clarifications

- Q-139 Which theme wins when the project sets a theme and the person picked an imported theme?: the project theme wins, as for each project override. The imported theme applies again in a project with no override.
- Q-140 Does the import refuse a theme with low contrast?: open. Until the answer, the preview shows the theme and the person decides.

## ADDED Requirements

### Requirement: REQ-001 OLED theme

The system SHALL provide an OLED theme: the base surface is black (`#000`), each raised surface is lifted by a small step, text meets WCAG AA (4.5:1) on each surface, and the accent stays the same as in the dark theme.

#### Scenario: Pick OLED
- GIVEN the dark theme
- WHEN the person picks OLED
- THEN the base surface is black and the accent does not change

#### Scenario: Text contrast
- GIVEN the OLED theme
- WHEN a reviewer measures the text tokens on each surface
- THEN each pair is 4.5:1 or more

### Requirement: REQ-002 Theme choice

The theme choice SHALL offer Light, Dark, OLED, System, and System with OLED when the system is dark. The theme shortcut SHALL cycle Light, Dark, OLED, System.

#### Scenario: System with OLED
- GIVEN the choice "System, OLED when dark"
- WHEN the system changes to dark
- THEN the OLED theme applies

#### Scenario: Shortcut
- GIVEN the dark theme
- WHEN the person presses the theme shortcut
- THEN the OLED theme applies

### Requirement: REQ-003 Theme file

A theme file SHALL be JSON with the format version 1, an id, a name and a base (light, dark or oled). The simple level SHALL give an accent, a background, a text colour, a corner radius and a font. The advanced level SHALL give a value for any colour token of the token list.

#### Scenario: Simple theme
- GIVEN a file with a base, an accent and a background only
- WHEN the theme applies
- THEN the accent and the surfaces follow the file and the other tokens follow the base

#### Scenario: Advanced theme
- GIVEN a file with a value for `n-11`
- WHEN the theme applies
- THEN the secondary text has that colour

### Requirement: REQ-004 Data only

A theme SHALL be data only. A colour SHALL be a hex colour or a CSS colour function with numbers. A font SHALL be one of the font stacks of the machine. The system SHALL refuse a web address, a variable, a script and an unknown field or token.

#### Scenario: Web address
- GIVEN a file with the accent `url(https://x.test/a.png)`
- WHEN the person imports it
- THEN the system refuses it and names the field `accent`

### Requirement: REQ-005 Import and faults

The system SHALL import a theme from a file. It SHALL list each fault with its field, or the line for a JSON fault, and SHALL save nothing when a fault exists.

#### Scenario: Two faults
- GIVEN a file with an unknown token `n-99` and the radius 40
- WHEN the person imports it
- THEN the system names both faults and saves nothing

#### Scenario: JSON fault
- GIVEN a file with a missing comma on line 4
- WHEN the person imports it
- THEN the fault names line 4

### Requirement: REQ-006 Preview

The system SHALL show a preview of an imported theme before it applies. Add SHALL save the theme in the library of the machine and select it. Cancel SHALL change nothing.

#### Scenario: Add
- GIVEN the preview of a valid theme
- WHEN the person clicks Add
- THEN the theme is in the theme select and it applies

#### Scenario: Cancel
- GIVEN the preview of a valid theme
- WHEN the person clicks Cancel
- THEN the library and the current theme do not change

### Requirement: REQ-007 Export

The system SHALL export the current theme as a theme file. An export that the system imports again SHALL give the same theme.

#### Scenario: Round trip
- GIVEN an imported theme that applies
- WHEN the person exports it and imports the file again
- THEN the theme is the same

### Requirement: REQ-008 Remove

The person SHALL remove an imported theme. When it is the current theme, the base theme of the removed theme SHALL apply.

#### Scenario: Remove the current theme
- GIVEN the imported theme "Harbor night" with the base dark applies
- WHEN the person removes it
- THEN the dark theme applies and the select does not show "Harbor night"

### Requirement: REQ-009 Plugin themes

A plugin MAY list themes. The plugin review SHALL list each theme as an item, a theme SHALL pass the same checks as a file, and only an accepted theme SHALL go to the library.

#### Scenario: Accept a theme
- GIVEN a plugin with the theme `harbor-night`
- WHEN the person accepts the item `theme:harbor-night` in the review
- THEN the theme is in the library and no project file is written for it

#### Scenario: Bad theme
- GIVEN a plugin whose theme has the font `https://x.test/font.woff2`
- WHEN the person imports the plugin
- THEN the import fails with the file of the theme and the field `font`

### Requirement: REQ-010 Accessibility and languages

The theme rows SHALL work by keyboard, show a focus ring and labels for assistive technology, and show French and English.

#### Scenario: Keyboard
- GIVEN the theme rows of Settings / Me
- WHEN the person uses the keyboard only
- THEN each select and button is reachable and has a label

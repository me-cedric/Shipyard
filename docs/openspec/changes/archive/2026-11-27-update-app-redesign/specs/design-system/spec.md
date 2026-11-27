# Spec: design-system (delta of update-app-redesign)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-19
Change: `change:update-app-redesign`

### Goal

The interface shows in the fonts of the new design: Geist for text and Geist Mono for ids, numbers and code.

### Why

The design source of `change:update-app-redesign` uses Geist and Geist Mono. Both fonts have an open licence, so the app can bundle them. This ends the wait for the Switzer consent of `q:Q-001`: Inter and Departure Mono leave the app.

### Requirements

- REQ-001: The type sizes SHALL be 11, 12, 13, 14, 15, 16, 17, 20, 30 and 44. The radii SHALL be 9 px (small), 12 px (control), 14 px (field) and 20 px (card). A shadow SHALL come from one of the three elevation tokens.
- REQ-003: The system SHALL use Geist for text and Geist Mono for ids, numbers and code. The app SHALL bundle both fonts and SHALL NOT load a font from the network. Each font SHALL have a system fallback.

### Non-Goals

- A change of the font setting of Setup / Me.
- A change of the colour rules or of the spacing grid of `spec:design-system#REQ-001`. The values of the new look are in `src/ui/tokens/tokens.css` and in `docs/design/visual-language-v2.md`.

### Acceptance Criteria

- [x] The text font is Geist and the mono font is Geist Mono. Test: `src/ui/tokens/tokens.test.ts`.
- [x] The radius tokens are 9 px, 12 px, 14 px and 20 px.
- [ ] The build holds the font files, and no font address points to a network host.

### Existing References

- Supersedes or extends: `spec:design-system#REQ-001`, `spec:design-system#REQ-003`.
- Question: `q:Q-001` (its answer named Inter until a consent for Switzer).

## MODIFIED Requirements

### Requirement: REQ-003 Fonts

The system SHALL use Geist for text and Geist Mono for ids, numbers and code. The app SHALL bundle both fonts and SHALL NOT load a font from the network. Each font SHALL have a system fallback.

#### Scenario: Switzer not yet licensed
- GIVEN no written consent from ITF
- WHEN the app renders text
- THEN the text font is Geist
- AND ids, numbers and code use Geist Mono

#### Scenario: Bundled fonts
- GIVEN the computer has no network
- WHEN the app renders text
- THEN the text font is Geist and the mono font is Geist Mono

### Requirement: REQ-001 Design tokens

The system SHALL define colour tokens: a 12-step neutral scale, one accent and four status colours. The system SHALL define a 4 px spacing grid and the type sizes 11, 12, 13, 14, 15, 16, 17, 20, 30 and 44. The radii SHALL be 9 px (small), 12 px (control), 14 px (field) and 20 px (card). A shadow SHALL come from one of the three elevation tokens. No component SHALL use a value outside the tokens. The accent token SHALL take the per-project value of `add-projects` REQ-019.

#### Scenario: Component uses tokens only
- GIVEN a component in the gallery
- WHEN a reviewer inspects its style
- THEN each colour, space, size and radius comes from a token
- AND each shadow comes from an elevation token

#### Scenario: Project accent
- GIVEN a project with its own accent
- WHEN that project is active
- THEN every accent use shows that colour

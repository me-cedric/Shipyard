# Spec: design-system

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-design-system`

### Goal

Give every Shipyard view one set of tokens and components. Every space looks and acts the same.

### Why

Legacy has 490 titles, 336 hints and 216 descriptions. Each page builds its own controls. The result is text load and drift. One component set applies the rules "no taglines, no helper text, no secondary labels" in one place.

### Users And Scenarios

- PM: reads boards and lists with the same rows and badges in every space.
- Architect: edits diagrams and models in the same editor frame as specs.
- Developer: scans runs and approvals by status shape and colour.
- QA: reviews test plans and questions in the same list and detail layout.
- BA: answers a question card and sees its backlinks.
- Functional lead: opens an entity in the inspector without leaving the view.
- Junior: finds the same control in the same place in every space.

### Requirements

- REQ-001: Design tokens define colour, spacing, type scale, radius and borders.
- REQ-002: Motion tokens define two durations, and motion respects the reduced-motion setting.
- REQ-003: The interface uses one text font and one mono font, with a fallback.
- REQ-004: The atoms exist: Button, IconButton, Input, Select, Checkbox, Switch, Badge, StatusDot, Avatar, Kbd, Tooltip, Skeleton.
- REQ-005: The molecules and organisms exist for every list, board, run, question, approval, ref and settings view.
- REQ-006: The templates exist: Shell, Board, List and detail, Editor, Settings.
- REQ-007: The dev build has a gallery route with one page for each atomic layer.
- REQ-008: Labels use an icon and a noun. No tagline, helper text or secondary label exists.
- REQ-009: Group headings show a count, and status uses shape and colour together.
- REQ-010: An empty state shows ghost rows and one primary action. Each view has one primary action.
- REQ-011: The interface has a light theme and a dark theme.
- REQ-012: A high-contrast option raises the contrast of text and borders.
- REQ-013: The interface has two densities.
- REQ-014: Every component has a keyboard path, a focus ring and an assistive label.
- REQ-015: Every component takes its text from the French and English catalogues.

### Non-Goals

- No landing-page or marketing components.
- No page-level layout of a space. Each space capability owns its page.
- No icon set design. The set comes from an existing library.
- No custom theme editor.

### Acceptance Criteria

- [ ] The gallery shows every token, atom, molecule, organism and template in both themes.
- [ ] No component shows a tagline, helper text or secondary label.
- [ ] Each interactive component works with the keyboard alone and shows a focus ring.
- [ ] Text and borders meet the contrast target in each theme (Q-005).
- [ ] With reduced motion on, no component animates. The indicator of an active run is static.
- [ ] The two densities change row height and text size, and nothing else.
- [ ] A French and an English build show no missing label.
- [ ] The gallery route is absent from the release build.

### Links

- Consumes: nothing.
- Produces: tokens, atoms, molecules, organisms and templates for `add-shell`, `add-design`, `add-specs`, `add-work`, `add-factory`, `add-questions-loop`, `add-delivery`, `add-code`, `add-knowledge`, `add-assistant`, `add-extensions`, `add-projects` and `add-connections`.
- `RefChip` and `BacklinkList` show the refs of `add-refs`. `QuestionCard` serves `add-questions-loop`. `ApprovalBar` and `RunStep` serve `add-factory`.

### Legacy parity

| Legacy feature | Shipyard view | REQ ids |
| --- | --- | --- |
| Themes (light, dark) | Settings / Me, theme | REQ-011 |
| Contrast preference | Settings / Me, contrast | REQ-012, REQ-014 |
| Density preference | Settings / Me, density | REQ-013 |
| Fonts preference | Settings / Me, fonts | REQ-003 |
| Reduced-motion preference | Settings / Me, reduced motion | REQ-002 |

### Existing References

- `docs/plan/MASTER-PLAN.md` section 8.
- `docs/openspec/constitution.md` section 4.
- `docs/decisions/0009-design-system-base-ui-switzer.md`
- `docs/delivery/questions/Q-001.md`

## ADDED Requirements

### Requirement: REQ-001 Design tokens

The system SHALL define colour tokens: a 12-step neutral scale, one accent and four status colours. The system SHALL define a 4 px spacing grid and the type sizes 11, 12, 13, 14, 16 and 20. The radii SHALL be 4 and 6, and borders SHALL replace shadows. No component SHALL use a value outside the tokens.

#### Scenario: Component uses tokens only
- GIVEN a component in the gallery
- WHEN a reviewer inspects its style
- THEN each colour, space, size and radius comes from a token
- AND the component has no shadow

### Requirement: REQ-002 Motion

The system SHALL define two motion durations, 120 ms and 200 ms. Motion SHALL happen only on a state change. Nothing SHALL loop except the indicator of an active run. When the system reduced-motion setting is on, the system MUST remove all motion, including the loop of the active-run indicator. The indicator then shows a static state.

#### Scenario: Reduced motion on
- GIVEN the system reduced-motion setting is on
- WHEN a panel opens
- THEN the panel appears without movement

#### Scenario: Motion on a state change
- GIVEN reduced motion is off
- WHEN a row changes state
- THEN the change animates in 120 ms or 200 ms

### Requirement: REQ-003 Fonts

The system SHALL use Switzer for text and Departure Mono for ids, numbers and code. Until ITF gives written consent for Switzer, the system SHALL use Inter for text (working assumption: Q-001, option 1). [NEEDS CLARIFICATION: Q-001 Can Shipyard bundle the Switzer font?]

#### Scenario: Switzer not yet licensed
- GIVEN no written consent from ITF
- WHEN the app renders text
- THEN the text font is Inter
- AND ids, numbers and code use Departure Mono

### Requirement: REQ-004 Atoms

The system SHALL provide the atoms Button, IconButton, Input, Select, Checkbox, Switch, Badge, StatusDot, Avatar, Kbd, Tooltip and Skeleton. A page MUST NOT define a new primitive.

#### Scenario: Atom in the gallery
- GIVEN the gallery atoms page
- WHEN a reviewer opens it
- THEN each of the twelve atoms shows with all its states

### Requirement: REQ-005 Molecules and organisms

The system SHALL provide CommandPalette, FilterBar, TicketRow, TicketCard, BoardColumn, RunStep, QuestionCard, ApprovalBar, RefChip, BacklinkList, Inspector, EditorFrame, SettingsRow and MemberRow. RefChip and BacklinkList SHALL show any ref of the shared vocabulary. RefChip SHALL have three states with distinct shapes: resolved, unresolved and broken.

#### Scenario: Ref chip
- GIVEN a ref `wi:KEY-1`
- WHEN the RefChip renders it
- THEN it shows the entity icon and the ref
- AND activating it opens the entity in the inspector

#### Scenario: Ref chip states
- GIVEN three refs: one resolved, one unresolved, one broken
- WHEN the RefChips render them
- THEN each chip shows its state with a distinct shape and colour

#### Scenario: Question card
- GIVEN an open question
- WHEN the QuestionCard renders it
- THEN it shows the question and its options
- AND it has one primary action

### Requirement: REQ-006 Templates

The system SHALL provide the templates Shell (sidebar, main area, inspector), Board, List and detail, Editor and Settings. Each space page SHALL use a template.

#### Scenario: Shell template
- GIVEN the Shell template
- WHEN it renders
- THEN it shows a sidebar, a main area and an inspector slot

### Requirement: REQ-007 Gallery route

The dev build SHALL have a gallery route with one page for each atomic layer. The release build MUST NOT include the route.

#### Scenario: Gallery in dev
- GIVEN a dev build
- WHEN a developer opens the gallery route
- THEN the page for each layer is available

#### Scenario: Gallery in release
- GIVEN a release build
- WHEN a user opens the gallery route
- THEN the app shows the not-found view

### Requirement: REQ-008 Labels

Controls SHALL carry an icon and a noun as label. A view MUST NOT show a tagline, helper text or secondary label. A tooltip SHALL show the name and the shortcut only.

#### Scenario: Tooltip content
- GIVEN an IconButton with a shortcut
- WHEN the user hovers or focuses it
- THEN the tooltip shows the name and the shortcut
- AND it shows nothing else

### Requirement: REQ-009 Headings and status

A group heading SHALL show the item count. Status SHALL use a shape and a colour together, so that colour is never the only cue.

#### Scenario: Status without colour
- GIVEN a list with the four status colours
- WHEN the list is shown in greyscale
- THEN each status stays distinct by its shape

### Requirement: REQ-010 Empty state and primary action

An empty state SHALL show ghost rows and one primary action. Each view SHALL have at most one primary action. Details SHALL open in the inspector.

#### Scenario: Empty list
- GIVEN a list with no item
- WHEN the view renders
- THEN it shows ghost rows and one primary action
- AND it shows no sentence of help

### Requirement: REQ-011 Themes

The system SHALL provide a light theme and a dark theme. The theme SHALL follow the system setting until the person chooses one.

#### Scenario: Switch theme
- GIVEN the light theme
- WHEN the person chooses the dark theme
- THEN every component renders with the dark tokens

### Requirement: REQ-012 High contrast

The system SHALL provide a high-contrast option for each theme. The option SHALL meet a higher contrast target than the default (working assumption: WCAG AA by default, AAA in high contrast; Q-005). [NEEDS CLARIFICATION: Q-005 Which contrast targets apply?]

#### Scenario: High contrast on
- GIVEN the high-contrast option is on
- WHEN a view renders
- THEN text and borders meet the high-contrast target

### Requirement: REQ-013 Densities

The system SHALL provide two densities. The default density uses a 28 px row and 13 px text. The sidebar SHALL be 48 px or 220 px wide, and the inspector 320 px wide.

#### Scenario: Change density
- GIVEN the default density
- WHEN the person chooses the compact density
- THEN row height and text size change
- AND colours and layout stay the same

### Requirement: REQ-014 Accessibility basics

Every interactive component MUST be reachable and usable with the keyboard, MUST show a visible focus ring and MUST have a label for assistive technology. Text MUST meet the contrast target in each theme.

#### Scenario: Keyboard only
- GIVEN a view in the gallery
- WHEN the user presses Tab
- THEN focus moves through each control in reading order
- AND each focused control shows a focus ring and has an assistive label

### Requirement: REQ-015 French and English

Components SHALL NOT hold fixed text. Every label SHALL come from the French and the English catalogues, and both SHALL ship together.

#### Scenario: Language switch
- GIVEN the language is French
- WHEN the person switches to English
- THEN every label of every component shows in English

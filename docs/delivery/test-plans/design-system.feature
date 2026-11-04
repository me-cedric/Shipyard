Feature: design-system

  @spec:design-system#REQ-001
  Scenario: Design tokens: Component uses tokens only
    Given a component in the gallery
    When a reviewer inspects its style
    Then each colour, space, size and radius comes from a token
    And the component has no shadow

  @spec:design-system#REQ-001
  Scenario: Design tokens: Project accent
    Given a project with its own accent
    When that project is active
    Then every accent use shows that colour

  @spec:design-system#REQ-002
  Scenario: Motion: Reduced motion on
    Given the system reduced-motion setting is on
    When a panel opens
    Then the panel appears without movement

  @spec:design-system#REQ-002
  Scenario: Motion: Motion on a state change
    Given reduced motion is off
    When a row changes state
    Then the change animates in 120 ms or 200 ms

  @spec:design-system#REQ-003
  Scenario: Fonts: Switzer not yet licensed
    Given no written consent from ITF
    When the app renders text
    Then the text font is Inter
    And ids, numbers and code use Departure Mono

  @spec:design-system#REQ-004
  Scenario: Atoms: Atom in the gallery
    Given the gallery atoms page
    When a reviewer opens it
    Then each of the twelve atoms shows with all its states

  @spec:design-system#REQ-005
  Scenario: Molecules and organisms: Ref chip
    Given a ref `wi:KEY-1`
    When the RefChip renders it
    Then it shows the entity icon and the ref
    And activating it opens the entity in the inspector

  @spec:design-system#REQ-005
  Scenario: Molecules and organisms: Ref chip states
    Given three refs: one resolved, one unresolved, one broken
    When the RefChips render them
    Then each chip shows its state with a distinct shape and colour

  @spec:design-system#REQ-005
  Scenario: Molecules and organisms: Question card
    Given an open question
    When the QuestionCard renders it
    Then it shows the question and its options
    And it has one primary action

  @spec:design-system#REQ-006
  Scenario: Templates: Shell template
    Given the Shell template
    When it renders
    Then it shows a sidebar, a main area and an inspector slot

  @spec:design-system#REQ-007
  Scenario: Gallery route: Gallery in dev
    Given a dev build
    When a developer opens the gallery route
    Then the page for each layer is available

  @spec:design-system#REQ-007
  Scenario: Gallery route: Gallery in release
    Given a release build
    When a user opens the gallery route
    Then the app shows the not-found view

  @spec:design-system#REQ-008
  Scenario: Labels: Tooltip content
    Given an IconButton with a shortcut
    When the user hovers or focuses it
    Then the tooltip shows the name and the shortcut
    And it shows nothing else

  @spec:design-system#REQ-009
  Scenario: Headings and status: Status without colour
    Given a list with the four status colours
    When the list is shown in greyscale
    Then each status stays distinct by its shape

  @spec:design-system#REQ-010
  Scenario: Empty state and primary action: Empty list
    Given a list with no item
    When the view renders
    Then it shows ghost rows and one primary action
    And it shows no sentence of help

  @spec:design-system#REQ-011
  Scenario: Themes: Switch theme
    Given the light theme
    When the person chooses the dark theme
    Then every component renders with the dark tokens

  @spec:design-system#REQ-012
  Scenario: High contrast: High contrast on
    Given the high-contrast option is on
    When a view renders
    Then text and borders meet the high-contrast target

  @spec:design-system#REQ-013
  Scenario: Densities: Change density
    Given the default density
    When the person chooses the compact density
    Then row height and text size change
    And colours and layout stay the same

  @spec:design-system#REQ-014
  Scenario: Accessibility basics: Keyboard only
    Given a view in the gallery
    When the user presses Tab
    Then focus moves through each control in reading order
    And each focused control shows a focus ring and has an assistive label

  @spec:design-system#REQ-015
  Scenario: French and English: Language switch
    Given the language is French
    When the person switches to English
    Then every label of every component shows in English

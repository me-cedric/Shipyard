Feature: themes

  @spec:themes#REQ-001
  Scenario: OLED theme: Pick OLED
    Given the dark theme
    When the person picks OLED
    Then the base surface is black and the accent does not change

  @spec:themes#REQ-001
  Scenario: OLED theme: Text contrast
    Given the OLED theme
    When a reviewer measures the text tokens on each surface
    Then each pair is 4.5:1 or more

  @spec:themes#REQ-002
  Scenario: Theme choice: System with OLED
    Given the choice "System, OLED when dark"
    When the system changes to dark
    Then the OLED theme applies

  @spec:themes#REQ-002
  Scenario: Theme choice: Shortcut
    Given the dark theme
    When the person presses the theme shortcut
    Then the OLED theme applies

  @spec:themes#REQ-003
  Scenario: Theme file: Simple theme
    Given a file with a base, an accent and a background only
    When the theme applies
    Then the accent and the surfaces follow the file and the other tokens follow the base

  @spec:themes#REQ-003
  Scenario: Theme file: Advanced theme
    Given a file with a value for `n-11`
    When the theme applies
    Then the secondary text has that colour

  @spec:themes#REQ-004
  Scenario: Data only: Web address
    Given a file with the accent `url(https://x.test/a.png)`
    When the person imports it
    Then the system refuses it and names the field `accent`

  @spec:themes#REQ-005
  Scenario: Import and faults: Two faults
    Given a file with an unknown token `n-99` and the radius 40
    When the person imports it
    Then the system names both faults and saves nothing

  @spec:themes#REQ-005
  Scenario: Import and faults: JSON fault
    Given a file with a missing comma on line 4
    When the person imports it
    Then the fault names line 4

  @spec:themes#REQ-006
  Scenario: Preview: Add
    Given the preview of a valid theme
    When the person clicks Add
    Then the theme is in the theme select and it applies

  @spec:themes#REQ-006
  Scenario: Preview: Cancel
    Given the preview of a valid theme
    When the person clicks Cancel
    Then the library and the current theme do not change

  @spec:themes#REQ-007
  Scenario: Export: Round trip
    Given an imported theme that applies
    When the person exports it and imports the file again
    Then the theme is the same

  @spec:themes#REQ-008
  Scenario: Remove: Remove the current theme
    Given the imported theme "Harbor night" with the base dark applies
    When the person removes it
    Then the dark theme applies and the select does not show "Harbor night"

  @spec:themes#REQ-009
  Scenario: Plugin themes: Accept a theme
    Given a plugin with the theme `harbor-night`
    When the person accepts the item `theme:harbor-night` in the review
    Then the theme is in the library and no project file is written for it

  @spec:themes#REQ-009
  Scenario: Plugin themes: Bad theme
    Given a plugin whose theme has the font `https://x.test/font.woff2`
    When the person imports the plugin
    Then the import fails with the file of the theme and the field `font`

  @spec:themes#REQ-010
  Scenario: Accessibility and languages: Keyboard
    Given the theme rows of Settings / Me
    When the person uses the keyboard only
    Then each select and button is reachable and has a label

Feature: languages

  @spec:languages#REQ-001
  Scenario: Language choice: Pick German
    Given the language is English
    When the person picks German
    Then the sidebar, the settings and the menus show German

  @spec:languages#REQ-001
  Scenario: Language choice: Pick a pack
    Given the Portuguese pack is installed
    When the person picks Português
    Then the texts of the pack show and the page language is pt

  @spec:languages#REQ-002
  Scenario: Complete built-in languages: Missing key
    Given a new English key with no German text
    When the build runs
    Then the typecheck fails

  @spec:languages#REQ-003
  Scenario: One term per concept: Code host in German
    Given the language is German
    When a screen names the code host
    Then it says "Code-Plattform"

  @spec:languages#REQ-004
  Scenario: Pack file: Script field
    Given a pack file with a field "script"
    When the person imports it
    Then the import lists the unknown field and saves nothing

  @spec:languages#REQ-004
  Scenario: Pack file: Built-in code
    Given a pack file with the code fr
    When the person imports it
    Then the import says that fr ships with the app

  @spec:languages#REQ-005
  Scenario: Import from a file: Unknown key
    Given a pack with the key common.gone
    When the person imports it
    Then the dialog lists "common.gone: not a message key" and offers no Add

  @spec:languages#REQ-005
  Scenario: Import from a file: Add
    Given a pack with no fault
    When the person imports it and clicks Add
    Then the pack is in the library and is the current language

  @spec:languages#REQ-006
  Scenario: English fallback and marker: Missing text
    Given a pack that does not translate "Import language"
    When the person turns on the marker
    Then the button shows "⟦Import language⟧"

  @spec:languages#REQ-007
  Scenario: Export the English base: Start a pack
    Given Settings / Me
    When the person exports English
    Then the file holds each key with its English text and passes the file check

  @spec:languages#REQ-008
  Scenario: Remove a pack: Remove the current pack
    Given the current language is the Portuguese pack
    When the person removes it
    Then English applies and the library is empty

  @spec:languages#REQ-009
  Scenario: Plugin packs: Wrong placeholders
    Given a plugin pack whose text for a key has other placeholders than English
    When the pack is the current language
    Then that text shows in English

  @spec:languages#REQ-009
  Scenario: Plugin packs: Accept a pack
    Given a plugin that lists the pack pt
    When the person accepts the item in the review
    Then the pack is in the language library and not in the project

  @spec:languages#REQ-009
  Scenario: Plugin packs: Bad pack
    Given a plugin whose pack has a nested value
    When the person opens the plugin
    Then the review names the pack file and nothing is written

  @spec:languages#REQ-010
  Scenario: Guide pages: Page with no translation
    Given the language is Spanish
    When the person opens the Code page of the guide
    Then the English page shows

  @spec:languages#REQ-011
  Scenario: Accessible rows: Keyboard
    Given Settings / Me
    When the person tabs to Import language and presses Enter
    Then the file picker opens

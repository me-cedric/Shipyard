Feature: visual-cues

  @spec:visual-cues#REQ-001
  Scenario: Product logos: Known product
    Given the product GitHub
    When its logo shows
    Then the GitHub mark draws in the text colour

  @spec:visual-cues#REQ-001
  Scenario: Product logos: Unknown product
    Given the product `acme`, which has no logo
    When its logo shows
    Then the letter A shows in a tile

  @spec:visual-cues#REQ-002
  Scenario: Logo names: Logo alone
    Given a logo with no visible name
    When a screen reader reads it
    Then it reads the product name

  @spec:visual-cues#REQ-003
  Scenario: Connection cards: Issue tracker card
    Given a Jira Cloud connection
    When Settings / Connections opens
    Then its card shows the Jira logo

  @spec:visual-cues#REQ-004
  Scenario: AI tool names: Model menu
    Given the AI tool `claude` is installed
    When the person opens the model menu of the assistant
    Then the menu shows the Claude logo and Claude Code

  @spec:visual-cues#REQ-005
  Scenario: Code host refs: GitHub pull request
    Given the ref `pr:github:42`
    When its chip shows
    Then the chip shows the GitHub logo

  @spec:visual-cues#REQ-006
  Scenario: Settings sections: Jump to a section
    Given Settings / Project is open at the top
    When the person clicks Tickets in the section list
    Then the page scrolls to the Tickets section

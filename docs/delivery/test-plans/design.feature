Feature: design

  @spec:design#REQ-001
  Scenario: Ref per artifact: Copy a ref
    Given a diagram file
    When the person uses the copy ref action
    Then the clipboard holds `diagram:` and the slug of the file

  @spec:design#REQ-001
  Scenario: Ref per artifact: Stable ref
    Given an ADR with the number 0004
    When the person edits its title
    Then the ref stays `adr:0004`

  @spec:design#REQ-002
  Scenario: Backlinks: Citation from a spec
    Given a spec that cites `adr:0004`
    When the person selects that ADR
    Then the inspector lists the spec under its group

  @spec:design#REQ-003
  Scenario: Diagrams list: Four formats
    Given one file of each format
    When the person opens Design / Diagrams
    Then the list shows four rows with their formats

  @spec:design#REQ-003
  Scenario: Diagrams list: Empty list
    Given a project with no diagram
    When the person opens Design / Diagrams
    Then the view shows ghost rows and the new diagram action

  @spec:design#REQ-004
  Scenario: Diagram open: Open
    Given a Mermaid file
    When the person selects it
    Then the EditorFrame shows the diagram

  @spec:design#REQ-004
  Scenario: Diagram open: Save
    Given a diagram that the app edits
    When the person saves
    Then the file holds the change

  @spec:design#REQ-005
  Scenario: Unreadable diagram: Corrupt file
    Given a BPMN file with invalid content
    When the person opens it
    Then the view shows an error
    And the file stays unchanged

  @spec:design#REQ-006
  Scenario: Architecture render: Live render
    Given an open model
    When the person adds an element to the text
    Then the render shows the element

  @spec:design#REQ-007
  Scenario: Architecture error: Syntax error
    Given an open model
    When the person types an invalid line
    Then the render keeps the last good view
    And the error shows with its line

  @spec:design#REQ-008
  Scenario: Decisions list: List
    Given ten ADR files
    When the person opens Design / Decisions
    Then the list shows ten rows with number, title and status

  @spec:design#REQ-009
  Scenario: New ADR: Next number
    Given ADRs 0001 to 0010
    When the person creates an ADR
    Then the new file has the number 0011 and the MADR sections

  @spec:design#REQ-010
  Scenario: Accept or reject: Accept
    Given a proposed ADR
    When the architect accepts it with a comment
    Then the file shows the status accepted, the date and the comment

  @spec:design#REQ-010
  Scenario: Accept or reject: Reject with no comment
    Given a proposed ADR
    When the architect rejects it with an empty comment
    Then the system asks for a comment and keeps the status proposed

  @spec:design#REQ-011
  Scenario: API list: List
    Given two contracts
    When the person opens Design / API
    Then the list shows two rows

  @spec:design#REQ-012
  Scenario: API read view: Read
    Given a contract with two tags
    When the person opens it
    Then the view shows two groups of endpoints

  @spec:design#REQ-012
  Scenario: API read view: Invalid contract
    Given a contract that is not valid OpenAPI
    When the person opens it
    Then the view shows the error and no endpoint

  @spec:design#REQ-013
  Scenario: API try view: Send
    Given an endpoint with a server
    When the person sends a request
    Then the view shows the response status and body

  @spec:design#REQ-013
  Scenario: API try view: Network failure
    Given a server that does not answer
    When the person sends a request
    Then the view shows the failure and no response

  @spec:design#REQ-014
  Scenario: Data models: Show tables
    Given a DBML file with three tables and two relations
    When the person opens it
    Then the view shows three tables and two relations

  @spec:design#REQ-015
  Scenario: Data error: Syntax error
    Given an open DBML model
    When the person types an invalid line
    Then the view keeps the last good tables
    And the error shows with its line

  @spec:design#REQ-016
  Scenario: Flow table: Show rows
    Given a flow table with 20 rows
    When the person opens Design / Flows
    Then the view shows 20 rows with a count in the heading

  @spec:design#REQ-017
  Scenario: Flow filters: Two filters
    Given a table with allow and deny rows on two VLANs
    When the person filters by one VLAN and by deny
    Then the view shows only the deny rows of that VLAN

  @spec:design#REQ-018
  Scenario: Flow edit: Missing field
    Given a new row with no protocol
    When the person saves it
    Then the system rejects the row and names the missing field

  @spec:design#REQ-019
  Scenario: Screens: Open a link
    Given a screen with a `.fig` link
    When the person selects the link
    Then the link opens outside the app

  @spec:design#REQ-019
  Scenario: Screens: Missing target
    Given a screen whose linked file does not exist
    When the person opens the screen
    Then the view shows the link as broken

  @spec:design#REQ-020
  Scenario: Design to code: Start from an ADR
    Given an accepted ADR
    When the person uses the design to code action
    Then `add-work` REQ-029 creates a work item that cites the ADR
    And the person sees the item that starts the run

  @spec:design#REQ-021
  Scenario: Design doc: Edit
    Given the design doc
    When the person edits and saves
    Then the file holds the new text

  @spec:design#REQ-022
  Scenario: Interface rules: Keyboard
    Given any Design view
    When the person uses the keyboard only
    Then the person reaches each action and sees a focus ring

  @spec:design#REQ-022
  Scenario: Interface rules: Language
    Given the language French
    When the person opens a Design view
    Then each label shows in French

  @spec:design#REQ-023
  Scenario: Safe save: Changed on disk
    Given an ADR that another tool changed after it opened
    When the person saves
    Then the system warns and offers to reload or to keep the version of the person

  @spec:design#REQ-023
  Scenario: Safe save: Failed write
    Given a write that fails
    When the system reports the failure
    Then the old file stays unchanged

  @spec:design#REQ-024
  Scenario: Figma tokens: Show tokens
    Given a screen with a linked Figma file
    When the person uses the extract tokens action
    Then the view shows the tokens of the file beside the tokens of the project design doc

  @spec:design#REQ-024
  Scenario: Figma tokens: No click
    Given the shown tokens
    When the person closes the view with no confirmation
    Then the token file stays unchanged

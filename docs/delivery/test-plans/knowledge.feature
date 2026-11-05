Feature: knowledge

  @spec:knowledge#REQ-001
  Scenario: Reference graph: Open the graph
    Given a project with ADRs, specs and work items
    When a person opens Knowledge / Graph
    Then the nodes show their refs and kinds and the edges show the links

  @spec:knowledge#REQ-002
  Scenario: Code graph: Switch source
    Given a project with a code graph
    When a person switches the graph source to code
    Then the same view shows files and symbols

  @spec:knowledge#REQ-002
  Scenario: Code graph: No code graph
    Given a project with no code graph
    When a person switches to code
    Then the view shows one Index action in place of the graph

  @spec:knowledge#REQ-003
  Scenario: One renderer: Agents map
    Given Factory / Agents map and Knowledge / Graph open
    When a person selects a node in each
    Then both views use the same selection, zoom and keyboard behaviour

  @spec:knowledge#REQ-004
  Scenario: Filter and focus: Filter by kind
    Given a graph with ADRs and specs
    When a person hides the kind spec
    Then no spec node shows and the other kinds stay

  @spec:knowledge#REQ-005
  Scenario: Graph selection: Select a node
    Given a graph with an ADR node
    When a person selects the node
    Then the inspector shows the ADR and its backlinks

  @spec:knowledge#REQ-006
  Scenario: Graph accessibility: Table view
    Given a graph with 40 nodes
    When a person opens the table view
    Then the table lists the 40 nodes with their links

  @spec:knowledge#REQ-007
  Scenario: Orphan and stale marks: Stale spec
    Given a spec that cites `adr:0004` and an ADR changed after the spec
    When a person opens the graph
    Then the spec node shows the stale mark

  @spec:knowledge#REQ-008
  Scenario: Explain action: Explain an ADR
    Given an open ADR
    When a person runs Explain
    Then the assistant panel opens with `adr:` as context

  @spec:knowledge#REQ-009
  Scenario: Explain answer: Cited answer
    Given a spec that cites two ADRs
    When a person explains the spec
    Then the answer cites the two `adr:` refs

  @spec:knowledge#REQ-009
  Scenario: Explain answer: No answer
    Given an entity with no text and no link
    When a person explains it
    Then the answer says that it found no source

  @spec:knowledge#REQ-010
  Scenario: Handbook: New page
    Given a handbook with three pages
    When a person creates a page
    Then the tree shows four pages and the new file exists in the repository

  @spec:knowledge#REQ-011
  Scenario: Markdown editor: Changed on disk
    Given a page that changed on disk after the person opened it
    When the person saves
    Then the system warns before it replaces the file

  @spec:knowledge#REQ-012
  Scenario: Documents: Open a document
    Given a document in the repository
    When a person opens it
    Then the editor shows it and the inspector shows its backlinks

  @spec:knowledge#REQ-013
  Scenario: Architecture dossier: Export
    Given a project with a model, two ADRs and an API contract
    When a person exports the dossier
    Then a `.docx` file holds the five sections with that content

  @spec:knowledge#REQ-014
  Scenario: Functional documentation: Sealed sheet
    Given an estimate sheet that is sealed
    When a person exports the documentation
    Then the annex lists the tasks and holds no day rate

  @spec:knowledge#REQ-015
  Scenario: Export rules: Unreadable source
    Given a data model file that cannot be read
    When a person exports the dossier
    Then the export succeeds and the data model section names the gap

  @spec:knowledge#REQ-016
  Scenario: Spreadsheet deliverable: Export a sheet
    Given a deliverable that has an `.xlsx` export
    When a person exports it
    Then a `.xlsx` file opens with its data and the cover information

  @spec:knowledge#REQ-017
  Scenario: Slides: HTML deck in a sandbox
    Given an HTML deck and a Markdown deck in the slides folder
    When a person opens the HTML deck and presses the Right arrow key
    Then the deck shows in a frame with sandbox "allow-scripts" only
    And the frame gets the key

  @spec:knowledge#REQ-017
  Scenario: Slides: Export a deck to PDF
    Given an HTML deck
    When a person clicks Export PDF and cancels the Save as dialog
    Then no file is written

  @spec:knowledge#REQ-017
  Scenario: Slides: Add a slide
    Given an HTML deck of two slides
    When a person adds a Costing slide
    Then the deck file has a third slide with the costing table

  @spec:knowledge#REQ-018
  Scenario: Slide theme: Project theme
    Given a project theme with a logo
    When a person opens two decks
    Then both show the same colours and logo

  @spec:knowledge#REQ-019
  Scenario: Present mode: Present
    Given a deck
    When a person starts the present mode and presses Escape
    Then the deck leaves the full-screen mode

  @spec:knowledge#REQ-020
  Scenario: Learn path: New member
    Given a project with a model, three ADRs and two specs
    When a junior opens Knowledge / Learn
    Then the path lists the model, the three ADRs and the two specs in that order

  @spec:knowledge#REQ-021
  Scenario: Glossary: Open a term
    Given a glossary with the term `run`
    When a person opens the term
    Then the spec that defines it opens

  @spec:knowledge#REQ-022
  Scenario: Dashboards: Move a tile
    Given a dashboard
    When a person moves a tile
    Then the file holds the new place and no commit exists

  @spec:knowledge#REQ-023
  Scenario: Tiles: Table view
    Given a chart tile
    When a person chooses Show as table
    Then the numbers of the chart show in a table

  @spec:knowledge#REQ-023
  Scenario: Tiles: Source off
    Given a tile whose source is not available
    When a person opens the dashboard
    Then the tile stays visible and greyed and names its source

  @spec:knowledge#REQ-024
  Scenario: Home widgets: Pin
    Given a tile on a dashboard
    When a person pins it
    Then Home / My work shows the tile

  @spec:knowledge#REQ-025
  Scenario: Doc entity: Resolve
    Given a handbook page
    When a ref `doc:` of the page is read
    Then the ref resolves to the page

  @spec:knowledge#REQ-026
  Scenario: Interface rules: Keyboard
    Given any Knowledge view
    When a person uses only the keyboard
    Then every action is reachable and the focus ring shows

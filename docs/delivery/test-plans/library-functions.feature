Feature: library-functions

  @spec:library-functions#REQ-001
  Scenario: Opened last keeps items: Item row
    Given a person who opened the spec Export
    When the person opens Library
    Then Opened last shows a row with the chip Spec and the name Export

  @spec:library-functions#REQ-002
  Scenario: Earlier versions and History: Restore
    Given a rules file with two earlier versions
    When the person restores the older one
    Then the file holds the old text and nothing is committed

  @spec:library-functions#REQ-002
  Scenario: Earlier versions and History: Author line
    Given a handbook page that Grace changed last
    When the person opens the page
    Then the page says Grace changed it

  @spec:library-functions#REQ-003
  Scenario: Add a file to Documents: Add a Word file
    Given the Documents page
    When the person adds `plan.docx`
    Then the folder holds `plan.docx` as a Word file

  @spec:library-functions#REQ-004
  Scenario: Slides of a Markdown deck: Speaker note
    Given a Markdown deck whose slide has a `Note:` block
    When the person opens Speaker notes
    Then the note of that slide shows

  @spec:library-functions#REQ-004
  Scenario: Slides of a Markdown deck: Export PDF
    Given a Markdown deck on macOS
    When the person selects Export PDF
    Then a PDF of the slides is written

  @spec:library-functions#REQ-005
  Scenario: Learn: Experts, Add a word and the second pill: Add a word
    Given the Learn page
    When the person adds the word Recipe with its meaning
    Then `docs/glossary.md` holds the word and the glossary shows it

  @spec:library-functions#REQ-005
  Scenario: Learn: Experts, Add a word and the second pill: Expert
    Given a team file whose member Grace has the topic Billing
    When the person opens Experts
    Then the card shows Grace with Billing

  @spec:library-functions#REQ-006
  Scenario: PDF and Markdown output of reports: Markdown
    Given a text report
    When the person picks Markdown
    Then a Markdown file is written

  @spec:library-functions#REQ-006
  Scenario: PDF and Markdown output of reports: PDF off
    Given a system other than macOS
    When the person opens the format switch
    Then the PDF choice is off

  @spec:library-functions#REQ-007
  Scenario: Reports page cards and the dossier form: Written for you
    Given a report that Ada wrote on 2026-11-18
    When the person opens Reports
    Then the row shows Ada and the date

  @spec:library-functions#REQ-007
  Scenario: Reports page cards and the dossier form: Dossier asks first
    Given the Complete dossier row
    When the person selects Fill
    Then the form asks the title, the client and the date before it writes

  @spec:library-functions#REQ-008
  Scenario: Chart kinds of dashboard tiles: Default chart
    Given a tile of the data kind Runs
    When the person adds it
    Then it shows the default chart of that data kind

  @spec:library-functions#REQ-008
  Scenario: Chart kinds of dashboard tiles: Change the chart
    Given a tile with the chart Bars
    When the person picks Line
    Then the tile shows a line chart

  @spec:library-functions#REQ-009
  Scenario: Pin a dashboard to Today: Pin
    Given a dashboard with three tiles
    When the person selects Pin to Today
    Then Today shows one card with the three tiles

  @spec:library-functions#REQ-010
  Scenario: Release picker of Dashboards: Pick a release
    Given a dashboard and the release MVP 1
    When the person picks MVP 1
    Then the tiles show the data of MVP 1

  @spec:library-functions#REQ-011
  Scenario: Check against the code of the flow matrix: Denied and used
    Given a flow that is denied and a host that the code calls
    When the person selects Check against the code
    Then the alert card names the flow with Show it and Ask for the change

  @spec:library-functions#REQ-011
  Scenario: Check against the code of the flow matrix: Not in the code
    Given an allowed flow that no code calls
    When the check ends
    Then the row shows the chip "Not in the code"

  @spec:library-functions#REQ-012
  Scenario: Stale chip on the map of the code: Stale
    Given a spec changed on 2026-11-18 and code last changed on 2026-11-10
    When the person opens the map of the code
    Then the part shows the chip Stale

  @spec:library-functions#REQ-013
  Scenario: Link from an endpoint to its feature: Link
    Given an endpoint that the change add-export cites
    When the person opens the endpoint
    Then the card links to add-export

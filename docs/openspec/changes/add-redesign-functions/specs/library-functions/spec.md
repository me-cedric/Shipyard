# Spec: library-functions

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-20
Change: `change:add-redesign-functions`

### Goal

A person can use the controls of Library that the redesign shows: items in Opened last, earlier versions, added files, notes of slides, glossary words, PDF and Markdown reports, chart kinds and the checks of the flow matrix and the map of the code.

### Why

The design shows thirteen groups of controls in Library that the app does not have. The owner asked to build them (`q:Q-173`).

### Requirements

- REQ-001: Opened last SHALL keep each item that has a ref (a spec, a decision, a diagram, a document), not only pages. A row SHALL show a kind chip, the item name and Pin.
- REQ-002: Project rules SHALL have a card Earlier versions, and a Handbook page SHALL have History and an author line. Each lists the commits that changed that file. A person SHALL read an earlier version and SHALL restore it. A restore SHALL write the old text into the file and SHALL NOT commit.
- REQ-003: Documents SHALL have Add a file. It SHALL copy any chosen file into the documents folder and SHALL keep a Word file as Word.
- REQ-004: A Markdown deck SHALL have Edit, Export PDF, Speaker notes, and the Planning and Costing slides. A speaker note SHALL be a `Note:` block after a slide. Export PDF SHALL work on macOS, as `deck_pdf` does today.
- REQ-005: Learn SHALL have an Experts card, Add a word and a second pill on a step (Reading, Course or Certification). An expert SHALL be a person of the team file with topics. Add a word SHALL write the word and its meaning into `docs/glossary.md`. The glossary SHALL read that file beside the specs.
- REQ-006: The format switch of reports SHALL offer PDF, Word, Excel and Markdown. PDF SHALL work on macOS first, with the path of `deck_pdf`; on another system the PDF choice SHALL be off. Each text report SHALL have a Markdown output. One document SHALL offer Download as Word and as PDF.
- REQ-007: Reports SHALL have a Costing card, Export on Change request, a row Pages that link to a report, and a date and a person on each row of Written for you. The dates SHALL come from a log of the written reports in the app data of the project. The Complete dossier row SHALL ask the title, the client and the date first, then write the dossier.
- REQ-008: A tile SHALL have a chart kind: Number, Bars, Line, List, Flow stages, Spend or Health. The data kind of the tile SHALL pick the default chart. The person SHALL change the chart.
- REQ-009: Edit a dashboard SHALL have Pin to Today. A pinned dashboard SHALL show as one card on Today with its tiles.
- REQ-010: Dashboards SHALL have a picker of releases beside Edit. The picker SHALL list the releases of `spec:code-host-tickets#REQ-004` and SHALL filter the tiles by the chosen release. This requirement SHALL wait for that requirement.
- REQ-011: The flow matrix SHALL have Check against the code. It SHALL scan the code for the hosts that it calls and SHALL store a result for each row in the app data of the project. A row SHALL show the chip "Not in the code" when the code does not call the host. An alert card SHALL show when a flow is denied and the code uses it, with Show it and Ask for the change.
- REQ-012: A part of the code SHALL show the chip Stale when its spec changed after the last change of the code.
- REQ-013: An endpoint card SHALL link to the change that cites the endpoint.

### Non-Goals

- PDF on Windows and Linux (macOS first).
- A Word editor.

### Acceptance Criteria

- [ ] Opened last keeps items (F26): each scenario below passes.
- [ ] Earlier versions and History (F27): each scenario below passes.
- [ ] Add a file to Documents (F28): each scenario below passes.
- [ ] Slides of a Markdown deck (F29): each scenario below passes.
- [ ] Learn: Experts, Add a word and the second pill (F30): each scenario below passes.
- [ ] PDF and Markdown output of reports (F31): each scenario below passes.
- [ ] Reports page cards and the dossier form (F32): each scenario below passes.
- [ ] Chart kinds of dashboard tiles (F34): each scenario below passes.
- [ ] Pin a dashboard to Today (F35): each scenario below passes.
- [ ] Release picker of Dashboards (F36): each scenario below passes.
- [ ] Check against the code of the flow matrix (F37): each scenario below passes.
- [ ] Stale chip on the map of the code (F38): each scenario below passes.
- [ ] Link from an endpoint to its feature (F39): each scenario below passes.

### Existing References

- Extends: `change:update-app-redesign`, which kept the Non-Goal "No new function". This change lifts that Non-Goal for these controls (`adr:0023`).
- Existing: `spec:knowledge#REQ-021`, `spec:design#REQ-001`. Code: `src/features/{library,knowledge,reports,design,specs}/`, `crates/shipyard-app/src/{knowledge,learning,documents,decks,reports,design}.rs`, `crates/shipyard-core/src/{tile,flows,knowledge}.rs`.

## ADDED Requirements

### Requirement: REQ-001 Opened last keeps items

Opened last SHALL keep each item that has a ref (a spec, a decision, a diagram, a document), not only pages. A row SHALL show a kind chip, the item name and Pin.

Design control: F26

Screen: SCR-044

#### Scenario: Item row

- GIVEN a person who opened the spec Export
- WHEN the person opens Library
- THEN Opened last shows a row with the chip Spec and the name Export

### Requirement: REQ-002 Earlier versions and History

Project rules SHALL have a card Earlier versions, and a Handbook page SHALL have History and an author line. Each lists the commits that changed that file. A person SHALL read an earlier version and SHALL restore it. A restore SHALL write the old text into the file and SHALL NOT commit.

Design control: F27

Screen: SCR-077
Screen: SCR-079
Screen: SCR-186
Screen: SCR-187
Screen: SCR-191

#### Scenario: Restore

- GIVEN a rules file with two earlier versions
- WHEN the person restores the older one
- THEN the file holds the old text and nothing is committed

#### Scenario: Author line

- GIVEN a handbook page that Grace changed last
- WHEN the person opens the page
- THEN the page says Grace changed it

### Requirement: REQ-003 Add a file to Documents

Documents SHALL have Add a file. It SHALL copy any chosen file into the documents folder and SHALL keep a Word file as Word.

Design control: F28

Screen: SCR-081

#### Scenario: Add a Word file

- GIVEN the Documents page
- WHEN the person adds `plan.docx`
- THEN the folder holds `plan.docx` as a Word file

### Requirement: REQ-004 Slides of a Markdown deck

A Markdown deck SHALL have Edit, Export PDF, Speaker notes, and the Planning and Costing slides. A speaker note SHALL be a `Note:` block after a slide. Export PDF SHALL work on macOS, as `deck_pdf` does today.

Design control: F29

Screen: SCR-013

#### Scenario: Speaker note

- GIVEN a Markdown deck whose slide has a `Note:` block
- WHEN the person opens Speaker notes
- THEN the note of that slide shows

#### Scenario: Export PDF

- GIVEN a Markdown deck on macOS
- WHEN the person selects Export PDF
- THEN a PDF of the slides is written

### Requirement: REQ-005 Learn: Experts, Add a word and the second pill

Learn SHALL have an Experts card, Add a word and a second pill on a step (Reading, Course or Certification). An expert SHALL be a person of the team file with topics. Add a word SHALL write the word and its meaning into `docs/glossary.md`. The glossary SHALL read that file beside the specs.

Design control: F30

Screen: SCR-009
Screen: SCR-188
Screen: SCR-189

#### Scenario: Add a word

- GIVEN the Learn page
- WHEN the person adds the word Recipe with its meaning
- THEN `docs/glossary.md` holds the word and the glossary shows it

#### Scenario: Expert

- GIVEN a team file whose member Grace has the topic Billing
- WHEN the person opens Experts
- THEN the card shows Grace with Billing

### Requirement: REQ-006 PDF and Markdown output of reports

The format switch of reports SHALL offer PDF, Word, Excel and Markdown. PDF SHALL work on macOS first, with the path of `deck_pdf`; on another system the PDF choice SHALL be off. Each text report SHALL have a Markdown output. One document SHALL offer Download as Word and as PDF.

Design control: F31

Screen: SCR-045
Screen: SCR-164
Screen: SCR-081

#### Scenario: Markdown

- GIVEN a text report
- WHEN the person picks Markdown
- THEN a Markdown file is written

#### Scenario: PDF off

- GIVEN a system other than macOS
- WHEN the person opens the format switch
- THEN the PDF choice is off

### Requirement: REQ-007 Reports page cards and the dossier form

Reports SHALL have a Costing card, Export on Change request, a row Pages that link to a report, and a date and a person on each row of Written for you. The dates SHALL come from a log of the written reports in the app data of the project. The Complete dossier row SHALL ask the title, the client and the date first, then write the dossier.

Design control: F32

Screen: SCR-045
Screen: SCR-164

#### Scenario: Written for you

- GIVEN a report that Ada wrote on 2026-11-18
- WHEN the person opens Reports
- THEN the row shows Ada and the date

#### Scenario: Dossier asks first

- GIVEN the Complete dossier row
- WHEN the person selects Fill
- THEN the form asks the title, the client and the date before it writes

### Requirement: REQ-008 Chart kinds of dashboard tiles

A tile SHALL have a chart kind: Number, Bars, Line, List, Flow stages, Spend or Health. The data kind of the tile SHALL pick the default chart. The person SHALL change the chart.

Design control: F34

Screen: SCR-082
Screen: SCR-162

#### Scenario: Default chart

- GIVEN a tile of the data kind Runs
- WHEN the person adds it
- THEN it shows the default chart of that data kind

#### Scenario: Change the chart

- GIVEN a tile with the chart Bars
- WHEN the person picks Line
- THEN the tile shows a line chart

### Requirement: REQ-009 Pin a dashboard to Today

Edit a dashboard SHALL have Pin to Today. A pinned dashboard SHALL show as one card on Today with its tiles.

Design control: F35

Screen: SCR-162
Screen: SCR-104
Screen: SCR-190

#### Scenario: Pin

- GIVEN a dashboard with three tiles
- WHEN the person selects Pin to Today
- THEN Today shows one card with the three tiles

### Requirement: REQ-010 Release picker of Dashboards

Dashboards SHALL have a picker of releases beside Edit. The picker SHALL list the releases of `spec:code-host-tickets#REQ-004` and SHALL filter the tiles by the chosen release. This requirement SHALL wait for that requirement.

Design control: F36

Screen: SCR-082

#### Scenario: Pick a release

- GIVEN a dashboard and the release MVP 1
- WHEN the person picks MVP 1
- THEN the tiles show the data of MVP 1

### Requirement: REQ-011 Check against the code of the flow matrix

The flow matrix SHALL have Check against the code. It SHALL scan the code for the hosts that it calls and SHALL store a result for each row in the app data of the project. A row SHALL show the chip "Not in the code" when the code does not call the host. An alert card SHALL show when a flow is denied and the code uses it, with Show it and Ask for the change.

Design control: F37

Screen: SCR-161
Screen: SCR-192

#### Scenario: Denied and used

- GIVEN a flow that is denied and a host that the code calls
- WHEN the person selects Check against the code
- THEN the alert card names the flow with Show it and Ask for the change

#### Scenario: Not in the code

- GIVEN an allowed flow that no code calls
- WHEN the check ends
- THEN the row shows the chip "Not in the code"

### Requirement: REQ-012 Stale chip on the map of the code

A part of the code SHALL show the chip Stale when its spec changed after the last change of the code.

Design control: F38

Screen: SCR-160

#### Scenario: Stale

- GIVEN a spec changed on 2026-11-18 and code last changed on 2026-11-10
- WHEN the person opens the map of the code
- THEN the part shows the chip Stale

### Requirement: REQ-013 Link from an endpoint to its feature

An endpoint card SHALL link to the change that cites the endpoint.

Design control: F39

Screen: SCR-071

#### Scenario: Link

- GIVEN an endpoint that the change add-export cites
- WHEN the person opens the endpoint
- THEN the card links to add-export

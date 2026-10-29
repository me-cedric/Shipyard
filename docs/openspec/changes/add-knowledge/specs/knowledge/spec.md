# Spec: knowledge

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-knowledge`

### Goal

Knowledge is one space that draws the reference graph and explains any entity. It builds the handbook, the documents, the slides, the learning path and the dashboards from the project artifacts.

### Why

A junior or a new member must understand the project from its decisions, specs and architecture. Legacy has a wiki, a graph, learning pages and dashboards, but they do not read the same graph. Shipyard reads one reference graph (`add-refs`) and draws every view from it.

### Users And Scenarios

- Junior: reads the learning path, the glossary and the Explain answer of an entity.
- PM: reads the dashboards and the Home widgets, and presents a deck.
- Architect: reads the graph and exports the architecture dossier.
- Developer: reads the code graph and the handbook.
- QA: reads the quality tiles and the graph of tests and requirements.
- BA: writes documents and exports the functional documentation.
- Functional lead: reads the functional documentation and the deliverables for the client.

### Requirements

- REQ-001: Knowledge / Graph SHALL draw the reference graph of the project.
- REQ-002: Knowledge / Graph SHALL also draw the code graph from the codebase-memory index of the project.
- REQ-003: The reference graph, the code graph and Factory / Agents map SHALL use one renderer (`add-factory` REQ-030).
- REQ-004: The graph SHALL filter by kind.
- REQ-005: A click on a node SHALL open its entity in the inspector (`add-shell` REQ-006).
- REQ-006: Every graph SHALL have a table view that lists the nodes and their links.
- REQ-007: The graph SHALL mark an entity that has no backlink as an orphan.
- REQ-008: Every entity SHALL have one Explain action in the inspector.
- REQ-009: Knowledge SHALL show the Explain answer of `add-assistant` REQ-016 with each cited ref as a RefChip.
- REQ-010: Knowledge / Handbook SHALL show the Markdown pages of the project handbook as a page tree.
- REQ-011: The Handbook and the Documents views SHALL use one Markdown editor with a preview.
- REQ-012: Knowledge / Documents SHALL list the Markdown documents and the client deliverables of the project.
- REQ-013: Documents SHALL export the architecture dossier as `.docx`.
- REQ-014: Documents SHALL export the functional documentation as `.docx`.
- REQ-015: An export SHALL be a projection that the system generates on demand and never reads back.
- REQ-016: Documents SHALL export a client deliverable as `.xlsx`.
- REQ-017: Knowledge / Slides SHALL list the decks of the project.
- REQ-018: Each deck SHALL use the one theme of the project.
- REQ-019: A person SHALL present a deck in a full-screen mode.
- REQ-020: Knowledge / Learn SHALL build a learning path from the architecture, the ADRs and the specs.
- REQ-021: Knowledge / Learn SHALL show a glossary of the terms that the specs define.
- REQ-022: Knowledge / Dashboards SHALL show a dashboard as a grid of tiles.
- REQ-023: A tile SHALL read data that the project already holds and draw it.
- REQ-024: A person SHALL pin a tile to Home.
- REQ-025: The system SHALL expose each handbook page, document and deck as a `doc:<path>` entity.
- REQ-026: Each Knowledge view SHALL follow the interface rules of the constitution.

### Non-Goals

- Editing an entity in the graph. The view that owns the entity edits it.
- The assistant panel, its threads and its modes. `add-assistant` owns them. This change owns the Explain action and its rules.
- The reference index and the backlinks. `add-refs` owns them.
- The Legacy My learning page with RSS feeds. The learning path replaces it.
- Parsing a `.docx` or an `.xlsx` back into the project. Exports are one-way.
- The change request document and the work-done sheet that Legacy exports from Impacts. The digest goes into the pull request (`add-delivery` REQ-027), and REQ-013 to REQ-016 cover the client documents.
- A custom theme editor. One project theme serves all decks.
- A hand-written block language for dashboards. Tiles come from a fixed catalogue.

### Acceptance Criteria

- [ ] Knowledge / Graph draws the reference graph with filters by kind and a table view.
- [ ] The graph, the code graph and Factory / Agents map use one renderer.
- [ ] A click on a node opens its entity in the inspector.
- [ ] An entity with no backlink shows as an orphan, and an entity whose source changed later shows as stale.
- [ ] A `doc:<path>` ref resolves to its page.
- [ ] Explain answers from the reference graph and cites refs that resolve. It says so when it has no answer.
- [ ] A person edits a handbook page and saves it to the repository after a changed-file warning.
- [ ] The architecture dossier exports as `.docx` with five sections. An unreadable source gives a named gap.
- [ ] The functional documentation exports as `.docx` and holds no sealed day rate.
- [ ] A client deliverable exports as `.xlsx`.
- [ ] A deck uses the project theme and opens in a present mode that Escape leaves.
- [ ] A deck exports as one file that opens offline.
- [ ] Knowledge / Learn lists the path in order and a glossary of terms.
- [ ] A dashboard saves to a file with no commit. A tile shows its numbers as a table.
- [ ] A pinned tile shows on Home.
- [ ] Every Knowledge view works with the keyboard, shows a focus ring and has French and English text.

### Links

- Consumes: `add-refs` (graph, backlinks, search; REQ-003, REQ-007, REQ-008).
- Consumes: `add-design` (models, ADRs, data, flows, API, screens; REQ-001, REQ-023) and `add-specs` (specs and capabilities; REQ-005, REQ-006).
- Consumes: `add-code` (quality reports, impact reports; REQ-027, REQ-028, REQ-033).
- Consumes: `add-factory` (run metrics for tiles; REQ-030, REQ-032) and `add-work` (estimates for the annex; REQ-009, REQ-014).
- Consumes: `add-assistant` (the Explain answer; REQ-016) and `add-shell` (inspector, Home; REQ-003, REQ-006).
- Produces: `doc:` entities for `add-refs`.
- Produces: the graph renderer for `add-factory` (REQ-030).
- Produces: dashboards and Home widgets for `add-shell` (REQ-003).
- Related: `add-delivery` REQ-027 (the impacts digest sits in the pull request, not in a document).

### Legacy parity

| Legacy feature | Shipyard view | REQ ids |
| --- | --- | --- |
| Knowledge graph | Knowledge / Graph | REQ-001 to REQ-007 |
| Assistant on a page (Explain, new) | Explain action on every entity | REQ-008, REQ-009 |
| Wiki handbook | Knowledge / Handbook | REQ-010, REQ-011 |
| Documents | Knowledge / Documents | REQ-011, REQ-012, REQ-025 |
| Dossier d'architecture | Documents export | REQ-013, REQ-015 |
| Documentation fonctionnelle | Documents export | REQ-014, REQ-015, REQ-016 |
| Slides | Knowledge / Slides | REQ-017, REQ-018, REQ-019 |
| Learning, Learning path | Knowledge / Learn | REQ-020, REQ-021 |
| Dashboards | Knowledge / Dashboards; Home widgets | REQ-022, REQ-023, REQ-024 |

### Existing References

- `docs/plan/MASTER-PLAN.md` sections 4, 5.9 and 6.
- `docs/openspec/constitution.md` sections 2, 3 and 4.
- `docs/decisions/0004-seven-spaces-information-architecture.md`
- `docs/delivery/questions/Q-044.md`
- `docs/delivery/questions/Q-045.md`
- `docs/delivery/questions/Q-046.md`
- Legacy `docs/features.md` (Les dossiers client, Slides) and `docs/dashboards.md`, read only.

## ADDED Requirements

### Requirement: REQ-001 Reference graph

Knowledge / Graph SHALL draw the reference graph of the project. A node SHALL be an entity and an edge SHALL be a link between two entities. Each node SHALL show its ref and its kind.

#### Scenario: Open the graph
- GIVEN a project with ADRs, specs and work items
- WHEN a person opens Knowledge / Graph
- THEN the nodes show their refs and kinds and the edges show the links

### Requirement: REQ-002 Code graph

Knowledge / Graph SHALL also draw the code graph from the codebase-memory index of the project. It shows the files, modules and symbols of the project, and their calls. One control SHALL switch between the reference graph and the code graph. [NEEDS CLARIFICATION: Q-045 How does knowledge get the code graph?]

#### Scenario: Switch source
- GIVEN a project with a code graph
- WHEN a person switches the graph source to code
- THEN the same view shows files and symbols

#### Scenario: No code graph
- GIVEN a project with no code graph
- WHEN a person switches to code
- THEN the view shows one Index action in place of the graph

### Requirement: REQ-003 One renderer

The reference graph, the code graph and Factory / Agents map SHALL use one renderer (`add-factory` REQ-030). The renderer SHALL take nodes and edges and SHALL NOT hold a copy of the data.

#### Scenario: Agents map
- GIVEN Factory / Agents map and Knowledge / Graph open
- WHEN a person selects a node in each
- THEN both views use the same selection, zoom and keyboard behaviour

### Requirement: REQ-004 Filter and focus

The graph SHALL filter by kind. Each kind SHALL show a count. An Open in graph action on any entity SHALL centre the graph on that entity and its neighbours.

#### Scenario: Filter by kind
- GIVEN a graph with ADRs and specs
- WHEN a person hides the kind spec
- THEN no spec node shows and the other kinds stay

### Requirement: REQ-005 Graph selection

A click on a node SHALL open its entity in the inspector (`add-shell` REQ-006). The graph SHALL offer no edit action. Each entity SHALL stay editable only in the view that owns it.

#### Scenario: Select a node
- GIVEN a graph with an ADR node
- WHEN a person selects the node
- THEN the inspector shows the ADR and its backlinks

### Requirement: REQ-006 Graph accessibility

Every graph SHALL have a table view that lists the nodes and their links. Node kinds SHALL use shape and colour together. The layout SHALL settle and stop, and reduced motion SHALL remove its animation. The keyboard SHALL move the focus along the links.

#### Scenario: Table view
- GIVEN a graph with 40 nodes
- WHEN a person opens the table view
- THEN the table lists the 40 nodes with their links

### Requirement: REQ-007 Orphan and stale marks

The graph SHALL mark an entity that has no backlink as an orphan. It SHALL mark an entity as stale when an entity that it cites changed after its last change (`add-refs` Non-Goals).

#### Scenario: Stale spec
- GIVEN a spec that cites `adr:0004` and an ADR changed after the spec
- WHEN a person opens the graph
- THEN the spec node shows the stale mark

### Requirement: REQ-008 Explain action

Every entity SHALL have one Explain action in the inspector. The palette and the context menu SHALL run the same action. The action SHALL open the assistant panel with the entity as context.

#### Scenario: Explain an ADR
- GIVEN an open ADR
- WHEN a person runs Explain
- THEN the assistant panel opens with `adr:` as context

### Requirement: REQ-009 Explain answer

`add-assistant` REQ-016 owns the Explain answer and its rules. Knowledge SHALL show the answer. It SHALL show each cited ref as a RefChip.

#### Scenario: Cited answer
- GIVEN a spec that cites two ADRs
- WHEN a person explains the spec
- THEN the answer cites the two `adr:` refs

#### Scenario: No answer
- GIVEN an entity with no text and no link
- WHEN a person explains it
- THEN the answer says that it found no source

### Requirement: REQ-010 Handbook

Knowledge / Handbook SHALL show the Markdown pages of the project handbook as a page tree. The pages SHALL live in the repository. A person SHALL open, edit and create a page. New page SHALL be the one primary action.

#### Scenario: New page
- GIVEN a handbook with three pages
- WHEN a person creates a page
- THEN the tree shows four pages and the new file exists in the repository

### Requirement: REQ-011 Markdown editor

The Handbook and the Documents views SHALL use one Markdown editor with a preview. A ref in the text SHALL show as a RefChip. The save SHALL follow `add-design` REQ-023. The handbook search SHALL use the one search of `add-refs` (REQ-008).

#### Scenario: Changed on disk
- GIVEN a page that changed on disk after the person opened it
- WHEN the person saves
- THEN the system warns before it replaces the file

### Requirement: REQ-012 Documents

Knowledge / Documents SHALL list the Markdown documents and the client deliverables of the project. Each document SHALL be a `doc:<path>` entity.

#### Scenario: Open a document
- GIVEN a document in the repository
- WHEN a person opens it
- THEN the editor shows it and the inspector shows its backlinks

### Requirement: REQ-013 Architecture dossier

Documents SHALL export the architecture dossier as `.docx`. It SHALL hold these sections: the architecture views, the decisions, the data models, the flows and the API contracts. The system SHALL read each source at the time of the export.

#### Scenario: Export
- GIVEN a project with a model, two ADRs and an API contract
- WHEN a person exports the dossier
- THEN a `.docx` file holds the five sections with that content

### Requirement: REQ-014 Functional documentation

Documents SHALL export the functional documentation as `.docx`. It SHALL hold the specs, the design document, the screens and an estimate annex. The annex MUST NOT hold a day rate of a sealed sheet.

#### Scenario: Sealed sheet
- GIVEN an estimate sheet that is sealed
- WHEN a person exports the documentation
- THEN the annex lists the tasks and holds no day rate

### Requirement: REQ-015 Export rules

An export SHALL be a projection that the system generates on demand and never reads back. It SHALL open with a cover page and SHALL start each section on a new page. A section with no content SHALL say so. An unreadable source SHALL give a named gap and MUST NOT fail the export.

#### Scenario: Unreadable source
- GIVEN a data model file that cannot be read
- WHEN a person exports the dossier
- THEN the export succeeds and the data model section names the gap

### Requirement: REQ-016 Spreadsheet deliverable

Documents SHALL export a client deliverable as `.xlsx`. The export SHALL be a projection under the export rules. [NEEDS CLARIFICATION: Q-044 Which deliverable has an `.xlsx` export?]

#### Scenario: Export a sheet
- GIVEN a deliverable that has an `.xlsx` export
- WHEN a person exports it
- THEN a `.xlsx` file opens with its data and the cover information

### Requirement: REQ-017 Slides

Knowledge / Slides SHALL list the decks of the project. A person SHALL edit a deck as text with a live preview. A deck SHALL be a repository file. New deck SHALL be the one primary action.

#### Scenario: Edit a deck
- GIVEN a deck of five slides
- WHEN a person adds a slide in the text
- THEN the preview shows six slides

### Requirement: REQ-018 Slide theme

Each deck SHALL use the one theme of the project. The theme SHALL set the colours, the logo and the font. A deck SHALL export as one file that opens with no network.

#### Scenario: Project theme
- GIVEN a project theme with a logo
- WHEN a person opens two decks
- THEN both show the same colours and logo

### Requirement: REQ-019 Present mode

A person SHALL present a deck in a full-screen mode. The keyboard SHALL go to the next and previous slide and SHALL leave the mode with Escape. Reduced motion SHALL remove the slide transitions.

#### Scenario: Present
- GIVEN a deck
- WHEN a person starts the present mode and presses Escape
- THEN the deck leaves the full-screen mode

### Requirement: REQ-020 Learn path

Knowledge / Learn SHALL build a learning path from the architecture, the ADRs and the specs. The path SHALL start with the architecture, then the ADRs in number order, then the capability specs. Each step SHALL be an entity ref.

#### Scenario: New member
- GIVEN a project with a model, three ADRs and two specs
- WHEN a junior opens Knowledge / Learn
- THEN the path lists the model, the three ADRs and the two specs in that order

### Requirement: REQ-021 Glossary

Knowledge / Learn SHALL show a glossary of the terms that the specs define. Each term SHALL link to the spec that defines it. [NEEDS CLARIFICATION: Q-046 Where does a spec define a term?]

#### Scenario: Open a term
- GIVEN a glossary with the term `run`
- WHEN a person opens the term
- THEN the spec that defines it opens

### Requirement: REQ-022 Dashboards

Knowledge / Dashboards SHALL show a dashboard as a grid of tiles. A dashboard SHALL be a repository file that the team shares. A change SHALL save to the file and MUST NOT make a commit. The system SHALL show a file that a newer version wrote. The system MUST NOT overwrite it.

#### Scenario: Move a tile
- GIVEN a dashboard
- WHEN a person moves a tile
- THEN the file holds the new place and no commit exists

### Requirement: REQ-023 Tiles

A tile SHALL read data that the project already holds and draw it. The sources SHALL include work items, runs, questions, specs, quality reports, impact reports and estimates. Show as table SHALL give the numbers behind any chart. A tile with a cut answer SHALL say so.

#### Scenario: Table view
- GIVEN a chart tile
- WHEN a person chooses Show as table
- THEN the numbers of the chart show in a table

#### Scenario: Source off
- GIVEN a tile whose source is not available
- WHEN a person opens the dashboard
- THEN the tile stays visible and greyed and names its source

### Requirement: REQ-024 Home widgets

A person SHALL pin a tile to Home. Home / My work and Home / Activity SHALL show the pinned tiles (`add-shell` REQ-003). The pins SHALL be a per-person setting.

#### Scenario: Pin
- GIVEN a tile on a dashboard
- WHEN a person pins it
- THEN Home / My work shows the tile

### Requirement: REQ-025 Doc entity

The system SHALL expose each handbook page, document and deck as a `doc:<path>` entity. The entity SHALL show its kind and its backlinks.

#### Scenario: Resolve
- GIVEN a handbook page
- WHEN a ref `doc:` of the page is read
- THEN the ref resolves to the page

### Requirement: REQ-026 Interface rules

Each Knowledge view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have at most one primary action. It SHALL have a keyboard path, a focus ring, assistive labels, contrast and reduced motion. It SHALL show French and English text.

#### Scenario: Keyboard
- GIVEN any Knowledge view
- WHEN a person uses only the keyboard
- THEN every action is reachable and the focus ring shows

# Spec: design

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-design`

### Goal

The architect keeps diagrams, models, decisions, API contracts, data models, network flows and screens in the repository. Each artifact has a ref, an editor or viewer, and its backlinks. A screen or an ADR can start work through the factory.

### Why

The earlier tool has one page for each kind of artifact. Nothing links a decision to the spec or the code that it shapes. One Design space gives each artifact one ref, so specs, work items and runs cite it.

### Users And Scenarios

- Architect: draws a diagram, writes an ADR and accepts it with a comment.
- Developer: reads an API contract, tries a request, and opens the data model of a table.
- BA: cites an ADR or a screen in a spec and sees the citation in the backlinks.
- QA: reads the network flow table and filters it by protocol.
- PM: sees which specs and work items cite a decision before the team changes it.
- Functional lead: opens a screen artifact and its design doc to review a requirement.
- Junior: reads the architecture model and the decisions to learn why the system looks as it does.

### Requirements

- REQ-001: The system SHALL give each design artifact one ref of its kind: `diagram:<slug>`, `model:<slug>`, `adr:NNNN`, `api:<slug>`, `data:<slug>`, `flow:<slug>` or `screen:<slug>`. The system SHALL offer a copy action for that ref.
- REQ-002: The system SHALL show the backlinks of each design artifact in the inspector, grouped by kind with a count.
- REQ-003: The system SHALL list the Excalidraw, draw.io, Mermaid and BPMN files of the project in Design / Diagrams. Each row SHALL show the title and the format. The view SHALL have one primary action: new diagram.
- REQ-004: The system SHALL open a diagram file for view or edit. [NEEDS CLARIFICATION: Q-040 Which diagram formats does Shipyard edit in the app?] Working assumption: Q-040 option 1, edit Excalidraw and Mermaid, and show draw.io and BPMN read-only with an action to open the file in another app. The system SHALL show every format in the EditorFrame.
- REQ-005: The system SHALL show an error for a diagram file that it cannot read. The system MUST NOT change that file.
- REQ-006: The system SHALL list the LikeC4 models in Design / Architecture. The system SHALL render the open model live as the text changes.
- REQ-007: The system SHALL keep the last good render when a model does not parse. The system SHALL show the error with its line.
- REQ-008: The system SHALL list the ADRs of the project in Design / Decisions. Each row SHALL show the number, the title and the status.
- REQ-009: The system SHALL create an ADR from the MADR template. The new ADR SHALL take the next free number and the status proposed.
- REQ-010: The system SHALL accept or reject a proposed ADR with a comment. The system SHALL record the status, the date and the comment in the ADR file. The view SHALL have one primary action, accept, with reject as the other choice.
- REQ-011: The system SHALL list the OpenAPI contracts in Design / API. Each row SHALL show the title and the version.
- REQ-012: The system SHALL show a read view of a contract. The view SHALL group endpoints by tag. Each endpoint SHALL show its method, path, parameters and responses.
- REQ-013: The system SHALL offer a try view that sends a request from a contract and shows the status and the body of the response. [NEEDS CLARIFICATION: Q-039 Which servers can the API try view call?] Working assumption: Q-039 option 1, any listed server, with one click and the server name before a request that is not GET. A secret MUST NOT appear in a URL or a log.
- REQ-014: The system SHALL list the DBML data models in Design / Data. The system SHALL show the open model as tables and relations.
- REQ-015: The system SHALL show a DBML error with its line. The system SHALL keep the last good view.
- REQ-016: The system SHALL show the network flow table in Design / Flows. Each row SHALL hold source, destination, VLAN or VNET, protocol and action. The action SHALL be allow or deny.
- REQ-017: The system SHALL filter the flow table by VLAN or VNET, by protocol, by action and by free text. Filters SHALL combine.
- REQ-018: The system SHALL add, edit and remove a flow row. The system SHALL reject a row with a missing field.
- REQ-019: The system SHALL list the screens in Design / Screens with their design artifacts and `.fig` links. The system SHALL open a `.fig` link outside the app.
- REQ-020: The system SHALL start a run from a screen or an ADR through the factory. [NEEDS CLARIFICATION: Q-038 How does a screen or an ADR start a run?] Working assumption: Q-038 option 1. One click creates a work item that cites the ref through `add-work` REQ-029. Normal pickup starts the run. The run MUST obey the factory rules and the write switches.
- REQ-021: The system SHALL show and edit the design doc of the project in Design / Screens.
- REQ-022: Each Design view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path and a focus ring. It SHALL have assistive labels, enough contrast and reduced motion. It SHALL show French and English text.
- REQ-023: The system SHALL write a file in full or not at all. The system SHALL warn before it replaces a file that changed on disk after the person opened it.
- REQ-024: The system SHALL read the design tokens of a linked Figma file. It SHALL show them beside the tokens of the project design doc (REQ-021). [NEEDS CLARIFICATION: Q-054 Who owns the extraction of design tokens from Figma?] Working assumption: Q-054 option 1, Design / Screens owns the read and the person owns the change to the token file. The system MUST NOT change the token file before one click of the person.

### Non-Goals

- Rendering the content of a `.fig` file. The view links to it.
- Defining the token set of Shipyard. The design-system capability owns it.
- Running an agent. The factory capability owns runs.
- Drawing the knowledge graph. The knowledge capability owns it.
- Exports: `add-knowledge` REQ-013.

### Acceptance Criteria

- [ ] Each artifact kind shows a ref with a copy action.
- [ ] A spec that cites `adr:0004` shows in the backlinks of that ADR.
- [ ] A broken file shows an error and the file is unchanged.
- [ ] A LikeC4 edit updates the render, and a syntax error keeps the last render.
- [ ] A new ADR has the next free number and the MADR sections.
- [ ] Accept and reject each write status, date and comment to the ADR file.
- [ ] The API read view groups endpoints by tag.
- [ ] A try request shows the status and the body of the response.
- [ ] A DBML model shows its tables and relations.
- [ ] The flow table filters by VLAN or VNET, protocol and action.
- [ ] A `.fig` link opens outside the app.
- [ ] The tokens of a Figma file show beside the tokens of the project design doc, and nothing changes before a click.
- [ ] The design to code action on an ADR leads to a run through the factory.
- [ ] Every Design view works with the keyboard and shows in French and English.

### Links

- Consumes: `add-refs` REQ-001 and REQ-007 (grammar and backlinks), `add-design-system` REQ-005 (EditorFrame, RefChip, BacklinkList), `add-shell` REQ-006 (inspector), `add-factory` REQ-009 (a run starts from a claimed ticket) and REQ-025 (switches), `add-connections` (try view credentials), `add-sync` (work item mirror), `add-work` REQ-029 (one work item from a ref).
- Produces: `diagram:`, `model:`, `adr:`, `api:`, `data:`, `flow:` and `screen:` entities for `add-refs` (index), `add-specs` (citations), `add-knowledge` (graph, learn), `add-factory` (`read_ref`) and `add-assistant` (context).
- Related: `q:Q-002` (all automation writes off by default), `docs/decisions/` (the ADR files).

### Feature list

| Feature | Shipyard view | REQ ids |
|---|---|---|
| Drawings (Excalidraw, draw.io, Mermaid, BPMN) | Design / Diagrams | REQ-003, REQ-004, REQ-005 |
| Models (LikeC4) | Design / Architecture | REQ-006, REQ-007 |
| ADRs (MADR, accept or refuse) | Design / Decisions | REQ-008, REQ-009, REQ-010 |
| OpenAPI | Design / API | REQ-011, REQ-012, REQ-013 |
| Data models (DBML) | Design / Data | REQ-014, REQ-015 |
| Flows (IPAM) | Design / Flows | REQ-016, REQ-017, REQ-018 |
| Designs | Design / Screens | REQ-019 |
| Design doc | Design / Screens | REQ-021 |
| Design to code | Action on a screen or an ADR | REQ-020 |
| Extract tokens | Design / Screens | REQ-024 |
| Cross-page links | Refs and backlinks | REQ-001, REQ-002 |

### Existing References

- Existing code/docs/specs: `docs/plan/MASTER-PLAN.md` sections 3, 4 and 11; `docs/decisions/`; `docs/openspec/constitution.md` section 4; `.agents/progress/w1.md`.
- Supersedes or extends: N/A

## ADDED Requirements

### Requirement: REQ-001 Ref per artifact

The system SHALL give each design artifact one ref of its kind: `diagram:<slug>`, `model:<slug>`, `adr:NNNN`, `api:<slug>`, `data:<slug>`, `flow:<slug>` or `screen:<slug>`. The system SHALL offer a copy action for that ref.

#### Scenario: Copy a ref
- GIVEN a diagram file
- WHEN the person uses the copy ref action
- THEN the clipboard holds `diagram:` and the slug of the file

#### Scenario: Stable ref
- GIVEN an ADR with the number 0004
- WHEN the person edits its title
- THEN the ref stays `adr:0004`

### Requirement: REQ-002 Backlinks

The system SHALL show the backlinks of each design artifact in the inspector, grouped by kind with a count.

#### Scenario: Citation from a spec
- GIVEN a spec that cites `adr:0004`
- WHEN the person selects that ADR
- THEN the inspector lists the spec under its group

### Requirement: REQ-003 Diagrams list

The system SHALL list the Excalidraw, draw.io, Mermaid and BPMN files of the project in Design / Diagrams. Each row SHALL show the title and the format. The view SHALL have one primary action: new diagram.

#### Scenario: Four formats
- GIVEN one file of each format
- WHEN the person opens Design / Diagrams
- THEN the list shows four rows with their formats

#### Scenario: Empty list
- GIVEN a project with no diagram
- WHEN the person opens Design / Diagrams
- THEN the view shows ghost rows and the new diagram action

### Requirement: REQ-004 Diagram open

The system SHALL open a diagram file for view or edit. [NEEDS CLARIFICATION: Q-040 Which diagram formats does Shipyard edit in the app?] Working assumption: Q-040 option 1, edit Excalidraw and Mermaid, and show draw.io and BPMN read-only with an action to open the file in another app. The system SHALL show every format in the EditorFrame.

#### Scenario: Open
- GIVEN a Mermaid file
- WHEN the person selects it
- THEN the EditorFrame shows the diagram

#### Scenario: Save
- GIVEN a diagram that the app edits
- WHEN the person saves
- THEN the file holds the change

### Requirement: REQ-005 Unreadable diagram

The system SHALL show an error for a diagram file that it cannot read. The system MUST NOT change that file.

#### Scenario: Corrupt file
- GIVEN a BPMN file with invalid content
- WHEN the person opens it
- THEN the view shows an error
- AND the file stays unchanged

### Requirement: REQ-006 Architecture render

The system SHALL list the LikeC4 models in Design / Architecture. The system SHALL render the open model live as the text changes.

#### Scenario: Live render
- GIVEN an open model
- WHEN the person adds an element to the text
- THEN the render shows the element

### Requirement: REQ-007 Architecture error

The system SHALL keep the last good render when a model does not parse. The system SHALL show the error with its line.

#### Scenario: Syntax error
- GIVEN an open model
- WHEN the person types an invalid line
- THEN the render keeps the last good view
- AND the error shows with its line

### Requirement: REQ-008 Decisions list

The system SHALL list the ADRs of the project in Design / Decisions. Each row SHALL show the number, the title and the status.

#### Scenario: List
- GIVEN ten ADR files
- WHEN the person opens Design / Decisions
- THEN the list shows ten rows with number, title and status

### Requirement: REQ-009 New ADR

The system SHALL create an ADR from the MADR template. The new ADR SHALL take the next free number and the status proposed.

#### Scenario: Next number
- GIVEN ADRs 0001 to 0010
- WHEN the person creates an ADR
- THEN the new file has the number 0011 and the MADR sections

### Requirement: REQ-010 Accept or reject

The system SHALL accept or reject a proposed ADR with a comment. The system SHALL record the status, the date and the comment in the ADR file. The view SHALL have one primary action, accept, with reject as the other choice.

#### Scenario: Accept
- GIVEN a proposed ADR
- WHEN the architect accepts it with a comment
- THEN the file shows the status accepted, the date and the comment

#### Scenario: Reject with no comment
- GIVEN a proposed ADR
- WHEN the architect rejects it with an empty comment
- THEN the system asks for a comment and keeps the status proposed

### Requirement: REQ-011 API list

The system SHALL list the OpenAPI contracts in Design / API. Each row SHALL show the title and the version.

#### Scenario: List
- GIVEN two contracts
- WHEN the person opens Design / API
- THEN the list shows two rows

### Requirement: REQ-012 API read view

The system SHALL show a read view of a contract. The view SHALL group endpoints by tag. Each endpoint SHALL show its method, path, parameters and responses.

#### Scenario: Read
- GIVEN a contract with two tags
- WHEN the person opens it
- THEN the view shows two groups of endpoints

#### Scenario: Invalid contract
- GIVEN a contract that is not valid OpenAPI
- WHEN the person opens it
- THEN the view shows the error and no endpoint

### Requirement: REQ-013 API try view

The system SHALL offer a try view that sends a request from a contract and shows the status and the body of the response. [NEEDS CLARIFICATION: Q-039 Which servers can the API try view call?] Working assumption: Q-039 option 1, any listed server, with one click and the server name before a request that is not GET. A secret MUST NOT appear in a URL or a log.

#### Scenario: Send
- GIVEN an endpoint with a server
- WHEN the person sends a request
- THEN the view shows the response status and body

#### Scenario: Network failure
- GIVEN a server that does not answer
- WHEN the person sends a request
- THEN the view shows the failure and no response

### Requirement: REQ-014 Data models

The system SHALL list the DBML data models in Design / Data. The system SHALL show the open model as tables and relations.

#### Scenario: Show tables
- GIVEN a DBML file with three tables and two relations
- WHEN the person opens it
- THEN the view shows three tables and two relations

### Requirement: REQ-015 Data error

The system SHALL show a DBML error with its line. The system SHALL keep the last good view.

#### Scenario: Syntax error
- GIVEN an open DBML model
- WHEN the person types an invalid line
- THEN the view keeps the last good tables
- AND the error shows with its line

### Requirement: REQ-016 Flow table

The system SHALL show the network flow table in Design / Flows. Each row SHALL hold source, destination, VLAN or VNET, protocol and action. The action SHALL be allow or deny.

#### Scenario: Show rows
- GIVEN a flow table with 20 rows
- WHEN the person opens Design / Flows
- THEN the view shows 20 rows with a count in the heading

### Requirement: REQ-017 Flow filters

The system SHALL filter the flow table by VLAN or VNET, by protocol, by action and by free text. Filters SHALL combine.

#### Scenario: Two filters
- GIVEN a table with allow and deny rows on two VLANs
- WHEN the person filters by one VLAN and by deny
- THEN the view shows only the deny rows of that VLAN

### Requirement: REQ-018 Flow edit

The system SHALL add, edit and remove a flow row. The system SHALL reject a row with a missing field.

#### Scenario: Missing field
- GIVEN a new row with no protocol
- WHEN the person saves it
- THEN the system rejects the row and names the missing field

### Requirement: REQ-019 Screens

The system SHALL list the screens in Design / Screens with their design artifacts and `.fig` links. The system SHALL open a `.fig` link outside the app.

#### Scenario: Open a link
- GIVEN a screen with a `.fig` link
- WHEN the person selects the link
- THEN the link opens outside the app

#### Scenario: Missing target
- GIVEN a screen whose linked file does not exist
- WHEN the person opens the screen
- THEN the view shows the link as broken

### Requirement: REQ-020 Design to code

The system SHALL start a run from a screen or an ADR through the factory. [NEEDS CLARIFICATION: Q-038 How does a screen or an ADR start a run?] Working assumption: Q-038 option 1. One click creates a work item that cites the ref through `add-work` REQ-029. Normal pickup starts the run. The run MUST obey the factory rules and the write switches.

#### Scenario: Start from an ADR
- GIVEN an accepted ADR
- WHEN the person uses the design to code action
- THEN `add-work` REQ-029 creates a work item that cites the ADR
- AND the person sees the item that starts the run

### Requirement: REQ-021 Design doc

The system SHALL show and edit the design doc of the project in Design / Screens.

#### Scenario: Edit
- GIVEN the design doc
- WHEN the person edits and saves
- THEN the file holds the new text

### Requirement: REQ-022 Interface rules

Each Design view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path and a focus ring. It SHALL have assistive labels, enough contrast and reduced motion. It SHALL show French and English text.

#### Scenario: Keyboard
- GIVEN any Design view
- WHEN the person uses the keyboard only
- THEN the person reaches each action and sees a focus ring

#### Scenario: Language
- GIVEN the language French
- WHEN the person opens a Design view
- THEN each label shows in French

### Requirement: REQ-023 Safe save

The system SHALL write a file in full or not at all. The system SHALL warn before it replaces a file that changed on disk after the person opened it.

#### Scenario: Changed on disk
- GIVEN an ADR that another tool changed after it opened
- WHEN the person saves
- THEN the system warns and offers to reload or to keep the version of the person

#### Scenario: Failed write
- GIVEN a write that fails
- WHEN the system reports the failure
- THEN the old file stays unchanged

### Requirement: REQ-024 Figma tokens

The system SHALL read the design tokens of a linked Figma file. It SHALL show them beside the tokens of the project design doc (REQ-021). [NEEDS CLARIFICATION: Q-054 Who owns the extraction of design tokens from Figma?] Working assumption: Q-054 option 1, Design / Screens owns the read and the person owns the change to the token file. The system MUST NOT change the token file before one click of the person.

#### Scenario: Show tokens
- GIVEN a screen with a linked Figma file
- WHEN the person uses the extract tokens action
- THEN the view shows the tokens of the file beside the tokens of the project design doc

#### Scenario: No click
- GIVEN the shown tokens
- WHEN the person closes the view with no confirmation
- THEN the token file stays unchanged

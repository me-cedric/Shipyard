# Spec: refs

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-refs`

### Goal

Each entity of a project has one stable ref. A person sees, for each entity, which entities cite it. A person finds any entity by its ref or title. A broken ref shows in Settings / Health.

### Why

Legacy pages connect only through a staleness graph. A person cannot see which spec cites an ADR, or which run touched a ticket. One reference graph fixes this. The knowledge graph is this graph, drawn.

### Users And Scenarios

- PM: opens a work item and sees the runs and pull requests that cite it.
- Architect: opens an ADR and sees the specs and diagrams that cite it.
- Developer: pastes `wi:SHIP-42` in a note and clicks the chip to open the ticket.
- QA: opens a requirement and sees the test plans that cite it.
- BA: opens a question and sees the spec that raised it.
- Functional lead: searches `REQ-004` in the palette and opens the requirement.
- Junior: hovers a chip to learn what an entity is, without leaving the page.

### Requirements

- REQ-001: The system SHALL define one ref form for each entity kind in the ref grammar.
- REQ-002: The system SHALL reject a ref that does not match the grammar of its kind.
- REQ-003: The system SHALL index the refs of the repository files, the tracker mirror and the run log.
- REQ-004: The system SHALL update the index when a source changes.
- REQ-005: The system SHALL detect refs in text. [NEEDS CLARIFICATION: Q-011 Does detection skip refs inside code spans and code blocks?] Working assumption: detection skips them.
- REQ-006: The system SHALL resolve a ref to its title, kind, state and location.
- REQ-007: The system SHALL list the backlinks of an entity, grouped by kind, with a count per group.
- REQ-008: The system SHALL search refs and titles for the command palette.
- REQ-009: The system SHALL detect a broken ref. [NEEDS CLARIFICATION: Q-012 Is a ref to a work item that the mirror does not hold broken or unresolved?] Working assumption: unresolved, not broken, until the next sync completes.
- REQ-010: The system SHALL report each broken ref in Settings / Health.
- REQ-011: A click on a RefChip SHALL open the entity.
- REQ-012: A hover or focus on a RefChip SHALL show the title and state of the entity.
- REQ-013: A RefChip SHALL meet the accessibility and language rules of the constitution.
- REQ-014: The system SHALL expose refs to the factory agents through the `read_ref` tool.

### Non-Goals

- Drawing the graph. The knowledge capability owns the graph view.
- Defining the entities. Each owner capability defines its entities.
- Staleness rules between cited entities. The knowledge capability owns them.
- Editing a ref in place. A person edits the text that holds it.

### Acceptance Criteria

- [ ] Each of the 21 kinds has one valid form and one rejected form in a test.
- [ ] A ref in a spec, a work item and a run log entry shows in the backlinks of its target.
- [ ] Backlinks show a group heading with a count for each kind.
- [ ] The palette finds an entity by ref and by title.
- [ ] A removed target shows as broken in Settings / Health with its source.
- [ ] A chip opens its entity with the mouse and with the keyboard.
- [ ] A chip tooltip shows the title and state only.
- [ ] A chip label reads correctly in French and in English.
- [ ] A run reads a ref through `read_ref` and gets the same title and state.

### Links

- Consumes: the entities of `add-projects`, `add-work`, `add-design`, `add-specs`, `add-questions-loop`, `add-factory`, `add-delivery`, `add-code`, `add-knowledge`, `add-connections`; the tracker mirror of `add-sync`.
- Produces: the ref parser, the ref index, backlinks and search for `add-shell` (palette, inspector), `add-knowledge` (graph, explain), `add-assistant` (context) and `add-factory` (`read_ref`); the broken-ref report for `add-projects` (health); the RefChip behaviour for `add-design-system`.

### Legacy parity

| Legacy feature | Shipyard view | REQ ids |
|---|---|---|
| "Chain" staleness graph | Backlinks in the inspector of every entity | REQ-003, REQ-007 |
| Cross-page links | RefChip in every view | REQ-005, REQ-006, REQ-011, REQ-012 |
| Search | Command palette | REQ-008 |

### Existing References

- Existing code/docs/specs: `docs/plan/MASTER-PLAN.md` sections 3 and 8; `.agents/progress/w1.md` (ref table); `docs/openspec/constitution.md` section 2.
- Supersedes or extends: N/A

## ADDED Requirements

### Requirement: REQ-001 Ref grammar

The system SHALL define one ref form for each entity kind: `project:<id>`, `member:<handle>`, `diagram:<slug>`, `model:<slug>`, `adr:NNNN`, `api:<slug>`, `data:<slug>`, `flow:<slug>`, `screen:<slug>`, `change:<id>`, `spec:<capability>`, `spec:<capability>#REQ-NNN`, `test:<slug>`, `q:Q-NNN`, `wi:<KEY-N>`, `est:<slug>`, `wf:<id>`, `run:<ulid>`, `run:<ulid>/<step-id>`, `pr:<forge>:<number>`, `commit:<sha>`, `doc:<path>` and `conn:<id>`.

#### Scenario: Valid form of each kind
- GIVEN the ref grammar
- WHEN a test parses `adr:0004`, `q:Q-012`, `wi:SHIP-42`, `pr:github:42` and `spec:auth#REQ-003`
- THEN each ref parses to its kind and its parts

#### Scenario: Two forms for one kind
- GIVEN the kinds `spec` and `run`
- WHEN a test parses `run:01JD0000000000000000000000/plan`
- THEN the ref parses as a step of that run

### Requirement: REQ-002 Reject invalid refs

The system SHALL reject a ref that does not match the grammar of its kind. It MUST NOT treat the text as a ref.

#### Scenario: Unknown kind
- GIVEN the text `foo:bar`
- WHEN the system parses it
- THEN the system returns no ref

#### Scenario: Bad number
- GIVEN the text `adr:12`
- WHEN the system parses it
- THEN the system returns no ref

### Requirement: REQ-003 Index sources

The system SHALL index the refs that the repository files, the tracker mirror and the run log hold. Each index entry records the source entity and the target ref.

#### Scenario: Three sources
- GIVEN a spec that cites `adr:0004`, a mirrored work item that cites `spec:auth`, and a run log entry that cites `wi:SHIP-42`
- WHEN the index is built
- THEN the index holds all three citations

### Requirement: REQ-004 Keep the index current

The system SHALL update the index when a repository file, the mirror or the run log changes. A person MUST NOT need to trigger the update.

#### Scenario: File edit
- GIVEN an indexed spec
- WHEN a person adds `diagram:context` to it and saves
- THEN the backlinks of `diagram:context` list the spec without a manual action

#### Scenario: Citation removed
- GIVEN an indexed spec that cites `adr:0004`
- WHEN a person removes the citation
- THEN the backlinks of `adr:0004` no longer list the spec

### Requirement: REQ-005 Detect refs in text

The system SHALL detect each valid ref in text and mark it for display as a RefChip. [NEEDS CLARIFICATION: Q-011 Does detection skip refs inside code spans and code blocks?] The working assumption is that detection skips them.

#### Scenario: Ref in prose
- GIVEN the text "See adr:0004 for the reason."
- WHEN the system detects refs
- THEN it finds one ref, `adr:0004`

#### Scenario: Ref in a code span
- GIVEN the text "Write `adr:0004` in the field."
- WHEN the system detects refs
- THEN it finds no ref

### Requirement: REQ-006 Resolve a ref

The system SHALL resolve a ref to the title, the kind, the state and the location of its entity. When no entity matches, the system SHALL return an unresolved result.

#### Scenario: Known entity
- GIVEN the ref `wi:SHIP-42` and a mirrored work item
- WHEN the system resolves it
- THEN it returns the title and the status of the work item

#### Scenario: Unknown entity
- GIVEN the ref `adr:9999` and no such ADR
- WHEN the system resolves it
- THEN it returns an unresolved result

### Requirement: REQ-007 Backlinks

The system SHALL list, for each entity, the entities that cite it. The list SHALL group the entities by kind. Each group heading SHALL show a count.

#### Scenario: Grouped list
- GIVEN `adr:0004` cited by two specs and one diagram
- WHEN a person opens the backlinks of `adr:0004`
- THEN the list shows a group "spec" with count 2 and a group "diagram" with count 1

#### Scenario: No citation
- GIVEN an entity that nothing cites
- WHEN a person opens its backlinks
- THEN the view shows ghost rows and no text

### Requirement: REQ-008 Search

The system SHALL search refs and titles and return matches for the command palette. A match on a ref MUST rank above a match on a title.

#### Scenario: Search by ref
- GIVEN the ref `q:Q-012`
- WHEN a person types `Q-012` in the palette
- THEN the first result is that question

#### Scenario: Search by title
- GIVEN an ADR titled "Polling sync with local mirror"
- WHEN a person types `polling` in the palette
- THEN the ADR is in the results

### Requirement: REQ-009 Detect broken refs

The system SHALL detect a ref whose target does not exist. [NEEDS CLARIFICATION: Q-012 Is a ref to a work item that the mirror does not hold broken or unresolved?] The working assumption is that such a ref is unresolved, not broken, until the next sync completes.

#### Scenario: Removed ADR
- GIVEN a spec that cites `adr:0004` and a repository without that ADR
- WHEN the system checks refs
- THEN it marks the citation as broken

#### Scenario: Work item absent from the mirror
- GIVEN a spec that cites `wi:SHIP-99` and a mirror that does not hold it
- WHEN the system checks refs before the next sync completes
- THEN the ref stays unresolved and no broken-ref finding shows

#### Scenario: Still absent after sync
- GIVEN the same citation and a sync that completes without `wi:SHIP-99`
- WHEN the system checks refs
- THEN it marks the citation as broken

#### Scenario: Valid target
- GIVEN a spec that cites an existing diagram
- WHEN the system checks refs
- THEN it reports no finding

### Requirement: REQ-010 Broken-ref report

The system SHALL report each broken ref in Settings / Health. Each finding SHALL show the broken ref and its source. The `projects` capability owns the fix action.

#### Scenario: Finding shown
- GIVEN a broken ref in a spec
- WHEN a person opens Settings / Health
- THEN a finding lists the ref and a RefChip of the spec

### Requirement: REQ-011 RefChip click

A click on a RefChip SHALL open its entity in the view that owns it. The Enter key on a focused chip SHALL do the same.

#### Scenario: Open by click
- GIVEN a chip `wi:SHIP-42` in a spec
- WHEN a person clicks it
- THEN Work opens with that item in the inspector

#### Scenario: Open by keyboard
- GIVEN a focused chip
- WHEN a person presses Enter
- THEN the entity opens

#### Scenario: Unresolved chip
- GIVEN a chip with no target
- WHEN a person clicks it
- THEN nothing opens and the chip shows the unresolved status shape, distinct from the broken shape

### Requirement: REQ-012 RefChip tooltip

A hover or a focus on a RefChip SHALL show a tooltip with the title and the state of the entity. The tooltip MUST NOT show any other text.

#### Scenario: Hover
- GIVEN a chip `pr:github:42`
- WHEN a person hovers it
- THEN a tooltip shows the pull request title and state

#### Scenario: Focus
- GIVEN a chip
- WHEN a person tabs to it
- THEN the same tooltip shows

### Requirement: REQ-013 RefChip accessibility

A RefChip SHALL have a keyboard path, a focus ring, enough contrast, and no motion under reduced motion. Its accessible name SHALL hold the kind and the title. Its text SHALL exist in French and English. Its state SHALL use shape and colour together.

#### Scenario: Assistive technology
- GIVEN a screen reader
- WHEN focus lands on a chip
- THEN it announces the kind, the title and the state

#### Scenario: Reduced motion
- GIVEN the reduced-motion preference is on
- WHEN a tooltip opens
- THEN it shows with no animation

### Requirement: REQ-014 Agent read access

The system SHALL return the title, the state, the location and the backlinks of a ref to a factory agent that calls the `read_ref` tool. The tool MUST be read-only.

#### Scenario: Agent reads a ref
- GIVEN a run with the `read_ref` tool
- WHEN the agent asks for `spec:auth#REQ-003`
- THEN it gets the title, the state and the citing entities

#### Scenario: Unknown ref
- GIVEN a run with the `read_ref` tool
- WHEN the agent asks for a ref with no target
- THEN it gets an unresolved result

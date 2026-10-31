# Spec: specs

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `docs/openspec/changes/archive/2026-10-31-add-specs/`

### Goal

The BA and the functional lead write and review OpenSpec changes in one Specs space. They answer questions and write test plans there. The PM splits a change into work items and hands the reviewed split to the apply of `add-work`.

### Why

Specs come before code, for people and for agents. The earlier tool shows changes, RAID questions and Gherkin plans on separate pages. The split into tickets lives in the costing tool. One space joins them, and each requirement keeps its id from spec to ticket.

### Users And Scenarios

- BA: writes a change, checks its validation per artifact, and sees each open marker.
- Functional lead: reviews a change and answers a question in the register.
- QA: writes a test plan in Gherkin and sees which requirements have no scenario.
- PM: reviews the split of a change and hands it to the apply of `add-work`.
- Architect: opens a requirement and sees the ADRs and diagrams that it cites.
- Developer: opens the requirement of a work item and reads its scenarios.
- Junior: reads the settled capabilities and the constitution to learn the rules.

### Requirement list

- REQ-001: The system SHALL list the OpenSpec changes of the project in Specs / Changes. The view SHALL have one primary action: new change.
- REQ-002: The system SHALL show the status of each artifact of a change: missing, draft or done. An artifact is missing when its file does not exist. It is done when it passes strict validation. Otherwise it is draft. The artifacts are the proposal, the spec, the plan, the checklist and the tasks.
- REQ-003: The system SHALL create a change with the `shipyard-delivery` schema. The system SHALL edit each artifact of a change in an editor.
- REQ-004: The system SHALL validate a change with the OpenSpec rules in strict mode. The system SHALL show each finding on the artifact that holds it, with its line.
- REQ-005: The system SHALL list the settled capabilities in Specs / Capabilities. Each row SHALL show the capability name and its count of requirements.
- REQ-006: The system SHALL show each requirement with its id. The system SHALL show its backlinks in the inspector, grouped by kind.
- REQ-007: The system SHALL count the open `[NEEDS CLARIFICATION]` markers of a spec. The system SHALL link each marker to its question.
- REQ-008: The system SHALL list the RAID register in Specs / Questions. Each row SHALL show kind, status and owner. The view SHALL filter by kind, status and owner.
- REQ-009: The system SHALL read and write each question as one file. The file SHALL hold nine frontmatter keys in this order: id, kind, status, raisedAt, raisedBy, owner, specRef, taskRef and ticket.
- REQ-010: The system SHALL let a person create a question and change its fields. The system SHALL reject an unknown kind, an unknown status and a duplicate id.
- REQ-011: The system SHALL list the test plans in Specs / Test plans. One folder `docs/delivery/test-plans/` with one `.feature` file per plan. Each row SHALL show the plan title, its scenario count and the requirements that it cites.
- REQ-012: The system SHALL edit a test plan in Gherkin. The system SHALL report each syntax error with its line.
- REQ-013: A scenario of a test plan SHALL cite one or more requirements by ref. The system SHALL list the requirements of a spec that no scenario cites.
- REQ-014: The system SHALL show the constitution in Specs / Constitution. The system SHALL let a person edit it.
- REQ-015: After one click, the system SHALL write the answer to a spec-level question into the `### Clarifications` heading of the spec. The system MUST NOT add a `## ` section. The system SHALL replace the matching marker with the answer. This is the only fold write: `add-questions-loop` REQ-015 offers the preview, and this requirement writes.
- REQ-016: The system SHALL draft the split of a change into epics and stories. A person SHALL draft it by hand, or the `spec-split` workflow SHALL draft it. Each item SHALL cite the requirements that it covers. Each item SHALL have a row id. Its row ref SHALL be `est:<change-id>#<row-id>`.
- REQ-017: The system SHALL show the draft split for review. The PM SHALL be able to edit, remove or add an item before the apply.
- REQ-018: The system SHALL hand a reviewed split to the apply of `add-work` (REQ-025, REQ-026) only after one click of the PM. The system MUST NOT write the split to the tracker by another path. The apply SHALL use the row ref of `add-work` REQ-026 as its match mark, so a second apply creates no duplicate. The click SHALL count as the approval of the writes. A comment or a status move SHALL follow the factory switches. Working assumption: Q-033 option 1, the row ref in a ticket label.
- REQ-019: The system SHALL keep the link between each work item and its requirements. Match each item by its requirement refs. Create only the missing items and show the changed ones for review. Q-035 uses the match mark of Q-033.
- REQ-020: The system SHALL archive a change when its work items are done. Archive needs all work items done or closed. The person confirms a list of the open ones to override. The archive SHALL move the capability specs of the change into the settled capabilities.
- REQ-021: The system SHALL expose each change as `change:<id>`, each capability as `spec:<capability>`, each requirement as `spec:<capability>#REQ-NNN`, and each test plan as `test:<slug>`. The reference graph SHALL index them.
- REQ-022: Each Specs view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path and a focus ring. It SHALL have assistive labels, enough contrast and reduced motion. It SHALL show French and English text.
- REQ-023: The system SHALL write a file in full or not at all. The system SHALL warn before it replaces a file that changed on disk after the person opened it.

### Non-Goals

- Writing the content of a spec. Agents and people write it.
- The `spec-split` workflow itself. The factory capability owns it.
- Asking a question and detecting its answer. The questions-loop capability owns that loop.
- Guidance of OpenSpec for child repositories. The extensions capability owns it.
- Estimates and costing of the split. The work capability owns them.
- The tracker write of a split. The `add-work` apply owns it (REQ-025, REQ-026). The factory switches govern all other writes.

### Acceptance Criteria

- [ ] Specs / Changes lists each change with five artifact statuses.
- [ ] A validation error shows on the artifact that holds it, with its line.
- [ ] A requirement shows its id and a count of backlinks by kind.
- [ ] A question file keeps the nine keys in order after an edit.
- [ ] A question with an unknown kind or status is rejected with a message.
- [ ] A scenario that cites `spec:specs#REQ-004` shows in the backlinks of that requirement.
- [ ] A requirement that no scenario cites shows in the coverage list.
- [ ] A fold writes the answer under `### Clarifications` and adds no `## ` section.
- [ ] A split writes nothing to the tracker before the PM clicks apply.
- [ ] A second apply of one split creates no duplicate ticket.
- [ ] Each work item of a split shows the refs of its requirements.
- [ ] A save that fails leaves the old file unchanged.
- [ ] Every Specs view works with the keyboard and shows in French and English.

### Links

- Consumes: `add-design` (ADR, diagram, API and data refs that a spec cites), `add-questions-loop` REQ-015 (the fold offer) and REQ-007 (the question file), `add-factory` REQ-011 (the `spec-split` workflow), `add-work` REQ-025 and REQ-026 (the apply), `add-connections` REQ-003 and REQ-004 (tracker capability flags and work item shape), `add-refs` REQ-007 (backlinks), `add-design-system` (EditorFrame).
- Produces: `change:`, `spec:` and `test:` entities for `add-refs`; the RAID register for `add-questions-loop`; the reviewed split for the `add-work` apply; `spec-split` input for `add-factory`.
- Related: `q:Q-033` (the match mark), `q:Q-002` (all automation writes off by default; the apply of a split is a click, not a switch), `spec:factory` REQ-025 and REQ-026.

### Feature list

| Feature | Shipyard view | REQ ids |
|---|---|---|
| Specifications (OpenSpec) | Specs / Changes and Capabilities | REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007 |
| Delegate | Split action on a change, then Factory / Runs | REQ-016, REQ-017, REQ-018, REQ-019 |
| Questions (RAID) | Specs / Questions | REQ-008, REQ-009, REQ-010, REQ-015 |
| Test plans (Gherkin) | Specs / Test plans | REQ-011, REQ-012, REQ-013 |
| Constitution file | Specs / Constitution | REQ-014 |
| Archive of a change | Specs / Changes | REQ-020 |
| OpenSpec guidance for child repos | Settings / Extensions (owned by `add-extensions`) | none |

### Existing References

- Existing code/docs/specs: `docs/plan/MASTER-PLAN.md` sections 3, 4 and 11; `docs/openspec/constitution.md` sections 2 to 5; `docs/delivery/questions/Q-002.md`; `.agents/progress/w1.md`.
- Supersedes or extends: N/A

### Clarifications

- Q-037 Where do test plan files live?: One folder `docs/delivery/test-plans/` with one `.feature` file per plan.
- Q-035 What happens when a person applies a split again after a change of the spec?: Match each item by its requirement refs. Create only the missing items and show the changed ones for review.
- Q-036 May a person archive a change with open work items?: Archive needs all work items done or closed. The person confirms a list of the open ones to override.

## Requirements

### Requirement: REQ-001 Changes list

The system SHALL list the OpenSpec changes of the project in Specs / Changes. The view SHALL have one primary action: new change.

#### Scenario: List
- GIVEN a project with three change folders
- WHEN the person opens Specs / Changes
- THEN the view lists three changes with their ids

#### Scenario: Empty list
- GIVEN a project with no change
- WHEN the person opens Specs / Changes
- THEN the view shows ghost rows and the new change action

### Requirement: REQ-002 Artifact status

The system SHALL show the status of each artifact of a change: missing, draft or done. An artifact is missing when its file does not exist. It is done when it passes strict validation. Otherwise it is draft. The artifacts are the proposal, the spec, the plan, the checklist and the tasks.

#### Scenario: Partial change
- GIVEN a change with a valid proposal and a spec that has one finding
- WHEN the person opens the change
- THEN the proposal shows done and the spec shows draft
- AND the plan, the checklist and the tasks show missing

### Requirement: REQ-003 Create and edit a change

The system SHALL create a change with the `shipyard-delivery` schema. The system SHALL edit each artifact of a change in an editor.

#### Scenario: Create
- GIVEN a valid change id in kebab-case
- WHEN the person creates the change
- THEN the change exists with an empty proposal

#### Scenario: Invalid id
- GIVEN an id with a space or a capital letter
- WHEN the person creates the change
- THEN the system rejects the id and creates nothing

### Requirement: REQ-004 Validation per artifact

The system SHALL validate a change with the OpenSpec rules in strict mode. The system SHALL show each finding on the artifact that holds it, with its line.

#### Scenario: Finding on a spec
- GIVEN a spec with a requirement that has no scenario
- WHEN the person validates the change
- THEN the spec artifact shows the finding with its line
- AND the other artifacts show no finding

#### Scenario: Valid change
- GIVEN a change with no finding
- WHEN the person validates it
- THEN each artifact shows a valid state

### Requirement: REQ-005 Capabilities list

The system SHALL list the settled capabilities in Specs / Capabilities. Each row SHALL show the capability name and its count of requirements.

#### Scenario: Open a capability
- GIVEN a settled capability
- WHEN the person selects it
- THEN the view shows its spec, its plan, its checklist and its tasks

### Requirement: REQ-006 Requirement ids and backlinks

The system SHALL show each requirement with its id. The system SHALL show its backlinks in the inspector, grouped by kind.

#### Scenario: Backlinks of a requirement
- GIVEN a test plan scenario and a work item that cite `spec:specs#REQ-004`
- WHEN the person selects that requirement
- THEN the inspector shows one `test:` link and one `wi:` link

### Requirement: REQ-007 Open markers

The system SHALL count the open `[NEEDS CLARIFICATION]` markers of a spec. The system SHALL link each marker to its question.

#### Scenario: Marker with a question
- GIVEN a spec with the marker `Q-035`
- WHEN the person opens the spec
- THEN the view shows one open marker that links to `q:Q-035`

#### Scenario: Marker with no question
- GIVEN a marker with no `Q-NNN` id
- WHEN the person opens the spec
- THEN the view shows the marker as unlinked

### Requirement: REQ-008 Questions register

The system SHALL list the RAID register in Specs / Questions. Each row SHALL show kind, status and owner. The view SHALL filter by kind, status and owner.

#### Scenario: Filter by status
- GIVEN a register with open and closed questions
- WHEN the person filters by status open
- THEN the list shows the open questions only

### Requirement: REQ-009 Question file

The system SHALL read and write each question as one file. The file SHALL hold nine frontmatter keys in this order: id, kind, status, raisedAt, raisedBy, owner, specRef, taskRef and ticket.

#### Scenario: Write order
- GIVEN a question with all fields set
- WHEN the system writes the file
- THEN the nine keys appear in the fixed order

#### Scenario: Missing key
- GIVEN a question file with no `owner` key
- WHEN the system reads the register
- THEN the system flags that file and does not drop it

### Requirement: REQ-010 Question edit

The system SHALL let a person create a question and change its fields. The system SHALL reject an unknown kind, an unknown status and a duplicate id.

#### Scenario: Unknown status
- GIVEN a question
- WHEN the person sets the status to a value outside the allowed list
- THEN the system rejects the value and keeps the file unchanged

#### Scenario: Duplicate id
- GIVEN a register that holds `Q-012`
- WHEN the person creates another question with the id `Q-012`
- THEN the system rejects the id

### Requirement: REQ-011 Test plans list

The system SHALL list the test plans in Specs / Test plans. One folder `docs/delivery/test-plans/` with one `.feature` file per plan. Each row SHALL show the plan title, its scenario count and the requirements that it cites.

#### Scenario: List
- GIVEN two test plan files
- WHEN the person opens Specs / Test plans
- THEN the view lists two plans

### Requirement: REQ-012 Gherkin editing

The system SHALL edit a test plan in Gherkin. The system SHALL report each syntax error with its line.

#### Scenario: Syntax error
- GIVEN a plan with a step that has no keyword
- WHEN the person saves it
- THEN the system shows the error with its line

### Requirement: REQ-013 Requirement coverage

A scenario of a test plan SHALL cite one or more requirements by ref. The system SHALL list the requirements of a spec that no scenario cites.

#### Scenario: Uncovered requirement
- GIVEN a spec with ten requirements and scenarios that cite nine of them
- WHEN the person opens the coverage list
- THEN the list shows the tenth requirement

#### Scenario: Unknown requirement
- GIVEN a scenario that cites `spec:specs#REQ-999`
- WHEN the person saves the plan
- THEN the system flags the citation as broken

### Requirement: REQ-014 Constitution

The system SHALL show the constitution in Specs / Constitution. The system SHALL let a person edit it.

#### Scenario: Edit
- GIVEN the constitution
- WHEN the person edits a rule and saves
- THEN the file holds the new text

### Requirement: REQ-015 Fold an answer

After one click, the system SHALL write the answer to a spec-level question into the `### Clarifications` heading of the spec. The system MUST NOT add a `## ` section. The system SHALL replace the matching marker with the answer. This is the only fold write: `add-questions-loop` REQ-015 offers the preview, and this requirement writes.

#### Scenario: Fold
- GIVEN an answered question that a marker cites
- WHEN the person confirms the fold preview
- THEN the answer appears under `### Clarifications`
- AND the marker no longer shows in the spec

#### Scenario: No heading yet
- GIVEN a spec with no `### Clarifications` heading
- WHEN the person confirms the fold
- THEN the system adds the heading under `## Purpose`

### Requirement: REQ-016 Split draft

The system SHALL draft the split of a change into epics and stories. A person SHALL draft it by hand, or the `spec-split` workflow SHALL draft it. Each item SHALL cite the requirements that it covers. Each item SHALL have a row id. Its row ref SHALL be `est:<change-id>#<row-id>`.

#### Scenario: Draft with the workflow
- GIVEN a change with a spec
- WHEN the person starts the split
- THEN the draft lists epics and stories with refs of requirements
- AND the system writes nothing to the tracker

### Requirement: REQ-017 Split review

The system SHALL show the draft split for review. The PM SHALL be able to edit, remove or add an item before the apply.

#### Scenario: Remove an item
- GIVEN a draft with six stories
- WHEN the PM removes one story
- THEN the apply covers five stories

### Requirement: REQ-018 Split apply

The system SHALL hand a reviewed split to the apply of `add-work` (REQ-025, REQ-026) only after one click of the PM. The system MUST NOT write the split to the tracker by another path. The apply SHALL use the row ref of `add-work` REQ-026 as its match mark, so a second apply creates no duplicate. The click SHALL count as the approval of the writes. A comment or a status move SHALL follow the factory switches. Working assumption: Q-033 option 1, the row ref in a ticket label.

#### Scenario: Apply
- GIVEN a reviewed split and a tracker connection
- WHEN the PM clicks apply
- THEN the system hands the split to the apply of `add-work`
- AND the tracker holds the epics and stories
- AND each one shows as a `wi:` entity after the next sync

#### Scenario: No click
- GIVEN a draft split that the `spec-split` workflow made
- WHEN no person clicks apply
- THEN the tracker stays unchanged

#### Scenario: Second apply
- GIVEN a split that the PM applied
- WHEN the PM applies it again
- THEN the tracker receives no duplicate ticket

### Requirement: REQ-019 Split links

The system SHALL keep the link between each work item and its requirements. Match each item by its requirement refs. Create only the missing items and show the changed ones for review. Q-035 uses the match mark of Q-033.

#### Scenario: Links after apply
- GIVEN an applied split
- WHEN a person opens a work item
- THEN the item shows the refs of its requirements

### Requirement: REQ-020 Archive

The system SHALL archive a change when its work items are done. Archive needs all work items done or closed. The person confirms a list of the open ones to override. The archive SHALL move the capability specs of the change into the settled capabilities.

#### Scenario: Archive a finished change
- GIVEN a change whose work items are all done
- WHEN the person archives it
- THEN the change leaves Specs / Changes
- AND its capabilities show in Specs / Capabilities

### Requirement: REQ-021 Entities

The system SHALL expose each change as `change:<id>`, each capability as `spec:<capability>`, each requirement as `spec:<capability>#REQ-NNN`, and each test plan as `test:<slug>`. The reference graph SHALL index them.

#### Scenario: Resolve
- GIVEN the ref `change:add-specs`
- WHEN the reference graph resolves it
- THEN it returns the title and status of the change

### Requirement: REQ-022 Interface rules

Each Specs view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path and a focus ring. It SHALL have assistive labels, enough contrast and reduced motion. It SHALL show French and English text.

#### Scenario: Keyboard
- GIVEN any Specs view
- WHEN the person uses the keyboard only
- THEN the person reaches each action and sees a focus ring

#### Scenario: Language
- GIVEN the language French
- WHEN the person opens a Specs view
- THEN each label shows in French

### Requirement: REQ-023 Safe save

The system SHALL write a file in full or not at all. The system SHALL warn before it replaces a file that changed on disk after the person opened it.

#### Scenario: Changed on disk
- GIVEN a spec that another tool changed after it opened
- WHEN the person saves
- THEN the system warns and offers to reload or to keep the version of the person

#### Scenario: Failed write
- GIVEN a write that fails
- WHEN the system reports the failure
- THEN the old file stays unchanged

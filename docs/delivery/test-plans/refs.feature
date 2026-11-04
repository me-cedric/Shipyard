Feature: refs

  @spec:refs#REQ-001
  Scenario: Ref grammar: Valid form of each kind
    Given the ref grammar
    When a test parses `adr:0004`, `q:Q-012`, `wi:SHIP-42`, `pr:github:42` and `spec:auth#REQ-003`
    Then each ref parses to its kind and its parts

  @spec:refs#REQ-001
  Scenario: Ref grammar: Row of an estimate sheet
    Given the ref grammar
    When a test parses `est:auth#r3`
    Then the ref parses as the row `r3` of the sheet `auth`

  @spec:refs#REQ-001
  Scenario: Ref grammar: Two forms for one kind
    Given the kinds `spec` and `run`
    When a test parses `run:01JD0000000000000000000000/plan`
    Then the ref parses as a step of that run

  @spec:refs#REQ-002
  Scenario: Reject invalid refs: Unknown kind
    Given the text `foo:bar`
    When the system parses it
    Then the system returns no ref

  @spec:refs#REQ-002
  Scenario: Reject invalid refs: Bad number
    Given the text `adr:12`
    When the system parses it
    Then the system returns no ref

  @spec:refs#REQ-003
  Scenario: Index sources: Three sources
    Given a spec that cites `adr:0004`, a mirrored work item that cites `spec:auth`, and a run log entry that cites `wi:SHIP-42`
    When the index is built
    Then the index holds all three citations

  @spec:refs#REQ-004
  Scenario: Keep the index current: File edit
    Given an indexed spec
    When a person adds `diagram:context` to it and saves
    Then the backlinks of `diagram:context` list the spec without a manual action

  @spec:refs#REQ-004
  Scenario: Keep the index current: Citation removed
    Given an indexed spec that cites `adr:0004`
    When a person removes the citation
    Then the backlinks of `adr:0004` no longer list the spec

  @spec:refs#REQ-005
  Scenario: Detect refs in text: Ref in prose
    Given the text "See adr:0004 for the reason."
    When the system detects refs
    Then it finds one ref, `adr:0004`

  @spec:refs#REQ-005
  Scenario: Detect refs in text: Ref in a code span
    Given the text "Write `adr:0004` in the field."
    When the system detects refs
    Then it finds no ref

  @spec:refs#REQ-006
  Scenario: Resolve a ref: Known entity
    Given the ref `wi:SHIP-42` and a mirrored work item
    When the system resolves it
    Then it returns the title and the status of the work item

  @spec:refs#REQ-006
  Scenario: Resolve a ref: Unknown entity
    Given the ref `adr:9999` and no such ADR
    When the system resolves it
    Then it returns an unresolved result

  @spec:refs#REQ-007
  Scenario: Backlinks: Grouped list
    Given `adr:0004` cited by two specs and one diagram
    When a person opens the backlinks of `adr:0004`
    Then the list shows a group "spec" with count 2 and a group "diagram" with count 1

  @spec:refs#REQ-007
  Scenario: Backlinks: No citation
    Given an entity that nothing cites
    When a person opens its backlinks
    Then the view shows ghost rows and no text

  @spec:refs#REQ-008
  Scenario: Search: Search by ref
    Given the ref `q:Q-012`
    When a person types `Q-012` in the palette
    Then the first result is that question

  @spec:refs#REQ-008
  Scenario: Search: Search by title
    Given an ADR titled "Polling sync with local mirror"
    When a person types `polling` in the palette
    Then the ADR is in the results

  @spec:refs#REQ-009
  Scenario: Detect broken refs: Removed ADR
    Given a spec that cites `adr:0004` and a repository without that ADR
    When the system checks refs
    Then it marks the citation as broken

  @spec:refs#REQ-009
  Scenario: Detect broken refs: Work item absent from the mirror
    Given a spec that cites `wi:SHIP-99` and a mirror that does not hold it
    When the system checks refs before the next sync completes
    Then the ref stays unresolved and no broken-ref finding shows

  @spec:refs#REQ-009
  Scenario: Detect broken refs: Still absent after sync
    Given the same citation and a sync that completes without `wi:SHIP-99`
    When the system checks refs
    Then it marks the citation as broken

  @spec:refs#REQ-009
  Scenario: Detect broken refs: Valid target
    Given a spec that cites an existing diagram
    When the system checks refs
    Then it reports no finding

  @spec:refs#REQ-010
  Scenario: Broken-ref report: Finding shown
    Given a broken ref in a spec
    When a person opens Settings / Health
    Then a finding lists the ref and a RefChip of the spec

  @spec:refs#REQ-011
  Scenario: RefChip click: Open by click
    Given a chip `wi:SHIP-42` in a spec
    When a person clicks it
    Then Work opens with that item in the inspector

  @spec:refs#REQ-011
  Scenario: RefChip click: Open by keyboard
    Given a focused chip
    When a person presses Enter
    Then the entity opens

  @spec:refs#REQ-011
  Scenario: RefChip click: Unresolved chip
    Given a chip with no target
    When a person clicks it
    Then nothing opens and the chip shows the unresolved status shape, distinct from the broken shape

  @spec:refs#REQ-012
  Scenario: RefChip tooltip: Hover
    Given a chip `pr:github:42`
    When a person hovers it
    Then a tooltip shows the pull request title and state

  @spec:refs#REQ-012
  Scenario: RefChip tooltip: Focus
    Given a chip
    When a person tabs to it
    Then the same tooltip shows

  @spec:refs#REQ-013
  Scenario: RefChip accessibility: Assistive technology
    Given a screen reader
    When focus lands on a chip
    Then it announces the kind, the title and the state

  @spec:refs#REQ-013
  Scenario: RefChip accessibility: Reduced motion
    Given the reduced-motion preference is on
    When a tooltip opens
    Then it shows with no animation

  @spec:refs#REQ-014
  Scenario: Agent read access: Agent reads a ref
    Given a run with the `read_ref` tool
    When the agent asks for `spec:auth#REQ-003`
    Then it gets the title, the state and the citing entities

  @spec:refs#REQ-014
  Scenario: Agent read access: Unknown ref
    Given a run with the `read_ref` tool
    When the agent asks for a ref with no target
    Then it gets an unresolved result

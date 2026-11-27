# Spec: refs (delta of add-outside-ref-read)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-26
Change: `change:add-outside-ref-read`

### Goal

An agent that a person runs outside Shipyard reads an item by its ref, with the same answer as `read_ref` of a run agent.

### Why

An outside agent can read files, tickets and ADRs, but it cannot follow a ref. It must not see more than the person sees.

### Users And Scenarios

- Developer: runs Claude Code in a terminal, and the agent reads `adr:0011` and the specs that cite it.
- Lead: hides the Design area for a person, and the agent of that person cannot read `adr:0011`.

### Requirements

- REQ-015: The system SHALL give the outside agents the read-only tool `ref_read`, in the Read files switch group, off by default. It SHALL return the title, the state, the location and the backlinks of a ref, as `read_ref` does, and no file text. It MUST refuse a ref of an area that is hidden for the person, and it MUST leave out each backlink of a hidden area. It MUST refuse a ref whose source switch is off, such as Tickets for `wi`, and leave out each backlink of such a source.

### Non-Goals

- A tool that asks a person a question (Q-177).
- A write to the ref index.

### Acceptance Criteria

- [ ] With the Read files switch off, `ref_read` is not listed and a call is refused.
- [ ] A resolved ref gives the same title, state, location and backlinks as `read_ref`.
- [ ] A ref of a hidden area is refused, and a backlink of a hidden area is not in the answer.
- [ ] With Read files on and Tickets off, `wi:ACME-1` is refused and a `wi` backlink is not in the answer.
- [ ] Text that is not a ref gives the error with an example of a ref.

### Existing References

- Existing code/docs/specs: `spec:refs#REQ-014`, `spec:team-rights#REQ-018`.
- Supersedes or extends: `spec:refs#REQ-014`.

## ADDED Requirements

### Requirement: REQ-015 Outside agent read access

The system SHALL give the outside agents the read-only tool `ref_read`, in the Read files switch group, off by default. It SHALL return the title, the state, the location and the backlinks of a ref, as `read_ref` does, and no file text. It MUST refuse a ref of an area that is hidden for the person, and it MUST leave out each backlink of a hidden area. It MUST refuse a ref whose source switch is off, such as Tickets for `wi`, and leave out each backlink of such a source.

#### Scenario: Off by default
- GIVEN the outside server with the default switches
- WHEN an outside agent lists the tools and calls `ref_read`
- THEN `ref_read` is not in the list and the call says which switch turns it on

#### Scenario: Resolved ref
- GIVEN the Read files switch is on and `adr:0011` is in the index
- WHEN an outside agent calls `ref_read` with `adr:0011`
- THEN it gets the title, the state, the location and the backlinks, as `read_ref` gives them

#### Scenario: Ref of a hidden area
- GIVEN the Design area is hidden for the person
- WHEN an outside agent calls `ref_read` with `adr:0011`
- THEN the call is refused with the text of the other read tools of the Design area

#### Scenario: Backlink of a hidden area
- GIVEN the Work area is hidden for the person and `wi:ACME-1` cites `adr:0011`
- WHEN an outside agent calls `ref_read` with `adr:0011`
- THEN the answer does not hold `wi:ACME-1`

#### Scenario: Source switch off
- GIVEN the Read files switch is on, the Tickets switch is off and `wi:ACME-1` cites `adr:0011`
- WHEN an outside agent calls `ref_read` with `wi:ACME-1` and with `adr:0011`
- THEN the first call is refused with `ticket_read is off` and the second answer does not hold `wi:ACME-1`

#### Scenario: Text that is not a ref
- GIVEN the Read files switch is on
- WHEN an outside agent calls `ref_read` with `nope`
- THEN it gets the error `not a ref: nope.` and an example of a ref

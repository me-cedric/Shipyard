# Refs

## Why

Pages connect only through a staleness graph, not through real references. A person cannot see which spec cites an ADR, or which run touched a ticket.
Shipyard needs one reference graph. Each entity gets a stable ref, and each view shows the backlinks of its entity. The knowledge graph is this graph, drawn.

## What Changes

- Add the ref grammar for every entity kind: `project:`, `member:`, `diagram:`, `model:`, `adr:`, `api:`, `data:`, `flow:`, `screen:`, `change:`, `spec:`, `test:`, `q:`, `wi:`, `est:`, `wf:`, `run:`, `pr:`, `commit:`, `doc:`, `conn:`.
- Add the ref index: it reads the repository files, the tracker mirror and the run log, and it finds each ref in text.
- Add backlinks: for each entity, the list of entities that cite it, grouped by kind with a count.
- Add search over refs and titles, for the command palette.
- Add the detection of broken refs and a report in Settings / Health.
- Add `RefChip` behaviour: a click opens the entity, a hover shows its title and state.

## Impact

- Affected capability: `refs`
- Consumes: the entities of `projects`, `work`, `design`, `specs`, `questions-loop`, `factory`, `delivery`, `code`, `knowledge`, `connections`.
- Produces: the ref parser, the ref index, backlinks and search for `shell` (palette, inspector), `knowledge` (graph, explain), `assistant` (context), `factory` (`read_ref` tool), and the broken-ref report for `projects` (health).
- Feature list: the "chain" staleness graph, the cross-page links, the search.
- Affected code/docs: `crates/shipyard-core` (ref types), `crates/shipyard-store` (index), `src/lib/refs/`, `src/features/shell/ref-detail.tsx`.

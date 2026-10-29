# add-specs

## Why

Specs come before code, for people and for agents. Legacy shows OpenSpec changes, RAID questions and Gherkin test plans on separate pages, and the split into tickets lives in the costing tool.
Shipyard needs one Specs space where the BA and the functional lead write and review changes, answer questions, write test plans, and split a change into work items.

## What Changes

- Add Specs / Changes: list, read and edit OpenSpec changes with the `shipyard-delivery` schema, with the status of each artifact.
- Add Specs / Capabilities: the settled specs, each requirement with its id and backlinks.
- Add Specs / Questions: the RAID register in `docs/delivery/questions/`, with kind, status and owner.
- Add Specs / Test plans: Gherkin test plans linked to requirements.
- Add Specs / Constitution: read and edit `docs/openspec/constitution.md`.
- Add the validation of a change with the OpenSpec rules, shown per artifact.
- Add the split to work items: a change becomes epics and stories with refs to its requirements; the PM reviews the split and applies it to the tracker. The `spec-split` workflow can draft the split.
- Add the archive of a change when its work items are done.

## Impact

- Affected capability: `specs`
- Consumes: `design` (ADR, diagram, API and data refs that a spec cites), `questions-loop` (answers to fold), `factory` (the `spec-split` workflow), `connections` (tracker writes for the split).
- Produces: `change:`, `spec:` and `test:` entities, the RAID register for `questions-loop`, work items for `work` and `sync`.
- Legacy parity: Specifications (OpenSpec), delegate, Questions (RAID), Test plans (Gherkin), OpenSpec guidance for child repos (with `extensions`).
- Affected code/docs: `crates/shipyard-store` (OpenSpec and RAID codecs), `src/features/specs/`, `docs/openspec/`.

# add-design

## Why

Architects keep diagrams, models, decisions, API contracts, data models, network flows and screens in the repository. Legacy has a page for each kind, and nothing links a decision to the spec or the code it shapes.
Shipyard needs one Design space where each artifact has a ref, an editor and its backlinks.

## What Changes

- Add Design / Diagrams: Excalidraw, draw.io, Mermaid and BPMN files.
- Add Design / Architecture: LikeC4 models with a live render.
- Add Design / Decisions: MADR ADRs, created from a template, accepted or rejected with a comment.
- Add Design / API: OpenAPI contracts with a read view and a try view.
- Add Design / Data: DBML data models.
- Add Design / Flows: the network flow table (VLAN or VNET, protocol, allow or deny) with filters.
- Add Design / Screens: design artifacts, `.fig` links, and the design doc.
- Add one ref per artifact and the backlinks in the inspector.

## Impact

- Affected capability: `design`
- Consumes: `refs` (backlinks), `design-system` (EditorFrame).
- Produces: `diagram:`, `model:`, `adr:`, `api:`, `data:`, `flow:` and `screen:` entities for `specs` (citations), `knowledge` (graph, learn), `factory` (`read_ref`) and `assistant` (context).
- Legacy parity: Drawings (Excalidraw, draw.io, Mermaid, BPMN), Models (LikeC4), ADRs, OpenAPI, Data models (DBML), Flows (IPAM), Designs, Design doc, design to code.
- Affected code/docs: `src/features/design/`, `crates/shipyard-store` (MADR codec), `docs/decisions/`.

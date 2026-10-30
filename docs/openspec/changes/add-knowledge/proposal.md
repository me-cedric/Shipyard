# add-knowledge

## Why

A junior or a new member needs to understand the project from its decisions, specs and architecture. The earlier tool has a wiki, a knowledge graph, learning pages and dashboards, but they do not read the same graph.
Shipyard needs one Knowledge space that draws the reference graph, explains any entity with refs, and builds the handbook, documents, slides and learning paths from the project artifacts.

## What Changes

- Add Knowledge / Graph: the reference graph and the code graph (from the codebase-memory index) in one renderer, with filters by kind.
- Add the Explain action on every entity: the assistant answers from the reference graph and cites refs.
- Add Knowledge / Handbook: the wiki of the project, in the repository.
- Add Knowledge / Documents: Markdown documents and the client deliverables (architecture dossier, functional documentation) exported to `.docx` and `.xlsx`.
- Add Knowledge / Slides: reveal.js decks with the project theme and a present mode.
- Add Knowledge / Learn: a path built from the ADRs, specs and architecture, and a glossary from the specs.
- Add Knowledge / Dashboards and the Home widgets.

## Impact

- Affected capability: `knowledge`
- Consumes: `refs` (graph and backlinks), `design`, `specs`, `code` (quality, impacts), `factory` (run metrics for dashboards), `assistant` (the Explain answer).
- Produces: `doc:` entities, the graph view used by `factory` (Agents map renderer), dashboards and Home widgets for `shell`.
- Feature list: Knowledge graph, Wiki handbook, Documents, Slides, Learning, Learning path, Dashboards, Dossier d'architecture, Documentation fonctionnelle.
- Affected code/docs: `src/features/knowledge/`, `crates/shipyard-store`.

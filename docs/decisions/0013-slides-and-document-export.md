---
status: accepted
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# Slides renderer and document export for Knowledge
## Context and problem statement
Knowledge / Slides shows decks (`add-knowledge` REQ-017 to REQ-019), and Knowledge / Documents exports a document to `.docx` (REQ-013 to REQ-016). The plan names reveal.js and says that a `.docx` writer is new. It says to add no package before an ADR names it. The exports live in `shipyard-store/src/export.rs` with Rust tests.
## Considered options
- Slides: `reveal.js` in the webview.
- Slides: a custom renderer of Markdown sections (no transitions, no speaker view).
- `.docx`: `docx-rs` in Rust, next to `rust_xlsxwriter` (ADR 0011). The export has a Rust test.
- `.docx`: the `docx` JavaScript package in the webview. The export then has no Rust test and needs the webview.
## Decision outcome
Chosen options: `reveal.js` for slides, because it is proven and decks stay Markdown. `docx-rs` for `.docx`, because the export belongs to the store and gets a Rust round-trip test, as the Excel export does.
### Consequences
- The frontend depends on `reveal.js`. `shipyard-store` depends on `docx-rs`.
- A deck stays a Markdown file in the repository. Rendering never changes the file.
- A sealed day rate never goes into an export (REQ-016).

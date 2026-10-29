---
status: proposed
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# Agent questions as marked ticket comments
## Context and problem statement
An agent that needs a decision must stop, ask, and resume when a person answers, in the app or on the tracker site.
## Considered options
- Questions only in the app.
- Questions as ticket comments with a marker and numbered options, mirrored in the app.
## Decision outcome
Chosen option: "Marked ticket comments", because people can answer where they already work, and the next tick finds the answer.
### Consequences
- Marker: `<!-- shipyard:q Q-NNN -->`. Answers: option number, letter, `/answer X`, or free text.
- Spec-level questions also get a RAID file in `docs/delivery/questions/`.

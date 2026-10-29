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
- Wire form: the marker is an HTML comment on GitHub and GitLab. Jira, Azure DevOps and Linear store the plain token `(shipyard:q Q-NNN)`, which no conversion of their stores changes. The adapter maps both ways. The claim stamp of `add-sync` uses the same mechanism with the kind `claim`.

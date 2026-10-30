---
status: proposed
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# Build Shipyard as a new application with a ticket-driven agent factory
## Context and problem statement
The earlier tool has the right features but 40 routes, overlapping pages, hand-written IPC and no agent run engine. Can we fix it in place?
## Decision drivers
- Keep every feature and integration that matters.
- Add a ticket-driven agent factory.
- Reduce clutter for all roles.
## Considered options
- Refactor the earlier tool in place.
- Build a new application in a new repository, `Shipyard`.
## Decision outcome
Chosen option: "Build a new application in a new repository", because the information architecture, the IPC contract and the crate layout all change. An in-place refactor would touch every file anyway.
### Consequences
- Shipyard imports the project files of an existing project (costing, tickets config) and opens a folder with the existing layout.
## More information
`docs/plan/MASTER-PLAN.md` sections 2 and 4.

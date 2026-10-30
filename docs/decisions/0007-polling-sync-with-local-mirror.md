---
status: proposed
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# Polling sync with a local SQLite mirror
## Context and problem statement
A desktop app is often behind NAT and offline. Webhooks need a public endpoint.
## Considered options
- Webhooks only.
- Polling with reconcile, optional webhook relay later.
## Decision outcome
Chosen option: "Polling with reconcile", because it works offline and behind NAT. The interval is configurable, 60 s by default, 30 s minimum.
### Consequences
- The mirror and run logs live in SQLite in the app data folder, not in the repository.
- Shipyard does not write tickets.json to the repository.

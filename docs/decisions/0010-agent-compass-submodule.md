---
status: proposed
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# agent-compass as a pinned submodule
## Context and problem statement
A vendored 0.x copy of the compass rules. It drifted.
## Considered options
- Vendor a copy.
- Git submodule at `docs/agent-compass`, pinned to a tag, synced with `ac sync`.
## Decision outcome
Chosen option: "Submodule", because compass owns its files and the lock (`.agents/compass.lock.json`) shows drift. CI runs `ac check --frozen`.
### Consequences
- Source: https://github.com/me-cedric/agent-compass, tag v1.0.2.
- Enabled: upstream `taste`, `mattpocock`; packs `ci-github`, `security`, `e2e`, `renovate`.

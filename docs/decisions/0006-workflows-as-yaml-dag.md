---
status: proposed
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# Workflows as YAML DAG files in the repository
## Context and problem statement
Teams need to change agent steps, models, effort and gates without code.
## Considered options
- Hard-coded pipeline.
- One WORKFLOW.md per project (Symphony).
- Several YAML DAG files with a JSON Schema.
## Decision outcome
Chosen option: "Several YAML DAG files", because a project needs different flows for features, bugs, spikes and spec splits, and a schema gives editor validation.
### Consequences
- Hot reload keeps the last valid file.
- The Factory / Workflows view edits the same files.

---
status: proposed
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# Shipyard owns the run state and maps it to tracker statuses
## Context and problem statement
Trackers have different status models. Agent work needs states that trackers do not have, such as waiting for an answer.
## Decision drivers
- Works with Jira, GitHub, GitLab, Azure DevOps, Linear.
- Clear human-in-the-loop state.
## Considered options
- Drive the agent from tracker labels.
- A Shipyard run state machine with a per-project mapping to tracker statuses and labels.
## Decision outcome
Chosen option: "A Shipyard run state machine", because the engine needs states such as WaitingForAnswer, RetryQueued and Paused that a tracker cannot hold.
### Consequences
- `.shipyard/automation.yaml` holds the mapping.
- The tracker stays the source of truth for terminal states.

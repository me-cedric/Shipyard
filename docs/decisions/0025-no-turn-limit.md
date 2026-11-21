---
status: accepted
date: 2026-11-21
decision-makers: [Cédric Meyer]
---
# A run has no turn limit
## Context and problem statement
A run that reached its max turns (40 in the first workflow templates) paused or failed with "The run used its 40 turns." Work that was going well stopped.

The owner decided: "do not block on number of turns ever. remove that behaviour".

The constitution (section 5, rule 5) says: each run has a budget, a stall timeout and a kill switch. It does not name a turn limit.

Spec: `docs/openspec/specs/factory/spec.md` (REQ-023, REQ-035).
## Decision drivers
- A good run is never stopped by a count.
- A run keeps its budget, its stall timeout and its kill switch.
- An existing workflow file stays valid.
## Considered options
- A. Remove the turn limit. The key `max_turns` is read and ignored.
- B. Keep the limit, off by default.
- C. Keep the limit and raise it.
## Decision outcome
Chosen option: "A", because the owner chose it.

1. The engine never stops, pauses or fails a run for a number of turns.
2. The runner never passes a turn limit to an AI tool.
3. A workflow or automation file with `max_turns` still loads. The key is ignored and a form save drops it.
4. The budget, the stall timeout, Stop all agents and the kill switch of each run stay.
5. `Cause::MaxTurns` stays only so that an old run log still shows its stop reason.
6. The constitution rule stays as written.
## Consequences
- Good: no run stops at a count.
- Bad: a looping agent runs until the budget, the stall timeout or a person stops it.
- Follow-up: none.
## Pros and cons of the options
### A. Remove the limit
- Good: the owner's choice, and the simplest rule.
- Bad: no stop on a runaway loop except the budget and the stall timeout.
### B. Limit off by default
- Good: a person can still turn it on.
- Bad: the owner said never.
### C. Raise the limit
- Good: fewer stops.
- Bad: a stop still happens.

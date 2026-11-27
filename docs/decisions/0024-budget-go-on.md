---
status: accepted
date: 2026-11-20
decision-makers: [Cédric Meyer]
---
# A person can turn a budget into a warning
## Context and problem statement
The redesign shows a row Then on each budget, with the choices Stop and ask, Pause, Ask me and Go on. Today a run that reaches its budget always stops.

The constitution (section 5, rule 5) says: each run has a budget, a stall timeout and a kill switch.

The owner chose that Go on has no hard cap (`q:Q-174`).

Spec: `docs/openspec/changes/archive/2026-11-26-add-redesign-functions/` (`runs-recipes`, REQ-006).
## Decision drivers
- A person decides how strict each budget is.
- A run never loses its kill switch or its stall timeout.
- Spend stays visible when a budget only warns.
## Considered options
- A. Go on turns the budget into a warning, with no hard cap.
- B. Go on allows up to two times the budget, then the run stops.
- C. No Go on: a budget always stops the run.
## Decision outcome
Chosen option: "A", because the owner chose it (`q:Q-174`).

1. Stop and ask stays the default of each budget.
2. Go on is a choice of a person for one budget. With Go on, the run warns at the budget and goes on.
3. Stop all agents, the stall timeout and the max turns stay for every run. Since 2026-11-21 the max turns no longer stay (`adr:0025`).
4. The constitution rule stays as written: the run still has a budget, a stall timeout and a kill switch.
## Consequences
- Good: a person can let important work finish without a new approval.
- Bad: a run with Go on can spend without limit until a person stops it.
- Follow-up: Spend shows each budget that is set to Go on.
## Pros and cons of the options
### A. Warning only
- Good: the simplest rule, and the owner's choice.
- Bad: no automatic stop on spend.
### B. Hard cap at two times
- Good: an automatic stop stays.
- Bad: the owner did not want a cap.
### C. No Go on
- Good: the strictest spend control.
- Bad: the design control is not built.

---
status: proposed
date: 2026-11-06
decision-makers: [Cédric Meyer]
---
# Run resilience: fix first, caps in the code, one escalation, one report
## Context and problem statement
The owner (2026-11-06): "A run must never stay stuck in a blocked state, and workflows must not loop. If issues are found they are fixed. If a run is blocked, it writes why to the ticket and ends the step."

An audit of the engine found these problems:

- About ten causes move a run to `Blocked`, and each one needs a click: a start error, a second child conflict, spent review rounds, a release base, a git error, an empty branch, no reviewer, a rebase conflict, a closed pull request, a rejected approval.
- `Blocked`, `Paused` and `Failed` post no reason on the ticket.
- The cap of 2 review rounds starts again at each feedback round. Feedback rounds have no cap. The retry counters start again at each round. The engine does not see the same failure again.
- The sync starts a new run on a GitHub or GitLab issue after each end, `Done` included. The pickup label stays, and the pull request body has no `Closes #N`.
- A merge or a close in a side state is lost. A question has no timeout. A pause on a shared budget is not checked again. A run of a project that is not open gets no tick and keeps its claim.

A comparable tool uses a circuit breaker of 3 failures for each task across retries, a fixed transition table, one report for each stop with the reason and the last output, attempt ids that fence a late result, guards that do not use a retry, a state for "needs a person", findings in one batch for each fix round, and the cancel of a run that a new run replaces.

Spec: `docs/openspec/changes/update-run-resilience/` (`factory`, `delivery`, `sync`, `questions-loop`).
## Decision drivers
- No run stays stuck with no report, and no run loops with no end.
- The code keeps the caps. An agent or a prompt cannot change them.
- A person reads the cause once, where they work: on the ticket.
- Easy for a person with little technical knowledge: one reply on the ticket moves the run on.
- Keep the sixteen run states, the state mapping and the lanes.
## Considered options
- A. Reuse `Blocked` as the one "needs a person" state, with an escalation record.
- B. Add a seventeenth state `NeedsPerson`, and keep `Blocked` for the old causes.
- C. Keep the states and only raise the caps.
## Decision outcome
Chosen option: "A", because `Blocked` already means "a person must act" in the lane Needs you and in the state mapping (label `shipyard:blocked`). A new state changes the table, the mapping file of each project, the lanes and the tracker statuses, for no new behaviour. After this change, `Blocked` follows an escalation only. A budget and max turns stay in `Paused`, because a resume needs budget left (`factory` REQ-046), and they report the same way.

1. Fix first. A P0 or P1 finding and a red gate start a fix round with no click. All the blocking findings of a round go in one brief. Rounds go on while the blocking findings get fewer, up to `review_rounds` (default 4) for the whole run. The last round uses the top model tier of the runner. A second child conflict, a rebase conflict and an empty branch start one fixer round in the run worktree with no click. A workspace error, an AI tool error and a project that is not open go to `RetryQueued` with the backoff.
2. Caps in the code. Each step escalates at its third failed attempt across all rounds. A run escalates above 3 feedback rounds and 8 fix rounds (Q-167). No round, retry or restart resets a count. A fingerprint of the blocking findings, the gate errors or the runner error ignores line numbers, times, ids and order. The same fingerprint twice in a row escalates at once. A round that leaves no fewer blocking findings escalates.
3. Escalation. The agents stop, the clocks stop, and the run spends nothing. The run keeps one record: cause, last lines (10 at most), what it tried, and the action. It posts one ticket comment with the marker `<!-- shipyard:stop <run> -->` when the tracker takes comments and `tracker_comment` is on; else it shows the notice only, with no approval. The ticket gets `shipyard:blocked` through the state mapping. A reply on the ticket or Unblock with a message gives one more round of the spent cap. A person raises a cap only in the `limits` block of the workflow.
4. A person's decision ends the run plainly. A pull request closed without a merge cancels the run with one ticket comment (Q-031 changes). A rejected tracker write (status, labels, comment) is dropped, and the run goes on. A rejected push or pull request escalates.
5. No restart loop. The pickup does not start a run on a ticket whose last run ended, until the ticket changes after the end (a new comment of a person, a pickup label added again, a status back in the filter) or a person clicks Run. At `Done`, the pickup label goes from a GitHub or GitLab issue when `tracker_transition` is on. The pull request body holds `Closes #N`. A cancel by a person follows the same rule.
6. Nothing waits forever. A merge or a close in a side state applies. A question reminds once on the ticket after 24 h and escalates after 72 h, set in the `questions` block of `.shipyard/automation.yaml` (Q-028 changes). A day budget pause resumes at the first tick of the next day. A run or member budget pause escalates. A run of a project that is not open keeps its state, releases its claim after 10 min (the stale time of Q-021), and takes the claim again at the open. A guard that fails for 30 min with one cause escalates, except for a project that is not open.
7. Attempt fencing. Each unit attempt has an id, and the step token names it. A tool call, a report or a result of an old attempt is ignored and logged.
8. One report. The key of a stop report is run, cause and attempt. The log holds the key before the send, so a restart sends no second report.
9. `Failed`. The engine sends no new run to `Failed`: spent retries escalate (Q-166). The state stays in the table for the runs of older logs.
### Consequences
- Good: each stop has one cause, one record and one report, and a reply on the ticket moves the run on.
- Good: a loop has an end that the code keeps, and the same failure stops at once instead of at the cap.
- Good: an issue that merged or that a person cancelled does not cost money again.
- Bad: a cap or a fingerprint that is too strict escalates good runs. The defaults are the owner's, and a workflow raises them.
- Limit: only a reply of a team member unblocks a run (`team-rights` identity: an account in `.shipyard/team.yaml`; any person while the team has no admin). The reply reaches the agents as untrusted data, and it gives one round inside the caps.
- Bad: `Closes #N` closes the issue only on a merge into the default branch. The no-restart rule still stops the loop on `develop`.
- Follow-up: the earlier answers Q-025 (in part), Q-028 and Q-031 change. The specs follow at the archive of the change.
## Pros and cons of the options
### A. Reuse `Blocked` with an escalation record
- Good: no change of the states, the mapping, the lanes or the tracker statuses.
- Bad: old logs hold `Blocked` with no record. The view shows "cause unknown" for them.
### B. New state `NeedsPerson`
- Good: a clear name.
- Bad: two states mean the same thing, and each project mapping gets a new row. Rejected.
### C. Raise the caps only
- Good: a small change.
- Bad: no report on the ticket, and the loops and the waits with no end stay. Rejected.
## More information
- Spec: `change:update-run-resilience`, `spec:factory`, `spec:delivery`, `spec:sync`, `spec:questions-loop`.
- Questions: Q-166, Q-167. Earlier answers that this decision changes: Q-025, Q-028, Q-031.
- Diagram: `docs/diagrams/run-state-machine.mmd`.

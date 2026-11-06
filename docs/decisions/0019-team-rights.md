---
status: proposed
date: 2026-11-06
decision-makers: [Cédric Meyer]
---
# Team rights: the team file gives roles and rights, the backend checks each write
## Context and problem statement
The owner wants the whole project team in Shipyard (2026-11-06): PO, PM, architect, tech lead, BA, developers, testers. Each person needs the rights and the information of their job, with a guided and easy setup.

Today the role is a choice on each machine (Q-114, Q-128), and any person can change it. The backend checks only the read-only flag of the project (`refuse_read_only`), and any person can turn it off. `approve`, `approve_plan`, `automation_save` and the workflow saves have no check. `team.yaml` has a role in free text and no e-mail. A role hides tabs in the code, but `shell` REQ-016 and `MASTER-PLAN.md` section 6 say that no page is hidden.

An older comparable app had role presets with page lists, roles in a repository file keyed by the git e-mail, full access for an unknown person, a personal choice that wins over the team, checks in the view only, no home per role, no separate rights to approve, merge or spend, and no audit trail. This decision does better on each point.

Spec: `docs/openspec/changes/add-team-rights/` (`team-rights`, and the deltas of `shell`, `projects`, `work`).
## Decision drivers
- One source of the roles, reviewed as code (constitution 1.1).
- Fail closed: a person whom Shipyard does not know changes nothing.
- One check in the backend, so the view, the IPC and the MCP tools agree.
- Easy for a person with little technical knowledge: a solo project needs no setup.
- An honest limit: a desktop app cannot stop a person who edits files with another tool.
## Considered options
- A. The team file `.shipyard/team.yaml` with rights, checked in the backend.
- B. Keep the roles on each machine (Q-114, Q-128) and add checks in the backend.
- C. Read the roles from the code host (team or group permissions).
- D. A Shipyard account server.
## Decision outcome
Chosen option: "A", because it keeps one source in the repository, the code host reviews its changes, and it works with each code host and with no server.

1. Source. `.shipyard/team.yaml` holds the roles and the rights. A member gets `emails`, the accounts of the issue tracker and the code host, a typed `role` or a list `roles`, `admin: true|false` and optional `rights` (`+right`, `-right`). An optional `roles:` block changes the default levels of a role (Q-165). The accounts stay in the existing field `trackers` (Q-144). With a remote, the rights come from the team file of the default branch, as last fetched (Q-150). A change on a branch or in the working copy gives no right until the merge, and Shipyard shows a warning.
2. Identity. First, the account that a signed-in issue tracker or code host connection gives with its token, in the accounts of a member. Else `git config user.email` in `emails` (Q-151). Else unknown. Two accounts that match two members give unknown.
3. Solo and unknown. No team file or no member: the person has the `admin` flag. With a member: an unknown person gets `viewer` (reads everything, changes nothing) and can ask to join through a pull request (Q-149). The personal role of Settings / Me and the read-only profile only remove rights.
4. Roles. `po`, `pm`, `architect`, `techlead`, `ba`, `developer`, `qa`, `designer`, `viewer`. `admin` is a flag, not a role: it gives `write` in each area. A member can have several roles: the level in each area is the highest level of the roles, then the overrides apply. Migration (Q-145): `lead` becomes `po`; `junior` becomes `developer` with `-code.merge` and `-runs.approve`. The Explain action stays for each role.
5. Levels per area (Q-165). Each role has `none`, `read` or `write` in `work`, `specs`, `design`, `knowledge`, `code`, `runs`, `settings` and `costs`, and the action switches `code.merge` and `runs.approve`, valid only with `write` on their area. The ten rights of the backend check (`work.edit`, `specs.edit`, `design.edit`, `knowledge.edit`, `code.write`, `code.merge`, `runs.start`, `runs.approve`, `project.settings`, `costs.view`) map to the levels. The table of the default levels is in the spec, and the `roles:` block changes it; an edit through the app needs `project.settings`. A missing right turns a control off with its reason. The level `none` hides the space and refuses the MCP read tools of the area; the read commands of the app are not gated, because the files are on the disk of the person. Settings is never `none` for an admin, and the last admin cannot remove their own settings write. A person can still hide a tab for themselves.
6. Enforcement. One backend check in front of each write command and each MCP write tool. It takes the place of `refuse_read_only`. A run keeps the member who started it, and its writes need that member's right and the automation switch.
7. Audit. Each gated write and each refusal adds one JSON line to `audit/<project key>.jsonl` in the app data folder (constitution 1.3), kept 90 days. Each event of a run log carries `by` (Q-146).
8. Home. Home / Today shows the panels of the role, and each role has a first tab.
9. Inbox. An item goes to the people who can act on it. The view "Everyone" stays one click away.
10. Migration. A one-time proposal writes the roles and the e-mail map of this machine into the team file, and a person confirms it. The page modes go, and the proposal lists them.
11. Setup. Work / Team holds the guided setup, because `work` REQ-004 makes it the one team editor and `/settings/team` already opens it (Q-148).
### Consequences
- Good: one source of the roles, reviewed through pull requests. The view, the IPC and the MCP tools give the same answer. An unknown person cannot write. Each write has a trace.
- Good: a solo person sees no change.
- Bad: the limit. Shipyard cannot stop a person who edits `.shipyard/` or a spec file with another tool, or who builds a changed Shipyard. The rights stop mistakes and give a trace. The wall is the branch protection of the code host: protected default branch, required review, code owners on `.shipyard/team.yaml`. The guide says so.
- Bad: the e-mail match is not verified. A person can set any git e-mail. The code host still checks each push and merge with its own token.
- Bad: an older Shipyard refuses a team file with the new fields (`deny_unknown_fields`) and keeps its last valid team. The reader ships one version before the setup writes the fields.
- Bad: the audit log is on each machine. A team-wide trail stays the history of the code host and the issue tracker (Q-146).
- Follow-up: rules 3.1 and 3.2 of `docs/openspec/constitution.md` change (Q-147): 3.1 lists the nine roles; 3.2 says "A role can hide an area with the level `none`, except Settings for an admin. Roles change the order, the home view, the Today panels, the levels and the rights. A right turns a control off, never a view."
- Follow-up: `docs/plan/MASTER-PLAN.md` sections 5.8 and 6 follow the spec at the archive of the change.
## Pros and cons of the options
### A. Team file, backend check
- Good: one source in the repository, reviewed as code; works offline and with each code host.
- Bad: a person can edit the file in the working copy (the default branch rule covers it).
### B. Roles on each machine, backend check
- Good: no change of the team file.
- Bad: each person sets their own role, so a check in the backend proves nothing. Rejected.
### C. Roles from the code host
- Good: the code host verifies the person.
- Bad: the code host has repository roles (read, write, admin), not PO or QA, and the issue tracker has others. Each code host has a different API, and a person with no code host connection has no role. Rejected. Shipyard still uses the code host account to find the person.
### D. Account server
- Good: a strong identity and a central audit log.
- Bad: a server to run, a sign-in to Shipyard and a new point of failure, against a desktop app with no backend. Rejected.
## More information
- Spec: `spec:team-rights`, `change:add-team-rights`.
- Questions: Q-144 to Q-151, Q-165.
- Earlier decisions that this one changes: Q-114 (the role and the read-only flag stay on the machine, but only remove rights), Q-128 (a person hides a tab for themselves; a role hides an area only with the level `none`, Q-165).

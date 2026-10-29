# add-work

## Why

In Legacy, the costing "Plan" tab, the Gantt page and the tickets "Generate" tab do the same job, and team data sits in three files and four pages.
Shipyard needs one Work space where the PM sees the backlog, assigns people and agents, estimates, plans and tracks time, with the tracker as the source of truth.

## What Changes

- Add Work / Backlog and Work / Board on the tracker mirror, with filters and the run state of each item.
- Add Work / Team from `.shipyard/team.yaml`: name, tracker handles, role, capacity, skills, day rate, availability.
- Add assignment: the PM assigns a member; Shipyard suggests an assignee from skills and capacity. "Assigned to me" with the label `shipyard` makes a ticket eligible for the local factory.
- Add Work / Estimates: one sheet per lot, with backlog, summary (price, cost, margin), monthly spread and portfolio views, and Excel import and export.
- Add Work / Plan: a Gantt computed from an estimate sheet, the team and the calendar. Only human decisions are stored.
- Add Work / Time: time entries and the tracker worklog. A worklog write needs the person's action.
- Add the plan-and-apply flow for tracker writes: Shipyard shows the epics and stories to create or update, and the PM applies them.

## Impact

- Affected capability: `work`
- Consumes: `sync` (the `wi:` mirror), `specs` (work items from a split), `connections` (tracker writes), `factory` (run state per item).
- Produces: `member:` and `est:` entities, assignments that drive pickup in `sync`, the plan, time entries.
- Legacy parity: Team, Personas, Availability, Assignments (Répartition), Costing (sheets, Excel, sealed), Planning (Gantt), Tickets (plan and apply, labels), Imputations and worklog.
- Affected code/docs: `crates/shipyard-store` (team and estimate codecs), `src/features/work/`.

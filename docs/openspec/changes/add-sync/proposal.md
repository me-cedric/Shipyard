# Sync

## Why

Agents must pick up work from the team tracker, and the app must show the tracker state without a network call on each view.
The earlier tool syncs tickets on a click only, and it cannot stop work when a ticket closes. Shipyard needs a tick that keeps a local mirror current and decides which tickets an agent can take.

## What Changes

- Add the tick: it polls each tracker and forge connection. The default interval is 60 s, the minimum is 30 s, with jitter and "updated since" queries.
- Add the reconcile step before dispatch: fetch, compare, update the mirror, stop the runs whose ticket became terminal, then pick up new work.
- Add the mirror of work items and pull requests in a local store in the app data folder. The tracker and the forge stay the source of truth.
- Add the pickup rules in `.shipyard/automation.yaml`: filter (assignee, label `shipyard` by default, status set, component, priority) and concurrency (global, per project, per status; default 2 runs).
- Add claims: an atomic lock in the store and a claim stamp on the ticket, so two machines never run the same ticket.
- Add the one sync action in the status bar and the sync state per connection.

## Impact

- Affected capability: `sync`
- Consumes: `connections` (Tracker and Forge adapters), `work` (assignee from the team), `factory` (the list of active runs to reconcile).
- Produces: the `wi:` and `pr:` mirror for `work`, `code`, `delivery` and `refs`; claimed tickets for `factory`; new comments for `questions-loop`; pull request, CI and merge events for `delivery`.
- Feature list: Tickets sync (adopt, link, import backlog).
- Affected code/docs: `crates/shipyard-engine` (tick), `crates/shipyard-store` (mirror), `.shipyard/automation.yaml`, ADR 0007.

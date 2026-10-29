# Spec: sync

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-sync`

### Goal

A tick keeps a local mirror of work items and pull requests current. It stops runs whose ticket is terminal. It decides which tickets an agent can take, and it makes sure two machines never run the same ticket.

### Why

Agents must pick up work from the team tracker. The app must show the tracker state with no network call on each view. Legacy syncs tickets on a click only, and it cannot stop work when a ticket closes.

### Users And Scenarios

- PM: sees the board current without a click and sets who gets which work.
- Architect: sets the pickup filter by component to route design work.
- Developer: sees only tickets assigned to them picked up on their machine.
- QA: sees a ticket close and the run stop with no manual step.
- BA: sets the label and the status set that mark a ticket ready for an agent.
- Functional lead: sets the concurrency of a project.
- Junior: sees one sync state per connection and one action to refresh.

### Requirements

- REQ-001: The system SHALL poll each tracker connection and each forge connection on a tick. The default interval SHALL be 60 s and the minimum SHALL be 30 s. Each poll SHALL add jitter and SHALL ask only for changes since the last tick.
- REQ-002: The system SHALL let a person set the interval and SHALL refuse a value under 30 s.
- REQ-003: Each tick SHALL reconcile before it dispatches, in this order: fetch, compare, update the mirror, hand off events, stop runs, pick up new work.
- REQ-004: The system SHALL stop each active run whose ticket became terminal, except a run whose pull request merged, and SHALL record the reason on the run.
- REQ-005: The system SHALL keep a mirror of work items and pull requests in the app data folder. The tracker and the forge SHALL stay the source of truth. Views SHALL read the mirror and SHALL NOT call the tracker.
- REQ-006: The system SHALL read the pickup filter from `.shipyard/automation.yaml`: assignee, label, status set, component and priority. The default label SHALL be `shipyard`. The assignee SHALL come from the team handles of `work`. The system MUST NOT pick up while the global kill switch is on.
- REQ-007: The system SHALL read the concurrency from `.shipyard/automation.yaml`: global, per project and per status. The default SHALL be 2 runs.
- REQ-008: The system SHALL take a claim as an atomic lock in the local store before a run starts. Two runs on one machine MUST NOT claim the same ticket.
- REQ-009: The system SHALL put a claim stamp on the ticket so that two machines never run the same ticket. The stamp is a tracker write. [NEEDS CLARIFICATION: Q-020 How does the claim stamp relate to the automation write switches?] Working assumption: the claim stamp is not one of the four switches, and pickup rules that a person turned on allow it.
- REQ-010: The system SHALL release a claim when its run ends, and SHALL treat a claim as stale when its stamp is not refreshed. [NEEDS CLARIFICATION: Q-021 After how long is a claim stale?] Working assumption: 10 minutes without a refresh.
- REQ-011: The system SHALL hand each new ticket comment to `questions-loop` once.
- REQ-012: The system SHALL hand each pull request, CI and merge event to `delivery` once.
- REQ-013: The system SHALL show one sync action in the status bar and the sync state of each connection. The action SHALL run one tick at once.
- REQ-014: The system SHALL keep the last good mirror when a poll fails, SHALL show the failed state on the connection and SHALL retry with a longer delay.
- REQ-015: The system SHALL let a person adopt a ticket, link a ticket to a local item and import the backlog of a tracker.
- REQ-016: The system SHALL expose the mirror as `wi:` and `pr:` entities, and SHALL send a tick event to the capabilities that listen.
- REQ-017: Each sync view SHALL follow the interface rules of the constitution.

### Non-Goals

- A webhook relay. Polling only.
- Writing tickets to the repository. The mirror lives outside it.
- Editing a ticket. The `work` capability owns edits.
- Choosing the assignee. The `work` capability owns it.
- Running the agent. The `factory` capability owns runs and the write switches.
- Polling the remote heads of a git repository (Legacy remote watch). The pull request poll replaces it.

### Acceptance Criteria

- [ ] A new connection polls every 60 s with jitter and asks only for changes since the last tick.
- [ ] An interval under 30 s is refused.
- [ ] A tick runs the six steps of REQ-003 in order.
- [ ] A ticket that becomes terminal stops its active run in the same tick, unless its pull request merged.
- [ ] With the network off, views still show the mirror and the connection shows the failed state.
- [ ] No ticket file appears in the repository.
- [ ] Only tickets that match the filter are picked up. Nothing is picked up while the global kill switch is on.
- [ ] A project with no concurrency setting runs at most 2 runs.
- [ ] Two machines with the same filter never run one ticket.
- [ ] A stale claim is taken over after the stale time.
- [ ] A new comment reaches `questions-loop` once. A merge event reaches `delivery` once.
- [ ] One sync action in the status bar starts one tick. No other view has one.
- [ ] A person adopts, links and imports from the sync view.
- [ ] Every view works with the keyboard, shows a focus ring and has French and English text.

### Links

- Consumes: `add-connections` (Tracker and Forge adapters; REQ-002, REQ-005, REQ-015), `add-work` (assignee from the team), `add-factory` (active runs to reconcile; the four write switches, `q:Q-002`; REQ-024, the global kill switch).
- Produces: the `wi:` and `pr:` mirror for `add-work`, `add-code`, `add-delivery` and `add-refs`; claimed tickets for `add-factory`; new comments for `add-questions-loop`; pull request, CI and merge events for `add-delivery`.
- Related: `spec:shell` REQ-007 (the status bar holds the sync action), `spec:refs` REQ-009 (a ref to an item the mirror lacks is unresolved until the next sync completes; `q:Q-012`).

### Legacy parity

| Legacy feature | Shipyard view | REQ ids |
| --- | --- | --- |
| Tickets sync (adopt, link, import backlog) | Work / Backlog; status bar sync action | REQ-005, REQ-013, REQ-015 |
| Surveillance des dépôts distants | Tick of pull requests and CI | REQ-001, REQ-012 |
| Tickets sync on a click only | Tick, reconcile, stop runs | REQ-001, REQ-003, REQ-004 |

### Existing References

- `docs/plan/MASTER-PLAN.md` sections 5.1, 5.2, 5.8 and 7.1.
- `docs/openspec/constitution.md` sections 1, 4 and 5.
- `docs/decisions/0007-polling-sync-with-local-mirror.md`
- `docs/decisions/0008-questions-as-ticket-comments.md`
- `docs/delivery/questions/Q-002.md`
- `docs/delivery/questions/Q-020.md`
- `docs/delivery/questions/Q-021.md`

## ADDED Requirements

### Requirement: REQ-001 Tick

The system SHALL poll each tracker connection and each forge connection on a tick. The default interval SHALL be 60 s and the minimum SHALL be 30 s. Each poll SHALL add jitter and SHALL ask only for changes since the last tick.

#### Scenario: Default interval
- GIVEN a new tracker connection
- WHEN the app runs for 3 minutes
- THEN the tracker is polled about every 60 s with different delays

#### Scenario: Changes only
- GIVEN a tick ran 60 s ago
- WHEN the next tick polls
- THEN the request asks for items updated since the last tick

### Requirement: REQ-002 Interval setting

The system SHALL let a person set the interval and SHALL refuse a value under 30 s.

#### Scenario: Too short
- GIVEN a person enters 10 s
- WHEN the person saves
- THEN the system refuses the value and keeps the old interval

### Requirement: REQ-003 Reconcile before dispatch

Each tick SHALL run these steps in order: fetch, compare, update the mirror, hand off events, stop runs, pick up new work. The hand-off step SHALL send the pull request and merge events to `delivery` before the stop step. The system MUST NOT pick up work before the stop step ends.

#### Scenario: Order
- GIVEN a ticket closed and a new ticket ready
- WHEN a tick runs
- THEN the run of the closed ticket stops
- AND then the new ticket is picked up

### Requirement: REQ-004 Stop terminal runs

The system SHALL stop each active run whose ticket is in a terminal status, and SHALL record the reason on the run. The system MUST NOT stop a run whose pull request merged: that run goes to `Merged`. The terminal statuses SHALL come from the status mapping in `.shipyard/automation.yaml`.

#### Scenario: Ticket closed
- GIVEN a run is Working on a ticket
- WHEN a tick finds the ticket Done
- THEN the run moves to Cancelled with the reason ticket terminal

#### Scenario: Ticket closed by merge
- GIVEN a run is PROpen and the forge closes the ticket at merge
- WHEN a tick finds the merged pull request and the Done ticket
- THEN `delivery` receives the merge event first
- AND the run moves to Merged and then Done, not to Cancelled

### Requirement: REQ-005 Mirror

The system SHALL keep a mirror of work items and pull requests in the app data folder. The tracker and the forge SHALL stay the source of truth. A view SHALL read the mirror, and MUST NOT call the tracker or the forge for a read.

#### Scenario: Offline read
- GIVEN the network is off
- WHEN a person opens the backlog
- THEN the backlog shows the mirror

#### Scenario: Repository stays clean
- GIVEN a sync ran
- WHEN a person lists the repository changes
- THEN no ticket file appears

### Requirement: REQ-006 Pickup filter

The system SHALL read the pickup filter from `.shipyard/automation.yaml`: assignee, label, status set, component and priority. The default label SHALL be `shipyard`. The assignee SHALL resolve through the team handles of `work`. A ticket SHALL be picked up only when it matches every set filter. The system MUST NOT pick up while the global kill switch is on.

#### Scenario: Match
- GIVEN a ticket with the label `shipyard`, assigned to me, in an allowed status
- WHEN a tick runs
- THEN the ticket is picked up

#### Scenario: No match
- GIVEN a ticket assigned to another member
- WHEN a tick runs
- THEN the ticket is not picked up on my machine

#### Scenario: Kill switch on
- GIVEN the global kill switch is on and a ticket matches the filter
- WHEN a tick runs
- THEN the ticket is not picked up

### Requirement: REQ-007 Concurrency

The system SHALL read the concurrency from `.shipyard/automation.yaml`: global, per project and per status. The default SHALL be 2 runs. The system MUST NOT start a run above any set limit.

#### Scenario: Default limit
- GIVEN no concurrency setting and 5 matching tickets
- WHEN a tick runs
- THEN 2 tickets are picked up

#### Scenario: Status limit
- GIVEN a limit of 1 for one status and 2 tickets in it
- WHEN a tick runs
- THEN 1 of them is picked up

### Requirement: REQ-008 Local claim

The system SHALL take a claim as an atomic lock in the local store before a run starts. Two runs on one machine MUST NOT claim the same ticket.

#### Scenario: Race
- GIVEN two ticks pick the same ticket at once
- WHEN both try to claim
- THEN one claim succeeds and one fails

### Requirement: REQ-009 Claim stamp

The system SHALL put a claim stamp on the ticket so that two machines never run the same ticket. The system SHALL check for a stamp of another machine before it starts a run. The stamp is a tracker write. [NEEDS CLARIFICATION: Q-020 How does the claim stamp relate to the automation write switches?] Working assumption: the claim stamp is not one of the four switches of `q:Q-002`, and pickup rules that a person turned on allow it.

#### Scenario: Two machines
- GIVEN machine A stamped a ticket
- WHEN machine B polls and matches the ticket
- THEN machine B does not start a run on it

#### Scenario: Stamp fails
- GIVEN the tracker refuses the stamp
- WHEN the system claims a ticket
- THEN the local claim is released
- AND no run starts

### Requirement: REQ-010 Release and stale claims

The system SHALL release a claim when its run ends, and SHALL remove the stamp. The system SHALL treat a claim as stale when its stamp is not refreshed in the stale time, and SHALL let another machine take it over. [NEEDS CLARIFICATION: Q-021 After how long is a claim stale?] Working assumption: 10 minutes without a refresh.

#### Scenario: Release
- GIVEN a run is Done
- WHEN the run ends
- THEN the claim and the stamp are removed

#### Scenario: Stale takeover
- GIVEN machine A stopped and did not refresh the stamp for the stale time
- WHEN machine B polls
- THEN machine B takes the claim

### Requirement: REQ-011 Hand off comments

The system SHALL hand each new ticket comment to `questions-loop` once. A comment that the mirror already holds MUST NOT go again.

#### Scenario: New comment
- GIVEN a person answers on the tracker site
- WHEN the next tick finds the comment
- THEN `questions-loop` receives it once

### Requirement: REQ-012 Hand off pull request events

The system SHALL hand each pull request, CI and merge event to `delivery` once.

#### Scenario: Merge
- GIVEN a pull request is merged on the forge
- WHEN the next tick finds it
- THEN `delivery` receives one merge event

### Requirement: REQ-013 Sync action and state

The system SHALL show one sync action in the status bar. The action SHALL run one tick at once. The system SHALL show the sync state of each connection in Settings / Connections: idle, running, failed, with the time of the last good tick.

#### Scenario: Run at once
- GIVEN the next tick is in 40 s
- WHEN a person activates the sync action
- THEN a tick runs now
- AND the timer restarts

#### Scenario: No second control
- GIVEN any view of the app
- WHEN a person looks for a sync control
- THEN only the status bar and the palette offer it

### Requirement: REQ-014 Failed poll

The system SHALL keep the last good mirror when a poll fails. The system SHALL show the failed state on the connection and SHALL retry with a longer delay, up to a set maximum.

#### Scenario: Network loss
- GIVEN the network goes off
- WHEN a tick fails
- THEN the mirror stays
- AND the connection shows failed
- AND the next retry comes later

### Requirement: REQ-015 Adopt, link and import

The system SHALL let a person adopt a ticket, link a ticket to a local item and import the backlog of a tracker. The import SHALL show a count before it writes the mirror.

#### Scenario: Import backlog
- GIVEN a tracker with 120 open tickets
- WHEN a person imports the backlog
- THEN the system shows the count 120
- AND after confirm the mirror holds them

### Requirement: REQ-016 Entities and events

The system SHALL expose the mirror as `wi:<KEY-N>` and `pr:<forge>:<number>` entities. The system SHALL send a tick event after each tick to the capabilities that listen.

#### Scenario: Resolve
- GIVEN a mirrored ticket
- WHEN the ref `wi:<KEY-N>` resolves
- THEN it returns the title and the status

### Requirement: REQ-017 Interface rules

Each sync view SHALL have no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path, a focus ring, assistive labels, enough contrast and no motion under reduced motion. The state of a connection SHALL use shape and colour together. Its text SHALL exist in French and English.

#### Scenario: Keyboard only
- GIVEN the status bar
- WHEN a person focuses the sync action and presses Enter
- THEN a tick runs

#### Scenario: Language
- GIVEN the language is French
- WHEN a person reads the sync state
- THEN every label is in French

# Spec: work

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-work`

### Goal

One Work space where the PM sees the backlog, assigns people and agents, estimates, plans and tracks time. The tracker stays the source of truth.

### Why

In Legacy, the costing Plan tab, the Gantt page and the tickets Generate tab do the same job. Team data sits in three files and four pages. Shipyard keeps one source of effort and one place for the team.

### Users And Scenarios

- PM: assigns people and agents, estimates, plans and follows time with the tracker as the source.
- Architect: checks the skills and the plan for a design item.
- Developer: sees which items are assigned to them and eligible for their agents, and logs time.
- QA: sees the run state on each item and the test effort in a sheet.
- BA: reads the epics and stories before the PM applies them.
- Functional lead: reads price, cost and margin by lot.
- Junior: sees one place for the team, the plan and the time, with no duplicate view.

### Requirements

- REQ-001: Work / Backlog SHALL list the work items of the mirror. Each row SHALL show the key, title, status, assignee and the run state of the item. The view SHALL filter by assignee, status, label, component, priority and run state. Group headings SHALL show a count. The view MUST NOT call the tracker for a read.
- REQ-002: Work / Board SHALL show one column for each tracker status. A card SHALL show the key, title, assignee and run state. A person's move of a card SHALL send the transition to the tracker. The card SHALL return to its column when the tracker refuses the move.
- REQ-003: The system SHALL read the team from `.shipyard/team.yaml`. Each member SHALL have a name, tracker handles, a role, a capacity, skills, a day rate and an availability. The system SHALL expose each member as `member:<handle>`. The system SHALL refuse a file with a duplicate handle.
- REQ-004: Work / Team SHALL list the members and SHALL edit the same file as REQ-003. A change SHALL appear in the file as text. Work / Team SHALL be the one place that edits the team.
- REQ-005: When the project seal is on, the day rate of a member SHALL be stored as sealed text. The seal SHALL use the same passphrase as the estimate sheets. [NEEDS CLARIFICATION: Q-032 Is the day rate in the team file sealed?] Working assumption: Q-032 option 1, sealed with the project passphrase when the seal is on.
- REQ-006: The PM SHALL assign a work item to a member. The assignment SHALL send the assignee to the tracker. The system MUST NOT assign by itself. The system SHALL disable the action when the connection lacks the assignee capability, and SHALL name the reason.
- REQ-007: The system SHALL suggest members for an item from skills and capacity. The suggestion SHALL rank the members and SHALL show the reason for each. The suggestion SHALL NOT assign.
- REQ-008: The PM SHALL be able to mark an item for agent work. Marking SHALL add the pickup label on the tracker. The pickup label SHALL come from `.shipyard/automation.yaml` (default `shipyard`). An item SHALL be eligible for a member's factory only when it is assigned to that member. It SHALL also hold the pickup label. Work SHALL resolve the member through the tracker handles of the team, and `add-sync` SHALL read the result (`add-sync` REQ-006).
- REQ-009: The system SHALL keep one estimate sheet for each lot as a text file in the repository. The system SHALL expose each sheet as `est:<slug>`. A sheet SHALL hold the features and tasks of its lot with an effort in days.
- REQ-010: A task effort SHALL be a fixed number of days or a percentage of the build effort. The system SHALL compute the totals from the entries and from the day rates of the members (REQ-003). The system MUST NOT store a computed total in the file.
- REQ-011: Work / Estimates SHALL offer four views of a sheet: backlog, summary, monthly spread and portfolio. The backlog SHALL show lot, feature and task. The summary SHALL show price, cost and margin. The spread SHALL show effort and cost by month. The portfolio SHALL show all sheets together.
- REQ-012: The system SHALL import an Excel file that follows the CGI costing layout into a sheet. The import SHALL show a preview with each row that it refuses and its reason. The system MUST NOT replace a sheet before the person confirms.
- REQ-013: The system SHALL export a sheet to an Excel file that the CGI costing tool opens. The export SHALL hold the same totals as the summary.
- REQ-014: The system SHALL seal all sheets with a project passphrase on request. It SHALL open them again on request. The passphrase MUST NOT appear in the repository. The system SHALL refuse a passphrase that does not open the sealed sheets. On a machine with no passphrase, a sealed sheet SHALL show a locked state.
- REQ-015: A sheet task MAY carry a `wi:` ref. The view SHALL show the estimate of the task beside the original estimate of the ticket.
- REQ-016: Work / Plan SHALL compute a Gantt from one chosen estimate sheet, the team and the calendar. The calendar SHALL hold the working days and the public holidays. The computation SHALL use the capacity and the availability of each member.
- REQ-017: The system SHALL store only the decisions of a person: task order, a fixed start and a member choice. The system MUST NOT store a computed date. One decision file SHALL serve all sheets.
- REQ-018: Work / Plan SHALL show bars on a time scale with a today marker. A person SHALL be able to move a bar and change a decision with the keyboard. The view SHALL have one primary action.
- REQ-019: Effort numbers SHALL live in estimate sheets only. Work / Plan and the plan-and-apply flow SHALL read them. They MUST NOT keep a copy of the effort.
- REQ-020: Work / Time SHALL let a person add a time entry with a day, a duration and a note. The entry MAY name a ticket from the mirror. The system SHALL refuse an entry when it cannot resolve the member. The system MUST NOT run a timer.
- REQ-021: The system SHALL keep time entries as text, one file for each member and month, in the repository. [NEEDS CLARIFICATION: Q-034 Do time entries live in the repository or in the app data folder?] Working assumption: Q-034 option 1, in the repository.
- REQ-022: The system SHALL send a time entry to the tracker worklog only when a person acts on that entry. An agent, a run or a tick MUST NOT send a worklog. The person SHALL choose to reduce the remaining estimate or leave it. The system SHALL disable the send when the tracker lacks the time tracking capability.
- REQ-023: The system SHALL write the entry first, send second and store the tracker receipt third. An entry with a receipt SHALL NOT be offered again. Each sent worklog SHALL carry a mark of the entry id. When a response is lost, the system SHALL find the worklog by its mark and SHALL NOT send it again.
- REQ-024: Each time row SHALL show one of three states: in the tracker, to send, or only in the tracker. The system MUST NOT add local and tracker hours together. The system SHALL flag a difference of duration and MUST NOT correct it.
- REQ-025: Shipyard SHALL show the epics and stories to create or update from the estimate sheets. The preview SHALL mark each row create, update or unchanged against the mirror. The system MUST NOT write to the tracker before the PM applies. A reviewed split from `add-specs` SHALL use this preview and the apply of REQ-026, with one match mark.
- REQ-026: Apply SHALL write each row and SHALL show the result of each row. A failed row SHALL NOT undo the rows already written. A second apply SHALL NOT create a duplicate. Apply SHALL write the summary, description, estimate and parent, and MUST NOT write the status or the assignee. Apply SHALL match a row to its ticket by a mark that the ticket holds. [NEEDS CLARIFICATION: Q-033 How does apply match a row to its ticket?] Working assumption: Q-033 option 1, the `est:` ref of the row in a ticket label.
- REQ-027: The system SHALL expose members as `member:<handle>` and sheets as `est:<slug>`. The inspector SHALL show their backlinks. The run state of an item SHALL come from `add-factory` (REQ-034).
- REQ-028: Each Work view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have one primary action. It SHALL have a keyboard path, a focus ring, assistive labels, contrast and reduced motion. It SHALL show French and English text.

### Non-Goals

- Polling the tracker and the pickup itself. `add-sync` owns them.
- Running the agent and the write switches. `add-factory` owns them.
- Creating work items from a spec split. `add-specs` owns the split. This change applies the result.
- Tracker adapters and credentials. `add-connections` owns them.
- The Legacy Répartition scopes, one writer for each file, gates and brief. Work covers the assignment of tickets only.
- A timer or any automatic time capture.
- A second estimate mode for the remaining estimate. The person reduces it or leaves it.
- A second team editor in Settings / Team. Work / Team is the one editor.

### Acceptance Criteria

- [ ] Backlog and Board read the mirror, work offline and show the run state of each item.
- [ ] A card move sends the transition, and a refusal returns the card.
- [ ] A team file with a duplicate handle is refused and the last valid team stays.
- [ ] The PM assigns a member, and the suggestion ranks members by skill and capacity without assigning.
- [ ] An item assigned to me with the pickup label is eligible on my machine, and no other item is.
- [ ] A sheet shows the four views with equal totals in the summary, the spread and the portfolio.
- [ ] An Excel import shows a preview, and an Excel export opens in the CGI costing tool.
- [ ] Sealed sheets show unreadable text in the file and a locked state without the passphrase.
- [ ] A team change moves the plan dates and changes no file.
- [ ] A time entry needs a resolved member, and no worklog is sent without a person's action.
- [ ] A lost worklog response never causes a second worklog.
- [ ] The apply preview writes nothing, a failed row keeps the earlier rows, and a second apply creates no duplicate.
- [ ] Plan and apply read the effort of the sheet and keep no copy.
- [ ] Every Work view works with the keyboard, shows a focus ring and has French and English text.

### Links

- Consumes: `add-sync` (the `wi:` mirror and the pickup filter; REQ-005, REQ-006, REQ-015), `add-specs` (work items from a split), `add-connections` (tracker writes and capability flags; REQ-003, REQ-004, REQ-011), `add-factory` (run state per item; REQ-034).
- Produces: `member:` and `est:` entities, assignments and the label that drive pickup in `add-sync`, the plan, the time entries.
- Related: `add-projects` REQ-014 (the Legacy import brings team, costing sheets and tickets config; `q:Q-003`), `add-shell` REQ-003 (My work), `add-factory` REQ-022 (budget per member).

### Legacy parity

| Legacy feature | Shipyard view | REQ ids |
| --- | --- | --- |
| Team, Personas, Availability | Work / Team | REQ-003, REQ-004, REQ-005 |
| Assignments (ticket assignment only; Répartition scopes and brief are out) | Work / Backlog and Board; assignment and suggestion | REQ-006, REQ-007, REQ-008 |
| Costing (sheets, Excel, sealed) | Work / Estimates | REQ-009 to REQ-015 |
| Planning (Gantt) | Work / Plan | REQ-016 to REQ-019 |
| Tickets (plan and apply, labels) | Work / Backlog and Board; plan and apply | REQ-001, REQ-002, REQ-008, REQ-025, REQ-026 |
| Imputations and worklog | Work / Time | REQ-020 to REQ-024 |

### Existing References

- `docs/plan/MASTER-PLAN.md` sections 4, 5.2, 5.8 and 6.
- `docs/openspec/constitution.md` sections 1, 3 and 4.
- `docs/decisions/0007-polling-sync-with-local-mirror.md`
- `docs/delivery/questions/Q-003.md`
- `docs/delivery/questions/Q-032.md`
- `docs/delivery/questions/Q-033.md`
- `docs/delivery/questions/Q-034.md`
- Legacy `docs/features.md` (Planning, Chiffrage, Répartition) and `docs/jira-temps.md`, read only.

## ADDED Requirements

### Requirement: REQ-001 Backlog

Work / Backlog SHALL list the work items of the mirror. Each row SHALL show the key, title, status, assignee and the run state of the item. The view SHALL filter by assignee, status, label, component, priority and run state. Group headings SHALL show a count. The view MUST NOT call the tracker for a read.

#### Scenario: Filter
- GIVEN a mirror with items of two assignees
- WHEN a person filters by one assignee
- THEN the list shows only that assignee's items

#### Scenario: Offline
- GIVEN the network is off
- WHEN a person opens the backlog
- THEN the backlog shows the mirror

### Requirement: REQ-002 Board

Work / Board SHALL show one column for each tracker status. A card SHALL show the key, title, assignee and run state. A person's move of a card SHALL send the transition to the tracker. The card SHALL return to its column when the tracker refuses the move.

#### Scenario: Move
- GIVEN a card in To do
- WHEN a person moves it to In progress
- THEN the tracker receives the transition and the card shows the new column

#### Scenario: Refused
- GIVEN the tracker refuses the transition
- WHEN a person moves a card
- THEN the card returns to its column and the view shows the refusal

### Requirement: REQ-003 Team file

The system SHALL read the team from `.shipyard/team.yaml`. Each member SHALL have a name, tracker handles, a role, a capacity, skills, a day rate and an availability. The system SHALL expose each member as `member:<handle>`. The system SHALL refuse a file with a duplicate handle.

#### Scenario: Duplicate
- GIVEN a team file where two members share a handle
- WHEN the system loads it
- THEN the system names the duplicate and keeps the last valid team

### Requirement: REQ-004 Team view

Work / Team SHALL list the members and SHALL edit the same file as REQ-003. A change SHALL appear in the file as text. Work / Team SHALL be the one place that edits the team.

#### Scenario: Edit
- GIVEN a member with capacity 3 days a week
- WHEN a person sets capacity to 4 and saves
- THEN the file shows 4 and the view shows 4

### Requirement: REQ-005 Day rate seal

When the project seal is on, the day rate of a member SHALL be stored as sealed text. The seal SHALL use the same passphrase as the estimate sheets. [NEEDS CLARIFICATION: Q-032 Is the day rate in the team file sealed?] Working assumption: Q-032 option 1, sealed with the project passphrase when the seal is on.

#### Scenario: Sealed rate
- GIVEN the seal is on
- WHEN a person opens the team file in an editor
- THEN the day rate is unreadable text

#### Scenario: Locked machine
- GIVEN the seal is on and this machine has no passphrase
- WHEN a person opens Work / Team
- THEN the view hides the day rate and names the missing passphrase

### Requirement: REQ-006 Assignment

The PM SHALL assign a work item to a member. The assignment SHALL send the assignee to the tracker. The system MUST NOT assign by itself. The system SHALL disable the action when the connection lacks the assignee capability, and SHALL name the reason.

#### Scenario: Assign
- GIVEN an unassigned item
- WHEN the PM assigns member Ana
- THEN the tracker shows Ana as assignee after the write

#### Scenario: No capability
- GIVEN a tracker with no assignee capability
- WHEN the PM opens the assign action
- THEN the action is disabled and names the missing capability

### Requirement: REQ-007 Assignee suggestion

The system SHALL suggest members for an item from skills and capacity. The suggestion SHALL rank the members and SHALL show the reason for each. The suggestion SHALL NOT assign.

#### Scenario: Ranked
- GIVEN an item labelled `api` and two members, one with the skill `api` and free capacity
- WHEN the PM opens the suggestion
- THEN the member with the skill ranks first with its reason

#### Scenario: Full capacity
- GIVEN a member with no free capacity
- WHEN the PM opens the suggestion
- THEN that member ranks below the members with free capacity

### Requirement: REQ-008 Agent pickup rule

The PM SHALL be able to mark an item for agent work. Marking SHALL add the pickup label on the tracker. The pickup label SHALL come from `.shipyard/automation.yaml` (default `shipyard`). An item SHALL be eligible for a member's factory only when it is assigned to that member. It SHALL also hold the pickup label. Work SHALL resolve the member through the tracker handles of the team, and `add-sync` SHALL read the result (`add-sync` REQ-006).

#### Scenario: Eligible
- GIVEN an item assigned to me with the pickup label
- WHEN a tick runs on my machine
- THEN the item is eligible for pickup

#### Scenario: Not mine
- GIVEN an item assigned to another member with the pickup label
- WHEN a tick runs on my machine
- THEN the item is not eligible

#### Scenario: Unknown handle
- GIVEN an item assigned to a handle that the team file lacks
- WHEN the PM opens the backlog
- THEN the row shows an unknown member

### Requirement: REQ-009 Estimate sheets

The system SHALL keep one estimate sheet for each lot as a text file in the repository. The system SHALL expose each sheet as `est:<slug>`. A sheet SHALL hold the features and tasks of its lot with an effort in days.

#### Scenario: Two lots
- GIVEN a project with the lots MVP 1 and MVP 2
- WHEN a person opens Work / Estimates
- THEN the view lists two sheets with their refs

### Requirement: REQ-010 Effort entry

A task effort SHALL be a fixed number of days or a percentage of the build effort. The system SHALL compute the totals from the entries and from the day rates of the members (REQ-003). The system MUST NOT store a computed total in the file.

#### Scenario: Percentage
- GIVEN a build effort of 20 days and a test task of 25 %
- WHEN a person opens the sheet
- THEN the test task shows 5 days

#### Scenario: Edit
- GIVEN a task effort changed
- WHEN the person saves
- THEN the file holds the entry and no total

### Requirement: REQ-011 Four views

Work / Estimates SHALL offer four views of a sheet: backlog, summary, monthly spread and portfolio. The backlog SHALL show lot, feature and task. The summary SHALL show price, cost and margin. The spread SHALL show effort and cost by month. The portfolio SHALL show all sheets together.

#### Scenario: Summary
- GIVEN a sheet with rates and efforts
- WHEN a person opens the summary
- THEN the view shows price, cost and margin

#### Scenario: Portfolio
- GIVEN three sheets
- WHEN a person opens the portfolio
- THEN the view totals the three sheets

### Requirement: REQ-012 Excel import

The system SHALL import an Excel file that follows the CGI costing layout into a sheet. The import SHALL show a preview with each row that it refuses and its reason. The system MUST NOT replace a sheet before the person confirms.

#### Scenario: Preview
- GIVEN an Excel file with one bad row
- WHEN a person imports it
- THEN the preview lists the bad row with its reason
- AND the sheet stays unchanged until the person confirms

### Requirement: REQ-013 Excel export

The system SHALL export a sheet to an Excel file that the CGI costing tool opens. The export SHALL hold the same totals as the summary.

#### Scenario: Round trip
- GIVEN a sheet exported and imported again
- WHEN a person compares the summary
- THEN the totals are equal

### Requirement: REQ-014 Sealed sheets

The system SHALL seal all sheets with a project passphrase on request. It SHALL open them again on request. The passphrase MUST NOT appear in the repository. The system SHALL refuse a passphrase that does not open the sealed sheets. On a machine with no passphrase, a sealed sheet SHALL show a locked state.

#### Scenario: Seal
- GIVEN readable sheets
- WHEN the PM seals them
- THEN each sheet file becomes unreadable text and the view still works

#### Scenario: Wrong passphrase
- GIVEN sealed sheets
- WHEN a person enters a wrong passphrase
- THEN the system refuses and shows no number

#### Scenario: Locked
- GIVEN a machine with no passphrase
- WHEN a person opens a sealed sheet
- THEN the view shows the locked state with one action to enter the passphrase

### Requirement: REQ-015 Sheet and ticket

A sheet task MAY carry a `wi:` ref. The view SHALL show the estimate of the task beside the original estimate of the ticket.

#### Scenario: Side by side
- GIVEN a task linked to a ticket
- WHEN a person opens the task
- THEN the view shows both estimates

### Requirement: REQ-016 Plan from a sheet

Work / Plan SHALL compute a Gantt from one chosen estimate sheet, the team and the calendar. The calendar SHALL hold the working days and the public holidays. The computation SHALL use the capacity and the availability of each member.

#### Scenario: Computed
- GIVEN a sheet, a team and a calendar
- WHEN a person opens Work / Plan
- THEN the view shows a bar for each task with computed dates

#### Scenario: Holiday
- GIVEN a public holiday in the calendar
- WHEN the plan computes
- THEN no task works on that day

### Requirement: REQ-017 Human decisions only

The system SHALL store only the decisions of a person: task order, a fixed start and a member choice. The system MUST NOT store a computed date. One decision file SHALL serve all sheets.

#### Scenario: Team change
- GIVEN a plan and a member whose availability changes
- WHEN a person saves the team
- THEN the dates move and no plan file changes

#### Scenario: Fixed start
- GIVEN a person fixes a start date
- WHEN the person saves
- THEN the plan file holds that decision only

### Requirement: REQ-018 Plan view

Work / Plan SHALL show bars on a time scale with a today marker. A person SHALL be able to move a bar and change a decision with the keyboard. The view SHALL have one primary action.

#### Scenario: Keyboard
- GIVEN a bar with focus
- WHEN a person presses the move keys
- THEN the start decision changes and the bar moves

### Requirement: REQ-019 One source of effort

Effort numbers SHALL live in estimate sheets only. Work / Plan and the plan-and-apply flow SHALL read them. They MUST NOT keep a copy of the effort.

#### Scenario: Single edit
- GIVEN a task effort changed in a sheet
- WHEN a person opens the plan and the apply preview
- THEN both show the new effort

### Requirement: REQ-020 Time entry

Work / Time SHALL let a person add a time entry with a day, a duration and a note. The entry MAY name a ticket from the mirror. The system SHALL refuse an entry when it cannot resolve the member. The system MUST NOT run a timer.

#### Scenario: Add
- GIVEN a resolved member
- WHEN the person adds 2 h on Monday
- THEN the entry appears in the month

#### Scenario: No identity
- GIVEN no resolved member
- WHEN the person adds an entry
- THEN the system refuses and names the reason

### Requirement: REQ-021 Time storage

The system SHALL keep time entries as text, one file for each member and month, in the repository. [NEEDS CLARIFICATION: Q-034 Do time entries live in the repository or in the app data folder?] Working assumption: Q-034 option 1, in the repository.

#### Scenario: File
- GIVEN an entry added
- WHEN the person lists the repository changes
- THEN one time file of that member and month changed

### Requirement: REQ-022 Worklog send

The system SHALL send a time entry to the tracker worklog only when a person acts on that entry. An agent, a run or a tick MUST NOT send a worklog. The person SHALL choose to reduce the remaining estimate or leave it. The system SHALL disable the send when the tracker lacks the time tracking capability.

#### Scenario: Person send
- GIVEN an entry marked to send
- WHEN the person clicks send
- THEN the tracker receives one worklog

#### Scenario: Agent run
- GIVEN an active run on a ticket
- WHEN the run ends
- THEN no worklog is sent

### Requirement: REQ-023 No double count

The system SHALL write the entry first, send second and store the tracker receipt third. An entry with a receipt SHALL NOT be offered again. Each sent worklog SHALL carry a mark of the entry id. When a response is lost, the system SHALL find the worklog by its mark and SHALL NOT send it again.

#### Scenario: Lost response
- GIVEN a send whose response was lost
- WHEN the person fetches the tracker time
- THEN the system finds the mark and offers to store the receipt

#### Scenario: Receipt
- GIVEN a sent entry with a receipt
- WHEN the person opens the entry
- THEN no send action is offered

### Requirement: REQ-024 Time states

Each time row SHALL show one of three states: in the tracker, to send, or only in the tracker. The system MUST NOT add local and tracker hours together. The system SHALL flag a difference of duration and MUST NOT correct it.

#### Scenario: Difference
- GIVEN an entry of 2 h whose worklog now shows 3 h
- WHEN the person fetches the tracker time
- THEN the row flags the difference and both values stay

### Requirement: REQ-025 Plan and apply

Shipyard SHALL show the epics and stories to create or update from the estimate sheets. The preview SHALL mark each row create, update or unchanged against the mirror. The system MUST NOT write to the tracker before the PM applies. A reviewed split from `add-specs` SHALL use this preview and the apply of REQ-026, with one match mark.

#### Scenario: Preview
- GIVEN a sheet with 3 features and 1 ticket that exists
- WHEN the PM opens the preview
- THEN the preview shows 3 rows to create or update and 1 unchanged

#### Scenario: No apply
- GIVEN a preview
- WHEN the PM closes it
- THEN the tracker received nothing

### Requirement: REQ-026 Apply result

Apply SHALL write each row and SHALL show the result of each row. A failed row SHALL NOT undo the rows already written. A second apply SHALL NOT create a duplicate. Apply SHALL write the summary, description, estimate and parent, and MUST NOT write the status or the assignee. Apply SHALL match a row to its ticket by a mark that the ticket holds. [NEEDS CLARIFICATION: Q-033 How does apply match a row to its ticket?] Working assumption: Q-033 option 1, the `est:` ref of the row in a ticket label.

#### Scenario: Partial failure
- GIVEN an apply where the 3rd row fails
- WHEN the apply ends
- THEN rows 1 and 2 stay written and the view shows the failed row

#### Scenario: Repeat
- GIVEN an applied plan
- WHEN the PM applies again
- THEN no ticket is created twice

#### Scenario: Row match
- GIVEN a ticket that an earlier apply created
- WHEN the PM applies again
- THEN the row shows as unchanged

### Requirement: REQ-027 Work entities

The system SHALL expose members as `member:<handle>` and sheets as `est:<slug>`. The inspector SHALL show their backlinks. The run state of an item SHALL come from `add-factory` (REQ-034).

#### Scenario: Backlinks
- GIVEN a member with items and entries
- WHEN a person opens the member in the inspector
- THEN the inspector lists the items and the sheets that name the member

### Requirement: REQ-028 Work views

Each Work view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have one primary action. It SHALL have a keyboard path, a focus ring, assistive labels, contrast and reduced motion. It SHALL show French and English text.

#### Scenario: Keyboard
- GIVEN any Work view
- WHEN a person uses only the keyboard
- THEN the person reaches every action and sees a focus ring

#### Scenario: Language
- GIVEN the language set to French
- WHEN a person opens a Work view
- THEN all labels show in French

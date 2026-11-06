Feature: work

  @spec:work#REQ-001
  Scenario: Backlog: Filter
    Given a mirror with items of two assignees
    When a person filters by one assignee
    Then the list shows only that assignee's items

  @spec:work#REQ-001
  Scenario: Backlog: Offline
    Given the network is off
    When a person opens the backlog
    Then the backlog shows the mirror

  @spec:work#REQ-002
  Scenario: Board: Move
    Given a card in To do
    When a person moves it to In progress
    Then the issue tracker receives the transition and the card shows the new column

  @spec:work#REQ-002
  Scenario: Board: Refused
    Given the issue tracker refuses the transition
    When a person moves a card
    Then the card returns to its column and the view shows the refusal

  @spec:work#REQ-003
  Scenario: Team file: Duplicate
    Given a team file where two members share a handle
    When the system loads it
    Then the system names the duplicate and keeps the last valid team

  @spec:work#REQ-003
  Scenario: Team file: Shared e-mail
    Given a team file where two members share the e-mail ana@example.com
    When the system loads it
    Then the system names the duplicate e-mail and keeps the last valid team

  @spec:work#REQ-004
  Scenario: Team view: Edit
    Given a member with capacity 3 days a week
    When a person sets capacity to 4 and saves
    Then the file shows 4 and the view shows 4

  @spec:work#REQ-005
  Scenario: Day rate seal: Sealed rate
    Given the seal is on
    When a person opens the team file in an editor
    Then the day rate is unreadable text

  @spec:work#REQ-005
  Scenario: Day rate seal: Locked machine
    Given the seal is on and this machine has no passphrase
    When a person opens Work / Team
    Then the view hides the day rate and names the missing passphrase

  @spec:work#REQ-006
  Scenario: Assignment: Assign
    Given an unassigned item
    When the PM assigns member Ana
    Then the issue tracker shows Ana as assignee after the write

  @spec:work#REQ-006
  Scenario: Assignment: No capability
    Given an issue tracker with no assignee capability
    When the PM opens the assign action
    Then the action is disabled and names the missing capability

  @spec:work#REQ-007
  Scenario: Assignee suggestion: Ranked
    Given an item labelled `api` and two members, one with the skill `api` and free capacity
    When the PM opens the suggestion
    Then the member with the skill ranks first with its reason

  @spec:work#REQ-007
  Scenario: Assignee suggestion: Full capacity
    Given a member with no free capacity
    When the PM opens the suggestion
    Then that member ranks below the members with free capacity

  @spec:work#REQ-008
  Scenario: Agent pickup rule: Eligible
    Given an item assigned to me with the pickup label
    When a tick runs on my machine
    Then the item is eligible for pickup

  @spec:work#REQ-008
  Scenario: Agent pickup rule: Not mine
    Given an item assigned to another member with the pickup label
    When a tick runs on my machine
    Then the item is not eligible

  @spec:work#REQ-008
  Scenario: Agent pickup rule: Unknown handle
    Given an item assigned to a handle that the team file lacks
    When the PM opens the backlog
    Then the row shows an unknown member

  @spec:work#REQ-009
  Scenario: Estimate sheets: Two lots
    Given a project with the lots MVP 1 and MVP 2
    When a person opens Work / Estimates
    Then the view lists two sheets with their refs

  @spec:work#REQ-010
  Scenario: Effort entry: Percentage
    Given a build effort of 20 days and a test task of 25 %
    When a person opens the sheet
    Then the test task shows 5 days

  @spec:work#REQ-010
  Scenario: Effort entry: Edit
    Given a task effort changed
    When the person saves
    Then the file holds the entry and no total

  @spec:work#REQ-011
  Scenario: Four views: Summary
    Given a sheet with rates and efforts
    When a person opens the summary
    Then the view shows price, cost and margin

  @spec:work#REQ-011
  Scenario: Four views: Portfolio
    Given three sheets
    When a person opens the portfolio
    Then the view totals the three sheets

  @spec:work#REQ-012
  Scenario: Excel import: Preview
    Given an Excel file with one bad row
    When a person imports it
    Then the preview lists the bad row with its reason
    And the sheet stays unchanged until the person confirms

  @spec:work#REQ-013
  Scenario: Excel export: Round trip
    Given a sheet exported and imported again
    When a person compares the summary
    Then the totals are equal

  @spec:work#REQ-014
  Scenario: Sealed sheets: Typo
    Given a person types a passphrase and a different one to repeat it
    When the person seals
    Then nothing is sealed
    And the view says that the two differ

  @spec:work#REQ-014
  Scenario: Sealed sheets: Seal
    Given readable sheets
    When the PM seals them
    Then each sheet file becomes unreadable text and the view still works

  @spec:work#REQ-014
  Scenario: Sealed sheets: Wrong passphrase
    Given sealed sheets
    When a person enters a wrong passphrase
    Then the system refuses and shows no number

  @spec:work#REQ-014
  Scenario: Sealed sheets: Locked
    Given a machine with no passphrase
    When a person opens a sealed sheet
    Then the view shows the locked state with one action to enter the passphrase

  @spec:work#REQ-015
  Scenario: Sheet and ticket: Side by side
    Given a task linked to a ticket
    When a person opens the task
    Then the view shows both estimates

  @spec:work#REQ-016
  Scenario: Plan from a sheet: Computed
    Given a sheet, a team and a calendar
    When a person opens Work / Plan
    Then the view shows a bar for each task with computed dates

  @spec:work#REQ-016
  Scenario: Plan from a sheet: Holiday
    Given a public holiday in the calendar
    When the plan computes
    Then no task works on that day

  @spec:work#REQ-017
  Scenario: Human decisions only: Team change
    Given a plan and a member whose availability changes
    When a person saves the team
    Then the dates move and no plan file changes

  @spec:work#REQ-017
  Scenario: Human decisions only: Fixed start
    Given a person fixes a start date
    When the person saves
    Then the plan file holds that decision only

  @spec:work#REQ-018
  Scenario: Plan view: Keyboard
    Given a bar with focus
    When a person presses the move keys
    Then the start decision changes and the bar moves

  @spec:work#REQ-019
  Scenario: One source of effort: Single edit
    Given a task effort changed in a sheet
    When a person opens the plan and the apply preview
    Then both show the new effort

  @spec:work#REQ-020
  Scenario: Time entry: Add
    Given a resolved member
    When the person adds 2 h on Monday
    Then the entry appears in the month

  @spec:work#REQ-020
  Scenario: Time entry: No identity
    Given no resolved member
    When the person adds an entry
    Then the system refuses and names the reason

  @spec:work#REQ-021
  Scenario: Time storage: File
    Given an entry added
    When the person lists the repository changes
    Then one time file of that member and month changed

  @spec:work#REQ-022
  Scenario: Worklog send: Person send
    Given an entry marked to send
    When the person clicks send
    Then the issue tracker receives one worklog

  @spec:work#REQ-022
  Scenario: Worklog send: Save sends
    Given a ticket of a tracker with time tracking and a person with the right work.edit
    When the person saves an entry on the ticket
    Then the issue tracker receives one worklog and the entry stores its id

  @spec:work#REQ-022
  Scenario: Worklog send: Edit and delete reach the tracker
    Given a sent entry
    When the person edits or deletes it
    Then its worklog changes or goes, and a tracker that refuses leaves the entry marked not synced with the reason

  @spec:work#REQ-022
  Scenario: Worklog send: No time tracking
    Given a ticket of a tracker without time tracking
    When the person saves an entry
    Then the entry stays local and no error shows

  @spec:work#REQ-022
  Scenario: Worklog send: Agent run
    Given an active run on a ticket
    When the run ends
    Then no worklog is sent

  @spec:work#REQ-023
  Scenario: No double count: Another write during the send
    Given another entry is written while a send waits for the issue tracker
    When the send ends
    Then the receipt is set on a fresh copy of the file and the other entry stays

  @spec:work#REQ-023
  Scenario: No double count: Two clicks
    Given a send of an entry is in progress
    When a second send of the same entry starts
    Then the second waits, finds the receipt and sends nothing

  @spec:work#REQ-023
  Scenario: No double count: Lost response
    Given a send whose response was lost
    When the person fetches the issue tracker time
    Then the system finds the mark and offers to store the receipt

  @spec:work#REQ-023
  Scenario: No double count: Receipt
    Given a sent entry with a receipt
    When the person opens the entry
    Then no send action is offered

  @spec:work#REQ-024
  Scenario: Time states: Difference
    Given an entry of 2 h whose worklog now shows 3 h
    When the person fetches the issue tracker time
    Then the row flags the difference and both values stay

  @spec:work#REQ-024
  Scenario: Time states: Import
    Given a worklog that this person made on the issue tracker and that the system does not hold
    When the person reads the month twice
    Then one entry with the worklog id exists and a sent entry does not come twice

  @spec:work#REQ-025
  Scenario: Plan and apply: Preview
    Given a sheet with 3 features and 1 ticket that exists
    When the PM opens the preview
    Then the preview shows 3 rows to create or update and 1 unchanged

  @spec:work#REQ-025
  Scenario: Plan and apply: No apply
    Given a preview
    When the PM closes it
    Then the issue tracker received nothing

  @spec:work#REQ-026
  Scenario: Apply result: Partial failure
    Given an apply where the 3rd row fails
    When the apply ends
    Then rows 1 and 2 stay written and the view shows the failed row

  @spec:work#REQ-026
  Scenario: Apply result: Repeat
    Given an applied plan
    When the PM applies again
    Then no ticket is created twice

  @spec:work#REQ-026
  Scenario: Apply result: Row match
    Given a ticket that an earlier apply created
    When the PM applies again
    Then the row shows as unchanged

  @spec:work#REQ-027
  Scenario: Work entities: Backlinks
    Given a member with items and entries
    When a person opens the member in the inspector
    Then the inspector lists the items and the sheets that name the member

  @spec:work#REQ-028
  Scenario: Work views: Keyboard
    Given any Work view
    When a person uses only the keyboard
    Then the person reaches every action and sees a focus ring

  @spec:work#REQ-028
  Scenario: Work views: Language
    Given the language set to French
    When a person opens a Work view
    Then all labels show in French

  @spec:work#REQ-029
  Scenario: Create one work item: One click
    Given a ref of a diagram or a thread
    When a person clicks Create work item and confirms the row
    Then the apply writes one ticket and the ticket holds the source ref in a label

  @spec:work#REQ-029
  Scenario: Create one work item: Second click
    Given a ticket that holds the source ref
    When a person clicks Create work item again
    Then the row shows as unchanged and no ticket is created

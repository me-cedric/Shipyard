Feature: sync

  @spec:sync#REQ-001
  Scenario: Tick: Default interval
    Given a new issue tracker connection
    When the app runs for 3 minutes
    Then the issue tracker is polled about every 60 s with different delays

  @spec:sync#REQ-001
  Scenario: Tick: Changes only
    Given a tick ran 60 s ago
    When the next tick polls
    Then the request asks for items updated since the last tick

  @spec:sync#REQ-002
  Scenario: Interval setting: Too short
    Given a person enters 10 s
    When the person saves
    Then the system refuses the value and keeps the old interval

  @spec:sync#REQ-003
  Scenario: Reconcile before dispatch: Order
    Given a ticket closed and a new ticket ready
    When a tick runs
    Then the run of the closed ticket stops
    And then the new ticket is picked up

  @spec:sync#REQ-004
  Scenario: Stop terminal runs: Ticket closed
    Given a run is Working on a ticket
    When a tick finds the ticket Done
    Then the run moves to Cancelled with the reason ticket terminal

  @spec:sync#REQ-004
  Scenario: Stop terminal runs: Ticket closed by merge
    Given a run is PROpen and the code host closes the ticket at merge
    When a tick finds the merged pull request and the Done ticket
    Then `delivery` receives the merge event first
    And the run moves to Merged and then Done, not to Cancelled

  @spec:sync#REQ-005
  Scenario: Mirror: One connection, two containers
    Given two projects use one issue tracker connection with two containers
    When the first project polls
    Then the cursor and the claims of the second project do not change

  @spec:sync#REQ-005
  Scenario: Mirror: Offline read
    Given the network is off
    When a person opens the backlog
    Then the backlog shows the mirror

  @spec:sync#REQ-005
  Scenario: Mirror: Repository stays clean
    Given a sync ran
    When a person lists the repository changes
    Then no ticket file appears

  @spec:sync#REQ-006
  Scenario: Pickup filter: Match
    Given a ticket with the label `shipyard`, assigned to me, in an allowed status
    When a tick runs
    Then the ticket is picked up

  @spec:sync#REQ-006
  Scenario: Pickup filter: No match
    Given a ticket assigned to another member
    When a tick runs
    Then the ticket is not picked up on my machine

  @spec:sync#REQ-006
  Scenario: Pickup filter: Kill switch on
    Given the global kill switch is on and a ticket matches the filter
    When a tick runs
    Then the ticket is not picked up

  @spec:sync#REQ-007
  Scenario: Concurrency: Default limit
    Given no concurrency setting and 5 matching tickets
    When a tick runs
    Then 2 tickets are picked up

  @spec:sync#REQ-007
  Scenario: Concurrency: Status limit
    Given a limit of 1 for one status and 2 tickets in it
    When a tick runs
    Then 1 of them is picked up

  @spec:sync#REQ-008
  Scenario: Local claim: Race
    Given two ticks pick the same ticket at once
    When both try to claim
    Then one claim succeeds and one fails

  @spec:sync#REQ-009
  Scenario: Claim stamp: Look-alike
    Given another person wrote a comment that holds a claim marker
    When the system reads the stamps of the ticket
    Then the comment is not a stamp

  @spec:sync#REQ-009
  Scenario: Claim stamp: Refresh keeps its place
    Given machine A refreshes its stamp while a leftover stamp of machine B is live
    When the system orders the stamps
    Then the stamp of A stays first, by its first claim time

  @spec:sync#REQ-009
  Scenario: Claim stamp: Refresh with the switch off
    Given the `tracker_comment` switch is off and a claim holds a stamp
    When the heartbeat runs
    Then the system writes no stamp

  @spec:sync#REQ-009
  Scenario: Claim stamp: Wrong local clock
    Given the clock of this machine is one hour off
    When the system reads a stamp that is 30 s old by the issue tracker
    Then the stamp is 30 s old

  @spec:sync#REQ-009
  Scenario: Claim stamp: Two machines
    Given machine A stamped a ticket
    When machine B polls and matches the ticket
    Then machine B does not start a run on it

  @spec:sync#REQ-009
  Scenario: Claim stamp: Same moment
    Given two machines write a stamp on one ticket at the same moment
    When each machine reads the stamps again
    Then both machines see the older stamp as the winner
    And the other machine removes its stamp and starts no run

  @spec:sync#REQ-009
  Scenario: Claim stamp: Stamp fails
    Given the issue tracker refuses the stamp
    When the system claims a ticket
    Then the local claim is released
    And no run starts

  @spec:sync#REQ-009
  Scenario: Claim stamp: Switch off
    Given the `tracker_comment` switch is off, or the issue tracker has no comments
    When the system claims a ticket
    Then the claim is a row in the local store only
    And the issue tracker gets no write

  @spec:sync#REQ-009
  Scenario: Claim stamp: Switch off and a live stamp
    Given the `tracker_comment` switch is off and machine A stamped a ticket
    When machine B polls and matches the ticket
    Then machine B reads the stamp and starts no run

  @spec:sync#REQ-010
  Scenario: Release and stale claims: Release
    Given a run is Done
    When the run ends
    Then the claim and the stamp are removed

  @spec:sync#REQ-010
  Scenario: Release and stale claims: Stale takeover
    Given machine A stopped and did not refresh the stamp for the stale time
    When machine B polls
    Then machine B takes the claim

  @spec:sync#REQ-010
  Scenario: Release and stale claims: Claim lost
    Given machine B took the claim of machine A while A was off
    When machine A ticks again
    Then machine A stops its run with the reason claim lost
    And the stamp of machine B stays

  @spec:sync#REQ-011
  Scenario: Hand off comments: New comment
    Given a person answers on the issue tracker site
    When the next tick finds the comment
    Then `questions-loop` receives it once

  @spec:sync#REQ-011
  Scenario: Hand off comments: Marker
    Given a ticket comment holds the marker `<!-- shipyard:q Q-007 -->`
    When the next tick finds a later comment
    Then `questions-loop` receives it with the question id Q-007

  @spec:sync#REQ-012
  Scenario: Hand off pull request events: Merge
    Given a pull request is merged on the code host
    When the next tick finds it
    Then `delivery` receives one merge event

  @spec:sync#REQ-013
  Scenario: Sync action and state: Run at once
    Given the next tick is in 40 s
    When a person activates the sync action
    Then a tick runs now
    And the timer restarts

  @spec:sync#REQ-013
  Scenario: Sync action and state: Git fetch
    Given a project with a remote and a clean working copy
    When a person activates the sync action
    Then the tick runs, then the working branch fetches and fast-forwards

  @spec:sync#REQ-013
  Scenario: Sync action and state: No second control
    Given any view of the app
    When a person looks for a sync control
    Then only the status bar and the palette offer it

  @spec:sync#REQ-014
  Scenario: Failed poll: Network loss
    Given the network goes off
    When a tick fails
    Then the mirror stays
    And the connection shows failed
    And the next retry comes later

  @spec:sync#REQ-015
  Scenario: Adopt, link and import: Newer row stays
    Given a tick wrote a ticket after the import was planned
    When a person confirms the import
    Then the newer row stays

  @spec:sync#REQ-015
  Scenario: Adopt, link and import: Import backlog
    Given an issue tracker with 120 open tickets
    When a person imports the backlog
    Then the system shows the count 120
    And after confirm the mirror holds them

  @spec:sync#REQ-016
  Scenario: Entities and events: Resolve
    Given a mirrored ticket
    When the ref `wi:<KEY-N>` resolves
    Then it returns the title and the status

  @spec:sync#REQ-017
  Scenario: Interface rules: Keyboard only
    Given the status bar
    When a person focuses the sync action and presses Enter
    Then a tick runs

  @spec:sync#REQ-017
  Scenario: Interface rules: Language
    Given the language is French
    When a person reads the sync state
    Then every label is in French

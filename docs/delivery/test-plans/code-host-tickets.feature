Feature: code-host-tickets

  @spec:code-host-tickets#REQ-001
  Scenario: Run again
    Given a pull request with 2 of 3 checks failed
    When the person selects Run again
    Then the code host re-runs the 2 failed checks and the third check stays

  @spec:code-host-tickets#REQ-001
  Scenario: No permission
    Given a person who has no write permission on the code host
    When the person selects Run again
    Then nothing is sent and the card says the permission is missing

  @spec:code-host-tickets#REQ-002
  Scenario: Keep a file
    Given an assistant thread with two changed files
    When the person selects Keep on one file
    Then that file leaves the review list and the other file stays

  @spec:code-host-tickets#REQ-002
  Scenario: Undo a file
    Given an assistant thread with a changed file
    When the person selects Undo on it
    Then the change of that file reverts and the other files stay

  @spec:code-host-tickets#REQ-003
  Scenario: Change the recipe
    Given a ticket with the label of the recipe Bug
    When the person picks the recipe Feature
    Then the label of Bug is removed and the label of Feature is added

  @spec:code-host-tickets#REQ-004
  Scenario: Read releases
    Given a Jira project with the fix version MVP 1
    When the project syncs
    Then MVP 1 shows as a release on the ticket page and in Plan

  @spec:code-host-tickets#REQ-004
  Scenario: Set a release
    Given a ticket with no release
    When the person picks MVP 1
    Then the issue tracker holds MVP 1 as the release of the ticket

  @spec:code-host-tickets#REQ-004
  Scenario: Linear
    Given a Linear workspace with the project MVP 1
    When the project syncs
    Then the project shows as the release MVP 1

  @spec:code-host-tickets#REQ-005
  Scenario: Add a kind
    Given the issue tracker has the type Spike
    When the person adds the kind Spike under Story
    Then the hierarchy shows Spike under Story

  @spec:code-host-tickets#REQ-005
  Scenario: No type
    Given the person types a kind with no type in the issue tracker
    When the person selects Add
    Then Add refuses it

  @spec:code-host-tickets#REQ-006
  Scenario: Add a reviewer
    Given a new pull request page
    When the person picks the reviewer Grace and opens the pull request
    Then the code host lists Grace as a reviewer

  @spec:code-host-tickets#REQ-006
  Scenario: Default method
    Given the person picks Squash
    When the pull request is ready to merge
    Then the Merge button uses Squash

  @spec:code-host-tickets#REQ-007
  Scenario: Draft
    Given a pull request that the person opened as a draft
    When the page shows the actions
    Then Mark as ready and Close the pull request show

  @spec:code-host-tickets#REQ-007
  Scenario: Not a draft
    Given a pull request that is not a draft
    When the page shows the actions
    Then only Close the pull request shows

  @spec:code-host-tickets#REQ-008
  Scenario: Author avatar
    Given a pull request that Grace opened
    When the person opens Pull requests
    Then the row shows the avatar of Grace

  @spec:code-host-tickets#REQ-009
  Scenario: Check a line
    Given an impact report with an action plan
    When the person checks a line and picks the owner Grace
    Then the report file holds the line as checked with the name Grace

  @spec:code-host-tickets#REQ-009
  Scenario: No ticket
    Given a line with an owner
    When the person saves the line
    Then no ticket is made

  @spec:code-host-tickets#REQ-010
  Scenario: Accept
    Given a join request and a person with the merge right
    When the person picks the role Developer and selects Accept
    Then the team file holds the role Developer and the pull request is merged

  @spec:code-host-tickets#REQ-010
  Scenario: Accept refuses a join branch that asks for more
    Given a join request whose branch sets admin, changes another person or changes another file
    When the person selects Accept
    Then the pull request is not merged and the team file does not change

  @spec:code-host-tickets#REQ-010
  Scenario: No merge right
    Given a person with no merge right
    When the person opens the card
    Then Accept is off

  @spec:code-host-tickets#REQ-011
  Scenario: Go to Today
    Given a timeline that shows another month
    When the person selects Go to Today
    Then the timeline shows the current day

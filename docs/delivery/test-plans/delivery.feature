Feature: delivery

  @spec:delivery#REQ-001
  Scenario: Review in a fresh context: Fresh context
    Given a run ended its build steps
    When `SelfReview` starts
    Then the reviewer starts with no history of the builder
    And the reviewer receives the base, the head, the criteria and the standards sources

  @spec:delivery#REQ-002
  Scenario: Two review axes: Spec edited by the change
    Given the change edits its own spec
    When the review starts
    Then the criteria come from the spec at the base commit

  @spec:delivery#REQ-002
  Scenario: Two review axes: Criterion not run
    Given a criterion that the reviewer could not run
    When the review ends
    Then the report marks the criterion not verified with a reason

  @spec:delivery#REQ-003
  Scenario: Verified findings: Bad citation
    Given a finding cites a line that does not exist
    When the system checks the finding
    Then the system drops it and logs the drop

  @spec:delivery#REQ-004
  Scenario: Fix rounds: One round
    Given a review finds one defect
    When the builder fixes it and the review runs again
    Then the second review finds nothing and the run goes on

  @spec:delivery#REQ-004
  Scenario: Fix rounds: P2 only
    Given a review that finds one P2 finding and no P0 or P1 finding
    When the gate is green
    Then the run goes on to the pull request
    And the run log keeps the P2 finding

  @spec:delivery#REQ-004
  Scenario: Fix rounds: Rounds spent
    Given two fix rounds are spent and a P0 or P1 finding remains
    When the second re-review ends
    Then the run moves to `Blocked`
    And the Inbox shows a card with the findings

  @spec:delivery#REQ-005
  Scenario: Local review only: No post
    Given a run in `SelfReview`
    When the review ends
    Then no comment appears on the code host or on the ticket

  @spec:delivery#REQ-006
  Scenario: Gate before the pull request: Green gate
    Given a review with no P0 or P1 finding
    When the gate runs and passes
    Then the run goes on to the pull request with the counts kept

  @spec:delivery#REQ-006
  Scenario: Gate before the pull request: Red gate
    Given a review with no finding and a failing test
    When the gate runs
    Then the failure counts as a P1 finding and the run goes back to `Working`

  @spec:delivery#REQ-007
  Scenario: Branch name: Tool branch
    Given a worktree on the branch `claude/fix-login`
    When the system prepares the push
    Then the branch is renamed to the pattern before the push

  @spec:delivery#REQ-007
  Scenario: Branch name: Rebase
    Given the base moved after the run started
    When the system prepares the push
    Then the branch is rebased onto the base first

  @spec:delivery#REQ-008
  Scenario: Conventional commit: Stray file
    Given the worktree holds a file that is not part of the change
    When the system commits
    Then the commit holds only the files of the change

  @spec:delivery#REQ-009
  Scenario: Base branch: No declared base
    Given no declared base and a `develop` branch on the remote
    When the system opens the pull request
    Then the base is `develop`

  @spec:delivery#REQ-009
  Scenario: Base branch: Release branch
    Given the resolved base is a release branch and the run is a feature
    When the system prepares the pull request
    Then the system stops and asks a person

  @spec:delivery#REQ-010
  Scenario: Title and body: Body parts
    Given a run that delivers two tickets
    When the system writes the body
    Then the body opens with one paragraph
    And the body shows the gate result with its exact counts
    And the body has one item for each of the two tickets

  @spec:delivery#REQ-011
  Scenario: Labels: Missing label
    Given the code host has no label for the area `billing`
    When the system labels the pull request
    Then the system adds no `billing` label and creates none

  @spec:delivery#REQ-011
  Scenario: Labels: Judgement label
    Given a fix with a breaking change
    When the system labels the pull request
    Then no `breaking-change` label is added

  @spec:delivery#REQ-012
  Scenario: Assignee and reviewers: Reviewer list
    Given a reviewer list in the project rules
    When the system opens the pull request
    Then the pull request names those reviewers

  @spec:delivery#REQ-012
  Scenario: Assignee and reviewers: No reviewer
    Given an empty reviewer list
    When the system prepares the pull request
    Then an Inbox card asks a person to name a reviewer

  @spec:delivery#REQ-013
  Scenario: Draft first: Draft
    Given a run that opens a pull request
    When the code host creates it
    Then the pull request is a draft

  @spec:delivery#REQ-014
  Scenario: Push and pull request switches: Switch off
    Given `push` off and a run ready to push
    When the run reaches the push
    Then an approval appears in the Inbox and nothing is pushed

  @spec:delivery#REQ-014
  Scenario: Push and pull request switches: One click
    Given an approval for a pull request
    When the person clicks it
    Then the system opens the pull request

  @spec:delivery#REQ-014
  Scenario: Push and pull request switches: Switch on
    Given `pull_request` on
    When the run reaches the pull request step
    Then the system opens it with no approval

  @spec:delivery#REQ-015
  Scenario: Force push: Rewrite
    Given `push` on and a rebased branch already on the remote
    When the run pushes
    Then an approval names a force with lease
    And nothing is pushed before the click

  @spec:delivery#REQ-016
  Scenario: No double write: Retry after a crash
    Given a pull request opened and the app stopped before the run state changed
    When the app restarts and the run retries
    Then the system finds the pull request and the run moves to `PROpen`

  @spec:delivery#REQ-017
  Scenario: PROpen: Link
    Given a run that opened a pull request
    When a person opens the run
    Then the run shows the `pr:` ref and the pull request shows the `run:` ref

  @spec:delivery#REQ-018
  Scenario: CI failure: Red check
    Given a `PROpen` run and a failed check
    When the tick hands the CI failure
    Then the run moves to `ChangesRequested`
    And the run returns to `Working` in the same worktree with the name and URL of the failed check

  @spec:delivery#REQ-019
  Scenario: Review comments: Thread fixed
    Given a thread that asks for a rename
    When the run fixes and pushes
    Then the system replies with the commit and resolves the thread

  @spec:delivery#REQ-020
  Scenario: Feedback limits: Loop stops
    Given a run at its max turns
    When a new CI failure arrives
    Then the run moves to `Failed` and the Inbox shows it

  @spec:delivery#REQ-020
  Scenario: Feedback limits: Budget stop
    Given a run in a feedback loop at 100 % of its budget
    When a new review comment arrives
    Then the run moves to `Paused` and the Inbox shows it

  @spec:delivery#REQ-021
  Scenario: Lane data: Ready to merge
    Given a `PROpen` run with passing CI and no change request
    When Factory / Runs loads
    Then the run sits in Ready to merge

  @spec:delivery#REQ-021
  Scenario: Lane data: Draft
    Given a `PROpen` run with a draft pull request and passing CI
    When Factory / Runs loads
    Then the run sits in In review

  @spec:delivery#REQ-021
  Scenario: Lane data: In review
    Given a `PROpen` run with pending CI
    When Factory / Runs loads
    Then the run sits in In review

  @spec:delivery#REQ-022
  Scenario: Merge detection: Merge
    Given a `PROpen` run and a merged pull request
    When a tick runs
    Then the run moves to `Merged` and then `Done`
    And the run does not move to `Cancelled`

  @spec:delivery#REQ-022
  Scenario: Merge detection: Merge during a fix
    Given a run in a feedback round (`Working` or `SelfReview`) with its agents running and a push that waits for a click
    When the pull request merges
    Then the agents stop, the run moves to `Merged` and then `Done`, and the push approval is dropped

  @spec:delivery#REQ-023
  Scenario: Ticket move: Switch off
    Given `tracker_transition` off and a merged run
    When the run is `Merged`
    Then an approval names the ticket move

  @spec:delivery#REQ-023
  Scenario: Ticket move: Already closed
    Given the code host closed the ticket at the merge
    When the run is `Merged`
    Then the system sends no second move

  @spec:delivery#REQ-024
  Scenario: Run summary: Summary
    Given a merged run and `tracker_comment` on
    When the run is `Done`
    Then one summary with the five facts appears on the ticket

  @spec:delivery#REQ-024
  Scenario: Run summary: Switch off
    Given `tracker_comment` off
    When the run is `Merged`
    Then an approval shows the exact comment

  @spec:delivery#REQ-025
  Scenario: Worktree removal: Clean tree
    Given a merged run with a clean worktree
    When the run is `Done`
    Then the worktree is gone and the log stays

  @spec:delivery#REQ-025
  Scenario: Worktree removal: Dirty tree
    Given a merged run whose worktree holds uncommitted files
    When the system removes worktrees
    Then the worktree stays
    And the Inbox shows a card that names the files (`RunInfo.worktree_kept`)

  @spec:delivery#REQ-026
  Scenario: Closed without merge: Closed
    Given a `PROpen` run
    When a person closes the pull request
    Then the run moves to `Blocked`
    And the Inbox shows the run with the reopen and cancel choices

  @spec:delivery#REQ-027
  Scenario: Impacts digest: Digest
    Given an impacts digest for the diff
    When the system writes the body
    Then the body holds the digest

  @spec:delivery#REQ-027
  Scenario: Impacts digest: No digest
    Given no impacts digest
    When the system writes the body
    Then the body holds no empty digest section

  @spec:delivery#REQ-028
  Scenario: Pull request entity: Backlinks
    Given a pull request of a run
    When a person opens it in the inspector
    Then the inspector lists the run, the tickets and the commits

  @spec:delivery#REQ-029
  Scenario: Delivery views: Keyboard
    Given Factory / Runs with a run in In review
    When a person uses only the keyboard
    Then the person reaches the card, sees a focus ring and opens the pull request

  @spec:delivery#REQ-029
  Scenario: Delivery views: Status shape
    Given a run with failing CI
    When the card shows the CI state
    Then the state has a shape and a colour and an assistive label

  @spec:delivery#REQ-030
  Scenario: Closed review: Uncited finding
    Given a review that reports one P1 finding with no path and no line
    When the report ends
    Then the finding blocks and the run goes to a fix round

  @spec:delivery#REQ-030
  Scenario: Closed review: No usable finding
    Given a review whose only finding cites a line that does not exist, and an outcome that is not `done`
    When the report ends
    Then the run goes to a fix round

  @spec:delivery#REQ-031
  Scenario: Outgoing text: Mention in a title
    Given a ticket title with `@bob` and the robot sign
    When the pull request opens
    Then the title and the body hold no working mention and no robot sign

  @spec:delivery#REQ-032
  Scenario: Open pull request lookup: Closed only
    Given a branch with one closed pull request
    When the system looks for its pull request
    Then the answer is none

  @spec:delivery#REQ-033
  Scenario: Gate process group: Timeout
    Given a gate command that starts a child and runs past the limit
    When the limit passes
    Then the command and its child are gone

  @spec:delivery#REQ-034
  Scenario: Pull request branch: Other branch
    Given an approval that names a branch and a run folder on another branch
    When the person approves it
    Then no pull request opens and the error names both branches

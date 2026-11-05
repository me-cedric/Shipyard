Feature: agent-pr

  @spec:agent-pr#REQ-001
  Scenario: Review action: Open pull request
    Given an open pull request
    When a person opens its detail
    Then the page shows "Review with an agent"

  @spec:agent-pr#REQ-001
  Scenario: Review action: Closed pull request
    Given a merged or closed pull request
    When a person opens its detail
    Then the page does not offer the action

  @spec:agent-pr#REQ-002
  Scenario: Review run: Read only
    Given a started agent review
    When the agent runs
    Then the worktree is at the head commit and no file in it changes

  @spec:agent-pr#REQ-003
  Scenario: Project rules: With the skill
    Given a project that has the `review` skill
    When the review starts
    Then the prompt names the skill and the role

  @spec:agent-pr#REQ-003
  Scenario: Project rules: Without the skill
    Given a project that has no `review` skill
    When the review starts
    Then the built-in reviewer prompt applies

  @spec:agent-pr#REQ-004
  Scenario: Draft review: Post
    Given a draft review with two findings
    When the person drops one finding and clicks "Post review"
    Then the pull request receives the summary and one finding on its line

  @spec:agent-pr#REQ-004
  Scenario: Draft review: Post once
    Given a posted review
    When the person looks at the page
    Then the page offers no second post of the same draft

  @spec:agent-pr#REQ-005
  Scenario: Write with an agent: Fill
    Given a pushed branch with a linked ticket
    When the person clicks "Write with an agent"
    Then the form shows a title and a body and opens no pull request

  @spec:agent-pr#REQ-005
  Scenario: Write with an agent: Open
    Given a filled form
    When the person edits the title and clicks "Open"
    Then the pull request opens with the edited text

  @spec:agent-pr#REQ-006
  Scenario: Automatic review: Draft
    Given `auto_review: draft` and a new head commit
    When the sync tick runs twice
    Then one draft review exists for that commit

  @spec:agent-pr#REQ-006
  Scenario: Automatic review: Off
    Given no `auto_review` key
    When the sync tick runs
    Then no agent review starts

  @spec:agent-pr#REQ-007
  Scenario: Posting mode: Post
    Given `auto_review: post`
    When the review ends
    Then the pull request shows a comment review and no approval

  @spec:agent-pr#REQ-007
  Scenario: Posting mode: Draft wait
    Given `auto_review: draft`
    When the review ends
    Then the draft shows on the pull request page and in Home / Needs you

  @spec:agent-pr#REQ-008
  Scenario: Budget and stop: Switch
    Given the "Agents stopped" switch is on
    When a person or a tick asks for a review
    Then no review starts and the page names the switch

  @spec:agent-pr#REQ-008
  Scenario: Budget and stop: Limit
    Given the concurrency limit is reached
    When a person asks for a review
    Then the review waits or the page names the limit

  @spec:agent-pr#REQ-009
  Scenario: Read-only lock: Locked
    Given the read-only lock is on
    When a person clicks one of the three actions
    Then the action is refused with the plain error and nothing starts

  @spec:agent-pr#REQ-010
  Scenario: Setting: Choose
    Given Settings / Project
    When a person picks Draft
    Then `.shipyard/automation.yaml` holds `auto_review: draft`

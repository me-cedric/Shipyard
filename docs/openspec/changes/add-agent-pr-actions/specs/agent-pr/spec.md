# Spec: agent-pr

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-31
Change: `change:add-agent-pr-actions`

### Goal

Any person can ask an agent to review a pull request, or to write a new pull request, from the pull request page. The agent follows the project's rules. A project can also turn on an automatic agent review.

### Why

Reviews and pull request text take time and follow rules that the project already wrote down (agent-compass `review` and `pr-flow` skills, `reviewer` role). One click must apply them for every role, also for a person with little technical knowledge.

### Users And Scenarios

- Tester: opens a teammate's pull request, clicks "Review with an agent", reads the findings on their lines, and posts the review.
- Developer: pushes a branch, opens the new pull request form, clicks "Write with an agent", checks the text, and opens the pull request.
- Project manager: turns on the automatic review in Settings / Project, so each pull request gets a review before a person looks at it.

### Requirements

- REQ-001: The pull request detail SHALL show "Review with an agent" for an open pull request. The action SHALL start one agent review of the current head commit.
- REQ-002: The review SHALL run in a fresh context, in a read-only worktree at the head commit of the pull request. It SHALL use the runner and model of the `reviewer` role. The default SHALL be the default runner of the project. It SHALL reuse the reviewer of `crates/shipyard-engine/src/review.rs`.
- REQ-003: The review prompt SHALL name the `review` skill and the `reviewer` role when the project has them (`.claude/skills/review/`, `.agents/skills/review/`, `.claude/agents/reviewer.md`). Without them, the built-in reviewer prompt SHALL apply.
- REQ-004: The result SHALL be a draft review: a summary, a verdict (approve, comment, request changes) and findings with a path and a line. The page SHALL show each finding on its line of the diff. The person SHALL be able to edit the summary and the verdict, drop a finding, and post the review with one click.
- REQ-005: "Write with an agent" in the new pull request form SHALL fill the title and the body from the branch diff, the linked ticket and the linked spec change. It SHALL follow the `pr-flow` skill when the project has it: the body lists the impacts and the refs. The person SHALL edit the text before "Open". The agent MUST NOT open the pull request from this form.
- REQ-006: `.shipyard/automation.yaml` SHALL accept `auto_review: off | draft | post` (default `off`). With `draft` or `post`, the sync tick SHALL start one agent review for each new pull request and for each new head commit. The system SHALL start one review for each head commit. A second tick MUST NOT start another.
- REQ-007: With `post`, the agent SHALL post its review as a comment review. The agent MUST NOT approve and MUST NOT request changes on its own. A person SHALL set the final verdict. With `draft`, the draft SHALL wait on the pull request page and in Home / Needs you.
- REQ-008: An agent review SHALL count against the project budget and the concurrency limit of the factory. It SHALL show in Factory / Sessions and a person SHALL be able to stop it there. The global "Agents stopped" switch SHALL block it.
- REQ-009: The read-only lock and a read-only Code page SHALL refuse all three actions with the plain error of the error contract.
- REQ-010: Settings / Project SHALL show the automatic review as one choice with three options: Off, Draft and Post. The labels SHALL show in English and French.

### Non-Goals

- An agent that merges a pull request.
- An agent that pushes fixes to the reviewed branch. "Send back to the agent" already covers that.
- Reviews on Azure DevOps until its pull request support is confirmed.

### Acceptance Criteria

- [ ] "Review with an agent" on an open pull request gives a draft with findings on their lines. "Post review" posts it once.
- [ ] A project with the compass `review` skill gets a prompt that names it. A project without it gets the built-in prompt.
- [ ] "Write with an agent" fills the title and the body. Nothing is opened before "Open".
- [ ] `auto_review: draft` gives one draft for each new head commit, and none for a commit already reviewed.
- [ ] `auto_review: post` posts a comment review and never an approval.
- [ ] The read-only lock refuses each action. The budget and the kill switch stop an automatic review.

### Existing References

- Existing code/docs/specs: `crates/shipyard-app/src/code.rs` (`pull_open`, `pull_verdict`, `pull_send_back`), `crates/shipyard-engine/src/review.rs`, `crates/shipyard-engine/src/pull_request.rs`, `crates/shipyard-core/src/pickup.rs` (automation keys), `src/features/code/pull-requests.tsx`, `src/features/code/pr-ai.tsx`
- Supersedes or extends: extends `docs/openspec/changes/add-code/` and `docs/openspec/changes/add-factory/`

## ADDED Requirements

### Requirement: REQ-001 Review action

The pull request detail SHALL show "Review with an agent" for an open pull request. The action SHALL start one agent review of the current head commit.

#### Scenario: Open pull request
- GIVEN an open pull request
- WHEN a person opens its detail
- THEN the page shows "Review with an agent"

#### Scenario: Closed pull request
- GIVEN a merged or closed pull request
- WHEN a person opens its detail
- THEN the page does not offer the action

### Requirement: REQ-002 Review run

The review SHALL run in a fresh context, in a read-only worktree at the head commit of the pull request. It SHALL use the runner and model of the `reviewer` role. The default SHALL be the default runner of the project. It SHALL reuse the reviewer of `crates/shipyard-engine/src/review.rs`.

#### Scenario: Read only
- GIVEN a started agent review
- WHEN the agent runs
- THEN the worktree is at the head commit and no file in it changes

### Requirement: REQ-003 Project rules

The review prompt SHALL name the `review` skill and the `reviewer` role when the project has them (`.claude/skills/review/`, `.agents/skills/review/`, `.claude/agents/reviewer.md`). Without them, the built-in reviewer prompt SHALL apply.

#### Scenario: With the skill
- GIVEN a project that has the `review` skill
- WHEN the review starts
- THEN the prompt names the skill and the role

#### Scenario: Without the skill
- GIVEN a project that has no `review` skill
- WHEN the review starts
- THEN the built-in reviewer prompt applies

### Requirement: REQ-004 Draft review

The result SHALL be a draft review: a summary, a verdict (approve, comment, request changes) and findings with a path and a line. The page SHALL show each finding on its line of the diff. The person SHALL be able to edit the summary and the verdict, drop a finding, and post the review with one click.

#### Scenario: Post
- GIVEN a draft review with two findings
- WHEN the person drops one finding and clicks "Post review"
- THEN the pull request receives the summary and one finding on its line

#### Scenario: Post once
- GIVEN a posted review
- WHEN the person looks at the page
- THEN the page offers no second post of the same draft

### Requirement: REQ-005 Write with an agent

"Write with an agent" in the new pull request form SHALL fill the title and the body from the branch diff, the linked ticket and the linked spec change. It SHALL follow the `pr-flow` skill when the project has it: the body lists the impacts and the refs. The person SHALL edit the text before "Open". The agent MUST NOT open the pull request from this form.

#### Scenario: Fill
- GIVEN a pushed branch with a linked ticket
- WHEN the person clicks "Write with an agent"
- THEN the form shows a title and a body and opens no pull request

#### Scenario: Open
- GIVEN a filled form
- WHEN the person edits the title and clicks "Open"
- THEN the pull request opens with the edited text

### Requirement: REQ-006 Automatic review

`.shipyard/automation.yaml` SHALL accept `auto_review: off | draft | post` (default `off`). With `draft` or `post`, the sync tick SHALL start one agent review for each new pull request and for each new head commit. The system SHALL start one review for each head commit. A second tick MUST NOT start another.

#### Scenario: Draft
- GIVEN `auto_review: draft` and a new head commit
- WHEN the sync tick runs twice
- THEN one draft review exists for that commit

#### Scenario: Off
- GIVEN no `auto_review` key
- WHEN the sync tick runs
- THEN no agent review starts

### Requirement: REQ-007 Posting mode

With `post`, the agent SHALL post its review as a comment review. The agent MUST NOT approve and MUST NOT request changes on its own. A person SHALL set the final verdict. With `draft`, the draft SHALL wait on the pull request page and in Home / Needs you.

#### Scenario: Post
- GIVEN `auto_review: post`
- WHEN the review ends
- THEN the pull request shows a comment review and no approval

#### Scenario: Draft wait
- GIVEN `auto_review: draft`
- WHEN the review ends
- THEN the draft shows on the pull request page and in Home / Needs you

### Requirement: REQ-008 Budget and stop

An agent review SHALL count against the project budget and the concurrency limit of the factory. It SHALL show in Factory / Sessions and a person SHALL be able to stop it there. The global "Agents stopped" switch SHALL block it.

#### Scenario: Switch
- GIVEN the "Agents stopped" switch is on
- WHEN a person or a tick asks for a review
- THEN no review starts and the page names the switch

#### Scenario: Limit
- GIVEN the concurrency limit is reached
- WHEN a person asks for a review
- THEN the review waits or the page names the limit

### Requirement: REQ-009 Read-only lock

The read-only lock and a read-only Code page SHALL refuse all three actions with the plain error of the error contract.

#### Scenario: Locked
- GIVEN the read-only lock is on
- WHEN a person clicks one of the three actions
- THEN the action is refused with the plain error and nothing starts

### Requirement: REQ-010 Setting

Settings / Project SHALL show the automatic review as one choice with three options: Off, Draft and Post. The labels SHALL show in English and French.

#### Scenario: Choose
- GIVEN Settings / Project
- WHEN a person picks Draft
- THEN `.shipyard/automation.yaml` holds `auto_review: draft`

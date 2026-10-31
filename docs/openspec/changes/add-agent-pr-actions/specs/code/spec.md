# Spec: agent review and agent-written pull requests

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-31

## Goal

Any person can ask an agent to review a pull request, or to write a new pull request, from the pull request page. The agent follows the project's rules. A project can also turn on an automatic agent review.

## Why

Reviews and pull request text take time and follow rules that the project already wrote down (agent-compass `review` and `pr-flow` skills, `reviewer` role). One click must apply them, for every role, also for a person with little technical knowledge.

## Users And Scenarios

- Tester: opens a teammate's pull request, clicks "Review with an agent", reads the findings on their lines, and posts the review.
- Developer: pushes a branch, opens the new pull request form, clicks "Write with an agent", checks the text, and opens the pull request.
- Project manager: turns on the automatic review in Settings / Project, so each pull request gets a review before a person looks at it.

## Requirements

- REQ-001: The pull request detail shows "Review with an agent" for an open pull request. It starts one agent review of the current head commit.
- REQ-002: The review runs in a fresh context, in a read-only worktree at the head commit of the pull request, with the runner and model of the `reviewer` role (default: the project's default runner). It reuses the reviewer of `crates/shipyard-engine/src/review.rs`.
- REQ-003: The review prompt follows the project's rules: it names the `review` skill and the `reviewer` role when the project has them (`.claude/skills/review/`, `.agents/skills/review/`, `.claude/agents/reviewer.md`). Without them, the built-in reviewer prompt applies.
- REQ-004: The result is a draft review: a summary, a verdict (approve, comment, request changes) and findings with a path and a line. The page shows each finding on its line of the diff. The person can edit the summary and the verdict, drop a finding, and post the review with one click.
- REQ-005: "Write with an agent" in the new pull request form fills the title and the body from the branch diff, the linked ticket and the linked spec change. It follows the `pr-flow` skill when the project has it: the body lists the impacts and the refs. The person edits the text before "Open". The agent never opens the pull request itself from this form.
- REQ-006: `.shipyard/automation.yaml` gets `auto_review: off | draft | post` (default `off`). With `draft` or `post`, the sync tick starts one agent review for each new pull request and for each new head commit. One review per head commit: a second tick does not start another.
- REQ-007: With `post`, the agent posts its review as a comment review. It never approves and never requests changes on its own; a person sets the final verdict. With `draft`, the draft waits on the pull request page and in Home / Needs you.
- REQ-008: An agent review counts against the project budget and the concurrency limit of the factory. It shows in Factory / Sessions and can be stopped there. The global "Agents stopped" switch blocks it.
- REQ-009: The read-only lock and a read-only Code page refuse all three actions with the plain error of the error contract.
- REQ-010: Settings / Project shows the automatic review as one choice with three options (Off, Draft, Post), in English and French.

## Non-Goals

- An agent that merges a pull request.
- An agent that pushes fixes to the reviewed branch. "Send back to the agent" already covers that.
- Reviews on Azure DevOps until its pull request support is confirmed.

## Acceptance Criteria

- [ ] "Review with an agent" on an open pull request gives a draft with findings on their lines; "Post review" posts it once.
- [ ] A project with the compass `review` skill gets a prompt that names it; a project without it gets the built-in prompt.
- [ ] "Write with an agent" fills the title and the body; nothing is opened before "Open".
- [ ] `auto_review: draft` gives one draft per new head commit, and none for a commit already reviewed.
- [ ] `auto_review: post` posts a comment review and never an approval.
- [ ] The read-only lock refuses each action; the budget and the kill switch stop an automatic review.

## Existing References

- Existing code/docs/specs: `crates/shipyard-app/src/code.rs` (`pull_open`, `pull_verdict`, `pull_send_back`), `crates/shipyard-engine/src/review.rs`, `crates/shipyard-engine/src/pull_request.rs`, `crates/shipyard-core/src/pickup.rs` (automation keys), `src/features/code/pull-requests.tsx`, `src/features/code/pr-ai.tsx`
- Supersedes or extends: extends `docs/openspec/changes/add-code/` and `docs/openspec/changes/add-factory/`

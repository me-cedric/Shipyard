# Spec: delivery

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-delivery`

### Goal

A run takes its change from a reviewed worktree to a merged pull request and a closed ticket. It follows the team rules, reacts to CI and review feedback, and cleans up after the merge.

### Why

Agent work has value only when it is reviewed, merged and closed on the tracker. The earlier tool lists pull requests. No run takes a change from a worktree to a merged pull request and a closed ticket.

### Users And Scenarios

- PM: sees which runs wait for review or merge, and approves the pushes and pull requests.
- Architect: reads the review findings against the standards before a merge.
- Developer: gets CI failures and review comments back in the same worktree and merges.
- QA: sees the gate result and the CI state on each pull request.
- BA: finds the pull request and the run summary on the ticket of a requirement.
- Functional lead: sees a ticket close only after a merge.
- Junior: gets a pull request that follows the team rules with no manual step.

### Requirements

- REQ-001: After the build steps end, the run SHALL be in `SelfReview` (`add-factory` REQ-036). The `reviewer` role SHALL review in a fresh context with the compass `review` skill. The reviewer SHALL get the base, the head, the criteria and the standards sources. The reviewer MUST NOT get the reasoning of the builder.
- REQ-002: The review SHALL check the spec axis and the standards axis. The system SHALL take the criteria from the ticket and from the specs at the base commit. The reviewer SHALL mark each criterion OK, KO or not verified.
- REQ-003: Each finding SHALL cite a path and a line. The system SHALL open the cited line before it accepts the finding. The system SHALL drop a finding whose citation does not exist.
- REQ-004: A P0 or P1 finding SHALL send the run back to `Working` for a fix round. A P2 finding SHALL NOT block the pull request, and the run log SHALL keep it. The system SHALL allow two fix rounds at most. When a P0 or P1 finding remains after the second round, the run SHALL move to `Blocked`. Home / Inbox SHALL then show a card that lists the findings (`RunInfo.findings`).
- REQ-005: `SelfReview` SHALL post nothing to the forge and nothing to the tracker. The review report SHALL stay in the run log.
- REQ-006: A pull request SHALL open only when `SelfReview` has no P0 or P1 finding and the gate is green. The gate SHALL run the gate commands of the project and the system SHALL keep the exact counts. A red gate SHALL count as a P1 finding. [NEEDS CLARIFICATION: Q-030 Where does a project declare its gate commands?] Working assumption: Q-030 option 1, in `.shipyard/project.yaml`.
- REQ-007: The system SHALL name the branch `<type>/<area>/<kebab>`. The system SHALL rename a branch that a tool named, such as `claude/…` or `codex/…`, before the first push. The system SHALL rebase the branch onto the base before the push.
- REQ-008: The system SHALL commit only the files of the change. The message SHALL follow `<type>(<scope>): <subject>`. The message MUST NOT hold an AI attribution line.
- REQ-009: The base SHALL be the base that the project declares. Else it SHALL be `develop` when that branch exists. Else it SHALL be the default branch. The system MUST NOT open a feature pull request onto a release branch.
- REQ-010: The title SHALL follow the commit. The body SHALL start with an opening paragraph, then the gate result, then one item for each ticket. The body MUST NOT hold a count or a verdict that the run log does not hold. No title, body or comment SHALL hold an AI attribution line.
- REQ-011: The system SHALL read the labels of the forge first and SHALL use only labels that exist. It SHALL add one type label and each area label that the diff touches. It MUST NOT add a label that states a judgement. It MUST NOT remove a label that a person set.
- REQ-012: The assignee of the pull request SHALL be the member who owns the ticket. The pull request SHALL name at least one reviewer. [NEEDS CLARIFICATION: Q-029 Who are the default reviewers of a pull request that a run opens?] Working assumption: Q-029 option 1, the `reviewers` list of `.shipyard/automation.yaml`, with an optional `assignee`. A person edits them in Settings / Project, group Automation (`add-factory` REQ-025).
- REQ-013: The pull request SHALL open as a draft. Marking it ready SHALL be a person's action in `add-code`.
- REQ-014: The `push` and `pull_request` switches SHALL be off by default (`add-factory` REQ-025). [NEEDS CLARIFICATION: Q-002 What is the default for automation writes?] Working assumption: Q-002 option 1, all off. A write without its switch SHALL become an approval in Home / Inbox that names the exact write. One click SHALL send it. A rejection SHALL drop the write and move the run to `Blocked` (`add-factory` REQ-026).
- REQ-015: A push that rewrites history SHALL use force with lease. It MUST NOT use a plain force. It SHALL always wait as an approval, also when `push` is on.
- REQ-016: Before it opens a pull request, the system SHALL look for a pull request of the same branch. The system MUST NOT open a second pull request or post a second summary for one run. A retry or a repeated tick SHALL find the first one.
- REQ-017: When the pull request exists, the run SHALL move to `PROpen`. The system SHALL record `pr:<forge>:<number>` on the run. The pull request SHALL link back to the run and to each ticket.
- REQ-018: When `sync` hands a CI failure to delivery (`add-sync` REQ-012), a `PROpen` run SHALL move to `ChangesRequested`. It SHALL then move to `Working` in the same worktree (`add-factory` REQ-002). The run SHALL get the name and the URL of each failed check, and the tail of its log when the forge gives it.
- REQ-019: A review that asks for changes SHALL move a `PROpen` run to `ChangesRequested`. A new review comment SHALL do the same. The run SHALL then move to `Working` in the same worktree and SHALL get each thread. After the fix and the push, the system SHALL reply on each thread with the fixing commit. Then it SHALL resolve the thread. These replies are one `pull_request` write for all threads of the round: one approval when the switch is off. The run does not wait for it.
- REQ-020: A loop between `PROpen`, `ChangesRequested` and `Working` SHALL count against the budget and the max turns of the run. The run SHALL stop at those limits (`add-factory` REQ-022, REQ-023). Each feedback round gets its own count of review fix rounds (REQ-004).
- REQ-021: For each `PROpen` run, the system SHALL give the CI state (passing, failing or pending). It SHALL also say whether a change request is open and whether the pull request is a draft. Factory / Runs SHALL use all three to place the run (`add-factory` REQ-038). A draft SHALL sit in In review, whatever its CI state.
- REQ-022: When `sync` hands a merge event to delivery, the run SHALL move to `Merged` and then to `Done`. Delivery SHALL handle the event before `sync` stops runs for a terminal ticket (`add-sync` REQ-003, REQ-004). The run SHALL reach `Done` in the same step, also when a write of REQ-023 or REQ-024 waits for a click: that write goes out after the click.
- REQ-023: After the merge, the system SHALL move each ticket of the run to the terminal status of the mapping. The move SHALL follow the `tracker_transition` switch. Without the switch it SHALL be an approval in Home / Inbox. The system MUST NOT move a ticket that the forge already closed.
- REQ-024: After the merge, the system SHALL post the run summary on each ticket once. The summary SHALL hold the outcome, the `pr:` ref, the gate result, the review rounds and the cost. It SHALL follow the `tracker_comment` switch. It MUST NOT hold a secret or an AI attribution line.
- REQ-025: After the merge, the system SHALL remove the worktree of the run. The system MUST NOT remove a worktree that holds uncommitted files. It SHALL keep the run log after the removal.
- REQ-026: When a pull request closes without a merge, the run SHALL move to `Blocked`, also while it works on a fix. The reason SHALL be pull request closed. The worktree and the ticket SHALL stay as they are. [NEEDS CLARIFICATION: Q-031 What happens to a run when its pull request closes without a merge?] Working assumption: Q-031 option 1, `Blocked`, and a person decides to reopen or cancel.
- REQ-027: When `add-code` gives an impacts digest, the pull request body SHALL include it as one section.
- REQ-028: The system SHALL expose each pull request as a `pr:<forge>:<number>` entity. The entity SHALL show state, CI state and review state. The mirror of `sync` SHALL stay the source for reads.
- REQ-029: The run cards in In review and Ready to merge SHALL show the `pr:` ref, CI state and review state. Status SHALL use shape and colour together. Delivery SHALL add no primary action to Factory / Runs. Each delivery view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have a keyboard path, a focus ring, assistive labels, contrast and reduced motion. It SHALL show French and English text.
- REQ-030: A P0 or P1 finding with no citation, or with an unknown severity, SHALL block the run. Only a finding with a bad citation SHALL be dropped. A review that ends with no usable finding and an outcome other than `done` SHALL block the run.
- REQ-031: A title, a body, a comment or a summary that Shipyard posts to a tracker or a forge SHALL hold no AI attribution line and no mention that notifies a person. An attribution line is a `Co-Authored-By` line, a line with `generated with`, or the robot sign.
- REQ-032: The lookup of the pull request of a branch SHALL return an open pull request or none. A merged or a closed pull request SHALL NOT be a target for a push or a thread reply.
- REQ-033: A gate command SHALL run in its own process group. A timeout and the exit of the app SHALL kill the command and its children.
- REQ-034: A write that opens a pull request SHALL name the branch of the run folder. The system SHALL refuse it when the run folder is on another branch, or when the branch is the base.

### Non-Goals

- Merging a pull request. A person merges in `add-code` / Pull requests.
- Commenting, approving or requesting changes by hand. `add-code` owns those person actions.
- The run state machine, the write switches and the lanes. `add-factory` owns them. This change adds the rules that use them.
- Polling the forge and the tracker. `add-sync` owns it.
- Forge adapters and credentials. `add-connections` owns them.
- A webhook. Polling only.

### Acceptance Criteria

- [x] A run in `SelfReview` uses a reviewer with no history of the builder and posts nothing outside the run log. Test: `crates/shipyard-engine/tests/review.rs`.
- [x] A finding that cites a missing line is dropped. Test: `crates/shipyard-engine/tests/review.rs`.
- [x] A third fix round never starts. The run moves to `Blocked` and the Inbox shows the P0 and P1 findings. Test: `crates/shipyard-engine/tests/review.rs`.
- [x] A red gate sends the run back to `Working`. A green gate with no P0 or P1 finding opens the pull request step, also with a P2 finding. Test: `crates/shipyard-engine/tests/review.rs`.
- [x] A draft pull request sits in In review, whatever its CI state. Test: `crates/shipyard-core/tests/delivery.rs` (`lanes`), `src/features/factory/delivery.test.tsx`.
- [x] The branch follows `<type>/<area>/<kebab>`, and the commit and the body hold no AI attribution line. Test: `crates/shipyard-core/tests/delivery.rs`, `crates/shipyard-engine/tests/pull_request.rs`.
- [x] The pull request uses only labels that exist and opens as a draft. Test: `crates/shipyard-core/tests/delivery.rs`, `crates/shipyard-engine/tests/pull_request.rs`.
- [x] With `push` and `pull_request` off, the Inbox shows one approval for each write, and one click sends it. Test: `crates/shipyard-engine/tests/pull_request.rs`.
- [x] A force with lease always waits for a click. Test: `crates/shipyard-engine/tests/approvals.rs`, `crates/shipyard-engine/tests/feedback.rs`.
- [x] A repeated tick opens one pull request and posts one summary. Test: `crates/shipyard-engine/tests/pull_request.rs`, `crates/shipyard-engine/tests/merge.rs`.
- [x] A CI failure and a review comment each send the run to `ChangesRequested` and back to `Working` in the same worktree. Test: `crates/shipyard-engine/tests/feedback.rs`.
- [x] A merged pull request moves the run to `Merged` and `Done`, never to `Cancelled`, then moves the ticket, posts the summary and removes the clean worktree. Test: `crates/shipyard-engine/tests/merge.rs`.
- [x] A pull request closed without a merge moves the run to `Blocked`. Test: `crates/shipyard-engine/tests/feedback.rs`.
- [x] Factory / Runs shows In review and Ready to merge with the pull request, CI and review state. Test: `src/features/factory/delivery.test.tsx`, `e2e/delivery.spec.ts`.
- [ ] Every delivery view works with the keyboard, shows a focus ring and has French and English text.

### Links

- Consumes: `add-factory` (the run, its worktree and the write switches; REQ-002, REQ-004, REQ-022 to REQ-026, REQ-036, REQ-038), `add-sync` (pull request, CI and merge events; REQ-003, REQ-004, REQ-005, REQ-012), `add-connections` (Forge adapter and Tracker transitions; REQ-003, REQ-005), `add-code` (branch and push operations, the impacts digest, the person actions on a pull request), `add-extensions` (compass `review` and `pr-flow` skills).
- Produces: `pr:` entities for `add-code` and `add-refs`, ticket moves and the run summary for the tracker, CI and review feedback for `add-factory`, the lane data for In review and Ready to merge.
- Related: `add-shell` REQ-004 (approvals in the Inbox).

### Feature list

| Feature | Shipyard view | REQ ids |
| --- | --- | --- |
| Pull requests: open | Factory / Runs (In review, Ready to merge); Home / Inbox approvals | REQ-007 to REQ-014, REQ-017, REQ-021, REQ-028, REQ-029 |
| Pull requests: comment, approve, request changes, merge | Code / Pull requests (`add-code`); delivery reads the result | REQ-018, REQ-019, REQ-022 |
| Impacts digest attached to a pull request | Pull request body | REQ-027 |

### Existing References

- `docs/plan/MASTER-PLAN.md` sections 5.3, 5.7 and 5.8.
- `docs/openspec/constitution.md` sections 2, 4 and 5.
- `docs/decisions/0005-run-state-owned-by-shipyard.md`
- `docs/delivery/questions/Q-002.md`
- `docs/delivery/questions/Q-029.md`
- `docs/delivery/questions/Q-030.md`
- `docs/delivery/questions/Q-031.md`
- `.claude/skills/pr-flow/SKILL.md` and `.claude/skills/review/SKILL.md`

## ADDED Requirements

### Requirement: REQ-001 Review in a fresh context

After the build steps end, the run SHALL be in `SelfReview` (`add-factory` REQ-036). The `reviewer` role SHALL review in a fresh context with the compass `review` skill. The reviewer SHALL get the base, the head, the criteria and the standards sources. The reviewer MUST NOT get the reasoning of the builder.

#### Scenario: Fresh context
- GIVEN a run ended its build steps
- WHEN `SelfReview` starts
- THEN the reviewer starts with no history of the builder
- AND the reviewer receives the base, the head, the criteria and the standards sources

### Requirement: REQ-002 Two review axes

The review SHALL check the spec axis and the standards axis. The system SHALL take the criteria from the ticket and from the specs at the base commit. The reviewer SHALL mark each criterion OK, KO or not verified.

#### Scenario: Spec edited by the change
- GIVEN the change edits its own spec
- WHEN the review starts
- THEN the criteria come from the spec at the base commit

#### Scenario: Criterion not run
- GIVEN a criterion that the reviewer could not run
- WHEN the review ends
- THEN the report marks the criterion not verified with a reason

### Requirement: REQ-003 Verified findings

Each finding SHALL cite a path and a line. The system SHALL open the cited line before it accepts the finding. The system SHALL drop a finding whose citation does not exist.

#### Scenario: Bad citation
- GIVEN a finding cites a line that does not exist
- WHEN the system checks the finding
- THEN the system drops it and logs the drop

### Requirement: REQ-004 Fix rounds

A P0 or P1 finding SHALL send the run back to `Working` for a fix round. A P2 finding SHALL NOT block the pull request, and the run log SHALL keep it. The system SHALL allow two fix rounds at most. When a P0 or P1 finding remains after the second round, the run SHALL move to `Blocked`. Home / Inbox SHALL then show a card that lists the findings (`RunInfo.findings`).

#### Scenario: One round
- GIVEN a review finds one defect
- WHEN the builder fixes it and the review runs again
- THEN the second review finds nothing and the run goes on

#### Scenario: P2 only
- GIVEN a review that finds one P2 finding and no P0 or P1 finding
- WHEN the gate is green
- THEN the run goes on to the pull request
- AND the run log keeps the P2 finding

#### Scenario: Rounds spent
- GIVEN two fix rounds are spent and a P0 or P1 finding remains
- WHEN the second re-review ends
- THEN the run moves to `Blocked`
- AND the Inbox shows a card with the findings

### Requirement: REQ-005 Local review only

`SelfReview` SHALL post nothing to the forge and nothing to the tracker. The review report SHALL stay in the run log.

#### Scenario: No post
- GIVEN a run in `SelfReview`
- WHEN the review ends
- THEN no comment appears on the forge or on the ticket

### Requirement: REQ-006 Gate before the pull request

A pull request SHALL open only when `SelfReview` has no P0 or P1 finding and the gate is green. The gate SHALL run the gate commands of the project and the system SHALL keep the exact counts. A red gate SHALL count as a P1 finding. [NEEDS CLARIFICATION: Q-030 Where does a project declare its gate commands?] Working assumption: Q-030 option 1, in `.shipyard/project.yaml`.

#### Scenario: Green gate
- GIVEN a review with no P0 or P1 finding
- WHEN the gate runs and passes
- THEN the run goes on to the pull request with the counts kept

#### Scenario: Red gate
- GIVEN a review with no finding and a failing test
- WHEN the gate runs
- THEN the failure counts as a P1 finding and the run goes back to `Working`

### Requirement: REQ-007 Branch name

The system SHALL name the branch `<type>/<area>/<kebab>`. The system SHALL rename a branch that a tool named, such as `claude/…` or `codex/…`, before the first push. The system SHALL rebase the branch onto the base before the push.

#### Scenario: Tool branch
- GIVEN a worktree on the branch `claude/fix-login`
- WHEN the system prepares the push
- THEN the branch is renamed to the pattern before the push

#### Scenario: Rebase
- GIVEN the base moved after the run started
- WHEN the system prepares the push
- THEN the branch is rebased onto the base first

### Requirement: REQ-008 Conventional commit

The system SHALL commit only the files of the change. The message SHALL follow `<type>(<scope>): <subject>`. The message MUST NOT hold an AI attribution line.

#### Scenario: Stray file
- GIVEN the worktree holds a file that is not part of the change
- WHEN the system commits
- THEN the commit holds only the files of the change

### Requirement: REQ-009 Base branch

The base SHALL be the base that the project declares. Else it SHALL be `develop` when that branch exists. Else it SHALL be the default branch. The system MUST NOT open a feature pull request onto a release branch.

#### Scenario: No declared base
- GIVEN no declared base and a `develop` branch on the remote
- WHEN the system opens the pull request
- THEN the base is `develop`

#### Scenario: Release branch
- GIVEN the resolved base is a release branch and the run is a feature
- WHEN the system prepares the pull request
- THEN the system stops and asks a person

### Requirement: REQ-010 Title and body

The title SHALL follow the commit. The body SHALL start with an opening paragraph, then the gate result, then one item for each ticket. The body MUST NOT hold a count or a verdict that the run log does not hold. No title, body or comment SHALL hold an AI attribution line.

#### Scenario: Body parts
- GIVEN a run that delivers two tickets
- WHEN the system writes the body
- THEN the body opens with one paragraph
- AND the body shows the gate result with its exact counts
- AND the body has one item for each of the two tickets

### Requirement: REQ-011 Labels

The system SHALL read the labels of the forge first and SHALL use only labels that exist. It SHALL add one type label and each area label that the diff touches. It MUST NOT add a label that states a judgement. It MUST NOT remove a label that a person set.

#### Scenario: Missing label
- GIVEN the forge has no label for the area `billing`
- WHEN the system labels the pull request
- THEN the system adds no `billing` label and creates none

#### Scenario: Judgement label
- GIVEN a fix with a breaking change
- WHEN the system labels the pull request
- THEN no `breaking-change` label is added

### Requirement: REQ-012 Assignee and reviewers

The assignee of the pull request SHALL be the member who owns the ticket. The pull request SHALL name at least one reviewer. [NEEDS CLARIFICATION: Q-029 Who are the default reviewers of a pull request that a run opens?] Working assumption: Q-029 option 1, the `reviewers` list of `.shipyard/automation.yaml`, with an optional `assignee`. A person edits them in Settings / Project, group Automation (`add-factory` REQ-025).

#### Scenario: Reviewer list
- GIVEN a reviewer list in the project rules
- WHEN the system opens the pull request
- THEN the pull request names those reviewers

#### Scenario: No reviewer
- GIVEN an empty reviewer list
- WHEN the system prepares the pull request
- THEN an Inbox card asks a person to name a reviewer

### Requirement: REQ-013 Draft first

The pull request SHALL open as a draft. Marking it ready SHALL be a person's action in `add-code`.

#### Scenario: Draft
- GIVEN a run that opens a pull request
- WHEN the forge creates it
- THEN the pull request is a draft

### Requirement: REQ-014 Push and pull request switches

The `push` and `pull_request` switches SHALL be off by default (`add-factory` REQ-025). [NEEDS CLARIFICATION: Q-002 What is the default for automation writes?] Working assumption: Q-002 option 1, all off. A write without its switch SHALL become an approval in Home / Inbox that names the exact write. One click SHALL send it. A rejection SHALL drop the write and move the run to `Blocked` (`add-factory` REQ-026).

#### Scenario: Switch off
- GIVEN `push` off and a run ready to push
- WHEN the run reaches the push
- THEN an approval appears in the Inbox and nothing is pushed

#### Scenario: One click
- GIVEN an approval for a pull request
- WHEN the person clicks it
- THEN the system opens the pull request

#### Scenario: Switch on
- GIVEN `pull_request` on
- WHEN the run reaches the pull request step
- THEN the system opens it with no approval

### Requirement: REQ-015 Force push

A push that rewrites history SHALL use force with lease. It MUST NOT use a plain force. It SHALL always wait as an approval, also when `push` is on.

#### Scenario: Rewrite
- GIVEN `push` on and a rebased branch already on the remote
- WHEN the run pushes
- THEN an approval names a force with lease
- AND nothing is pushed before the click

### Requirement: REQ-016 No double write

Before it opens a pull request, the system SHALL look for a pull request of the same branch. The system MUST NOT open a second pull request or post a second summary for one run. A retry or a repeated tick SHALL find the first one.

#### Scenario: Retry after a crash
- GIVEN a pull request opened and the app stopped before the run state changed
- WHEN the app restarts and the run retries
- THEN the system finds the pull request and the run moves to `PROpen`

### Requirement: REQ-017 PROpen

When the pull request exists, the run SHALL move to `PROpen`. The system SHALL record `pr:<forge>:<number>` on the run. The pull request SHALL link back to the run and to each ticket.

#### Scenario: Link
- GIVEN a run that opened a pull request
- WHEN a person opens the run
- THEN the run shows the `pr:` ref and the pull request shows the `run:` ref

### Requirement: REQ-018 CI failure

When `sync` hands a CI failure to delivery (`add-sync` REQ-012), a `PROpen` run SHALL move to `ChangesRequested`. It SHALL then move to `Working` in the same worktree (`add-factory` REQ-002). The run SHALL get the name and the URL of each failed check, and the tail of its log when the forge gives it.

#### Scenario: Red check
- GIVEN a `PROpen` run and a failed check
- WHEN the tick hands the CI failure
- THEN the run moves to `ChangesRequested`
- AND the run returns to `Working` in the same worktree with the name and URL of the failed check

### Requirement: REQ-019 Review comments

A review that asks for changes SHALL move a `PROpen` run to `ChangesRequested`. A new review comment SHALL do the same. The run SHALL then move to `Working` in the same worktree and SHALL get each thread. After the fix and the push, the system SHALL reply on each thread with the fixing commit. Then it SHALL resolve the thread. These replies are one `pull_request` write for all threads of the round: one approval when the switch is off. The run does not wait for it.

#### Scenario: Thread fixed
- GIVEN a thread that asks for a rename
- WHEN the run fixes and pushes
- THEN the system replies with the commit and resolves the thread

### Requirement: REQ-020 Feedback limits

A loop between `PROpen`, `ChangesRequested` and `Working` SHALL count against the budget and the max turns of the run. The run SHALL stop at those limits (`add-factory` REQ-022, REQ-023). Each feedback round gets its own count of review fix rounds (REQ-004).

#### Scenario: Loop stops
- GIVEN a run at its max turns
- WHEN a new CI failure arrives
- THEN the run moves to `Failed` and the Inbox shows it

#### Scenario: Budget stop
- GIVEN a run in a feedback loop at 100 % of its budget
- WHEN a new review comment arrives
- THEN the run moves to `Paused` and the Inbox shows it

### Requirement: REQ-021 Lane data

For each `PROpen` run, the system SHALL give the CI state (passing, failing or pending). It SHALL also say whether a change request is open and whether the pull request is a draft. Factory / Runs SHALL use all three to place the run (`add-factory` REQ-038). A draft SHALL sit in In review, whatever its CI state.

#### Scenario: Ready to merge
- GIVEN a `PROpen` run with passing CI and no change request
- WHEN Factory / Runs loads
- THEN the run sits in Ready to merge

#### Scenario: Draft
- GIVEN a `PROpen` run with a draft pull request and passing CI
- WHEN Factory / Runs loads
- THEN the run sits in In review

#### Scenario: In review
- GIVEN a `PROpen` run with pending CI
- WHEN Factory / Runs loads
- THEN the run sits in In review

### Requirement: REQ-022 Merge detection

When `sync` hands a merge event to delivery, the run SHALL move to `Merged` and then to `Done`. Delivery SHALL handle the event before `sync` stops runs for a terminal ticket (`add-sync` REQ-003, REQ-004). The run SHALL reach `Done` in the same step, also when a write of REQ-023 or REQ-024 waits for a click: that write goes out after the click.

#### Scenario: Merge
- GIVEN a `PROpen` run and a merged pull request
- WHEN a tick runs
- THEN the run moves to `Merged` and then `Done`
- AND the run does not move to `Cancelled`

#### Scenario: Merge during a fix
- GIVEN a run in a feedback round (`Working` or `SelfReview`) with its agents running and a push that waits for a click
- WHEN the pull request merges
- THEN the agents stop, the run moves to `Merged` and then `Done`, and the push approval is dropped

### Requirement: REQ-023 Ticket move

After the merge, the system SHALL move each ticket of the run to the terminal status of the mapping. The move SHALL follow the `tracker_transition` switch. Without the switch it SHALL be an approval in Home / Inbox. The system MUST NOT move a ticket that the forge already closed.

#### Scenario: Switch off
- GIVEN `tracker_transition` off and a merged run
- WHEN the run is `Merged`
- THEN an approval names the ticket move

#### Scenario: Already closed
- GIVEN the forge closed the ticket at the merge
- WHEN the run is `Merged`
- THEN the system sends no second move

### Requirement: REQ-024 Run summary

After the merge, the system SHALL post the run summary on each ticket once. The summary SHALL hold the outcome, the `pr:` ref, the gate result, the review rounds and the cost. It SHALL follow the `tracker_comment` switch. It MUST NOT hold a secret or an AI attribution line.

#### Scenario: Summary
- GIVEN a merged run and `tracker_comment` on
- WHEN the run is `Done`
- THEN one summary with the five facts appears on the ticket

#### Scenario: Switch off
- GIVEN `tracker_comment` off
- WHEN the run is `Merged`
- THEN an approval shows the exact comment

### Requirement: REQ-025 Worktree removal

After the merge, the system SHALL remove the worktree of the run. The system MUST NOT remove a worktree that holds uncommitted files. It SHALL keep the run log after the removal.

#### Scenario: Clean tree
- GIVEN a merged run with a clean worktree
- WHEN the run is `Done`
- THEN the worktree is gone and the log stays

#### Scenario: Dirty tree
- GIVEN a merged run whose worktree holds uncommitted files
- WHEN the system removes worktrees
- THEN the worktree stays
- AND the Inbox shows a card that names the files (`RunInfo.worktree_kept`)

### Requirement: REQ-026 Closed without merge

When a pull request closes without a merge, the run SHALL move to `Blocked`, also while it works on a fix. The reason SHALL be pull request closed. The worktree and the ticket SHALL stay as they are. [NEEDS CLARIFICATION: Q-031 What happens to a run when its pull request closes without a merge?] Working assumption: Q-031 option 1, `Blocked`, and a person decides to reopen or cancel.

#### Scenario: Closed
- GIVEN a `PROpen` run
- WHEN a person closes the pull request
- THEN the run moves to `Blocked`
- AND the Inbox shows the run with the reopen and cancel choices

### Requirement: REQ-027 Impacts digest

When `add-code` gives an impacts digest, the pull request body SHALL include it as one section.

#### Scenario: Digest
- GIVEN an impacts digest for the diff
- WHEN the system writes the body
- THEN the body holds the digest

#### Scenario: No digest
- GIVEN no impacts digest
- WHEN the system writes the body
- THEN the body holds no empty digest section

### Requirement: REQ-028 Pull request entity

The system SHALL expose each pull request as a `pr:<forge>:<number>` entity. The entity SHALL show state, CI state and review state. The mirror of `sync` SHALL stay the source for reads.

#### Scenario: Backlinks
- GIVEN a pull request of a run
- WHEN a person opens it in the inspector
- THEN the inspector lists the run, the tickets and the commits

### Requirement: REQ-029 Delivery views

The run cards in In review and Ready to merge SHALL show the `pr:` ref, CI state and review state. Status SHALL use shape and colour together. Delivery SHALL add no primary action to Factory / Runs. Each delivery view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have a keyboard path, a focus ring, assistive labels, contrast and reduced motion. It SHALL show French and English text.

#### Scenario: Keyboard
- GIVEN Factory / Runs with a run in In review
- WHEN a person uses only the keyboard
- THEN the person reaches the card, sees a focus ring and opens the pull request

#### Scenario: Status shape
- GIVEN a run with failing CI
- WHEN the card shows the CI state
- THEN the state has a shape and a colour and an assistive label

### Requirement: REQ-030 Closed review

A P0 or P1 finding with no citation, or with an unknown severity, SHALL block the run. Only a finding with a bad citation SHALL be dropped. A review that ends with no usable finding and an outcome other than `done` SHALL block the run.

#### Scenario: Uncited finding
- GIVEN a review that reports one P1 finding with no path and no line
- WHEN the report ends
- THEN the finding blocks and the run goes to a fix round

#### Scenario: No usable finding
- GIVEN a review whose only finding cites a line that does not exist, and an outcome that is not `done`
- WHEN the report ends
- THEN the run goes to a fix round

### Requirement: REQ-031 Outgoing text

A title, a body, a comment or a summary that Shipyard posts to a tracker or a forge SHALL hold no AI attribution line and no mention that notifies a person. An attribution line is a `Co-Authored-By` line, a line with `generated with`, or the robot sign.

#### Scenario: Mention in a title
- GIVEN a ticket title with `@bob` and the robot sign
- WHEN the pull request opens
- THEN the title and the body hold no working mention and no robot sign

### Requirement: REQ-032 Open pull request lookup

The lookup of the pull request of a branch SHALL return an open pull request or none. A merged or a closed pull request SHALL NOT be a target for a push or a thread reply.

#### Scenario: Closed only
- GIVEN a branch with one closed pull request
- WHEN the system looks for its pull request
- THEN the answer is none

### Requirement: REQ-033 Gate process group

A gate command SHALL run in its own process group. A timeout and the exit of the app SHALL kill the command and its children.

#### Scenario: Timeout
- GIVEN a gate command that starts a child and runs past the limit
- WHEN the limit passes
- THEN the command and its child are gone

### Requirement: REQ-034 Pull request branch

A write that opens a pull request SHALL name the branch of the run folder. The system SHALL refuse it when the run folder is on another branch, or when the branch is the base.

#### Scenario: Other branch
- GIVEN an approval that names a branch and a run folder on another branch
- WHEN the person approves it
- THEN no pull request opens and the error names both branches

# Spec: docs-freshness

## Purpose

Status: Settled
Owner: Cédric Meyer
Created: 2026-11-04
Change: `change:add-docs-freshness`

### Goal

Shipyard tells a person which docs of the project are out of date against the code, in the places where the person already looks. One click lets an agent update them.

### Why

The architecture model, the diagrams, the API description, the data models, the network flows, the screens and the test plans are files in the repository. A change to the code makes some of them wrong. Shipyard checks only the chain from the specs to the other doc folders. It cannot tell that a new crate, a new table or a new network call needs a doc change. The owner wants the repository of Shipyard to follow its own rule, and wants every other project to get the same check.

### Users And Scenarios

- Architect: adds a crate and sees a warning that the architecture model did not change.
- Developer: changes a table and gets the warning before the commit. Then clicks "Update with an agent" and reviews the diff.
- QA: sees the Docs check in Code / Quality and knows which test plans lag behind the specs.
- Project manager: reads the count of stale docs and knows when a release has outdated docs.
- Junior: follows the warning to the doc and the code that caused it.

### Requirement list

- REQ-001: The project file SHALL accept an optional list `docs`. Each rule holds `code` (one or more path patterns) and `feeds` (one or more doc targets), and an optional `name`. A doc target is a path kind of the project (for example `models`) or a repository path.
- REQ-002: A project with no `docs` list SHALL use the fixed chain of today as its rules: specs feed designs, models, api, data and test-plans, and api feeds test-plans.
- REQ-003: The system SHALL report a doc as stale when a file that a rule matches changed and no file of the doc target changed in the same range.
- REQ-004: The system SHALL measure the range in the same three places as the docs chain: the staged files before a commit, the unpushed files before a push, and the whole branch against its base in Code / Changes.
- REQ-005: The stale docs SHALL show in the docs chain warnings with the changed code files and the doc target. A person SHALL be able to acknowledge a warning with a reason. The acknowledgement SHALL stay in the repository and SHALL cover the changed files that the person saw.
- REQ-006: Code / Quality SHALL show a Docs check that lists the stale docs of the branch. The check SHALL pass with no stale doc. Its report SHALL be kept like the report of any other check.
- REQ-007: Each stale doc SHALL offer one action, "Update with an agent". The action SHALL run only after a click of the person. The system MUST NOT start an agent by itself.
- REQ-008: The agent run SHALL use the `docs` role in a worktree, SHALL change only the files of the doc target, and SHALL end with a pull request that follows the approval switches of the project.
- REQ-009: After the agent run, the system SHALL read each changed doc with the reader of its folder and SHALL report each doc that does not parse. A doc that does not parse MUST NOT go into the pull request.
- REQ-010: The system SHALL refuse a `docs` rule whose pattern is empty, absolute, contains `..` or a backslash, or whose target is not a valid path kind or path. The project file validation SHALL name the field, for example `docs[0].code[1]`.
- REQ-011: The check SHALL write nothing. Only the agent run after a click changes a file.
- REQ-012: The texts of the feature SHALL follow the interface rules of the constitution, SHALL say "issue tracker" and "code host", and SHALL ship in French and English.

### Non-Goals

- Checking that the text of a doc is correct. The system checks that a doc moved with the code, not what it says.
- Reading the code to find what a doc should say. The agent does that after a click.
- A hosted service or a webhook.
- A rule that blocks a commit. A warning never blocks. The person acknowledges it or fixes it.
- A new doc format. The readers of the Design and Specs spaces stay as they are.

### Acceptance Criteria

- [x] A project with no `docs` list shows the same warnings as before this change.
- [x] A rule that maps `crates/*/Cargo.toml` to `models` warns when a Cargo file changes without a change in the models folder, and stops warning when the model changes.
- [x] The warning shows in the commit gate, the push gate and the branch watch with the same acknowledge action.
- [x] Code / Quality shows the Docs check with its count and keeps its report.
- [x] A click on "Update with an agent" starts one run with the `docs` role. No click starts none.
- [x] A doc that the agent left unreadable is reported and does not go into the pull request.
- [x] A rule with a `..` pattern is refused and the project file names the field.
- [x] Every view works with the keyboard, shows a focus ring and has French and English text.

### Existing References

- Existing code/docs/specs: `crates/shipyard-app/src/commands/overview.rs` (`CHAIN`, `stale`, `chain_gate`, `chain_watch`), `crates/shipyard-app/src/commands/chain_acks.rs`, `crates/shipyard-core/src/project.rs`, `src/features/code/chain-watch.tsx`, `src/features/code/chain-ack.tsx`, `src/features/code/quality.tsx`
- Supersedes or extends: extends `docs/openspec/specs/projects/` (REQ-007) and `docs/openspec/specs/code/` (REQ-026, REQ-028)

## Requirements

### Requirement: REQ-001 Doc rules in the project file

The project file SHALL accept an optional list `docs`. Each rule holds `code` (one or more path patterns) and `feeds` (one or more doc targets), and an optional `name`. A doc target is a path kind of the project (for example `models`) or a repository path.

#### Scenario: A rule
- GIVEN a project file with a rule that maps `crates/*/Cargo.toml` to `models`
- WHEN Shipyard reads the project file
- THEN the project holds that rule

#### Scenario: No list
- GIVEN a project file with no `docs` list
- WHEN Shipyard reads the project file
- THEN the project holds no rule of its own

### Requirement: REQ-002 Default rules

A project with no `docs` list SHALL use the fixed chain of today as its rules: specs feed designs, models, api, data and test-plans, and api feeds test-plans.

#### Scenario: Same warnings as before
- GIVEN a project with no `docs` list
- WHEN a file of the specs folder changes and the models folder does not
- THEN the warning from specs to models shows as it does today

### Requirement: REQ-003 Stale doc

The system SHALL report a doc as stale when a file that a rule matches changed and no file of the doc target changed in the same range.

#### Scenario: Doc did not follow
- GIVEN a rule that maps `crates/*/Cargo.toml` to `models`
- WHEN a Cargo file changes and nothing in the models folder changes
- THEN the models doc is stale

#### Scenario: Doc followed
- GIVEN the same rule
- WHEN a Cargo file and a file of the models folder change together
- THEN the models doc is not stale

### Requirement: REQ-004 Same ranges as the docs chain

The system SHALL measure the range in the same three places as the docs chain: the staged files before a commit, the unpushed files before a push, and the whole branch against its base in Code / Changes.

#### Scenario: Before a commit
- GIVEN a staged code file that a rule matches and no staged doc
- WHEN the person starts a commit
- THEN the warning shows

#### Scenario: Branch watch
- GIVEN a branch that changed a matched code file and no fed doc since its base
- WHEN the person opens the branch watch in Code / Changes
- THEN the warning shows

### Requirement: REQ-005 Warnings and acknowledgement

The stale docs SHALL show in the docs chain warnings with the changed code files and the doc target. A person SHALL be able to acknowledge a warning with a reason. The acknowledgement SHALL stay in the repository and SHALL cover the changed files that the person saw.

#### Scenario: Acknowledge
- GIVEN a stale doc warning
- WHEN the person acknowledges it with a reason
- THEN the warning shows as acknowledged and the repository holds the reason

#### Scenario: New file
- GIVEN an acknowledged warning
- WHEN another matched code file changes
- THEN the warning comes back

### Requirement: REQ-006 Docs check in Quality

Code / Quality SHALL show a Docs check that lists the stale docs of the branch. The check SHALL pass with no stale doc. Its report SHALL be kept like the report of any other check.

#### Scenario: Stale docs
- GIVEN a branch with two stale docs
- WHEN the person opens Code / Quality
- THEN the Docs check fails and lists the two docs with their code files

#### Scenario: Clean
- GIVEN a branch with no stale doc
- WHEN the person opens Code / Quality
- THEN the Docs check passes

### Requirement: REQ-007 Update after a click

Each stale doc SHALL offer one action, "Update with an agent". The action SHALL run only after a click of the person. The system MUST NOT start an agent by itself.

#### Scenario: Click
- GIVEN a stale doc
- WHEN the person clicks "Update with an agent"
- THEN one run with the `docs` role starts

#### Scenario: No click
- GIVEN a stale doc
- WHEN a sync tick or a check runs
- THEN no run starts

### Requirement: REQ-008 Agent run

The agent run SHALL use the `docs` role in a worktree, SHALL change only the files of the doc target, and SHALL end with a pull request that follows the approval switches of the project.

#### Scenario: Run ends
- GIVEN a run that updated the models doc
- WHEN the run ends
- THEN the worktree holds changes in the models folder only
- AND the pull request waits for a click in Home / Needs you when the switch is off

### Requirement: REQ-009 Readable docs

After the agent run, the system SHALL read each changed doc with the reader of its folder and SHALL report each doc that does not parse. A doc that does not parse MUST NOT go into the pull request.

#### Scenario: Broken doc
- GIVEN an agent that left a model file with a syntax error
- WHEN the run ends
- THEN the report names the file and the error
- AND the pull request does not hold the file

### Requirement: REQ-010 Rule validation

The system SHALL refuse a `docs` rule whose pattern is empty, absolute, contains `..` or a backslash, or whose target is not a valid path kind or path. The project file validation SHALL name the field, for example `docs[0].code[1]`.

#### Scenario: Bad pattern
- GIVEN a rule with the pattern `../outside/*`
- WHEN Shipyard validates the project file
- THEN it reports the field `docs[0].code[0]` with that value

### Requirement: REQ-011 Read only check

The check SHALL write nothing. Only the agent run after a click changes a file.

#### Scenario: Check runs
- GIVEN a project with stale docs
- WHEN the check runs
- THEN no file of the project changes

### Requirement: REQ-012 Plain words and both languages

The texts of the feature SHALL follow the interface rules of the constitution, SHALL say "issue tracker" and "code host", and SHALL ship in French and English.

#### Scenario: Language switch
- GIVEN the person switches the language to French
- WHEN the person opens a stale doc warning
- THEN the labels show in French

# Spec: code (delta of update-app-redesign)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-19
Change: `change:update-app-redesign`

### Goal

The checks and the scanners show as the Health view of Flow for every role, and the impacts of a change open from the Checks of its feature.

### Why

The health of the product is not only for a person with a right on code (`spec:app-redesign#REQ-023`).

### Requirements

- REQ-026: Flow / Health SHALL list the check scripts that the project declares, for every role. The system MUST NOT run a check that the project does not declare. A run SHALL need a confirmation that names the check, and SHALL be off without the right. Each result SHALL show pass or fail, the duration and the output tail.
- REQ-027: Flow / Health SHALL run the security scanners and show their results. The scans cover vulnerable dependencies, leaked secrets, flaws in the code and risks in agent skills. Each finding SHALL show a severity and a path. Shipyard downloads each program into the app data folder after one click that names it.
- REQ-007: The card of the sync mark SHALL hold the commit action of the shell (`spec:shell#REQ-021`), and Code / Now SHALL keep its commit box. The action SHALL commit the staged files only.
- REQ-014: The sync action of the card of the sync mark SHALL fetch. It SHALL then bring the working branch up to date when the working copy is clean.
- REQ-029: The impacts of a change SHALL open from the Checks of its feature. They SHALL compare the working copy with a branch, a tag or a revision. The person chooses it. The comparison SHALL include uncommitted work. The default ref SHALL be the base branch.

### Non-Goals

- A change of the checks, the scanners or the impact computation.
- A change of the page names in the other requirements of `code`: Code / Changes and Code / Pull requests are Code / Now, and each requirement keeps its ref.

### Acceptance Criteria

- [ ] Health shows the gates to a role with no code right, with Run off.
- [ ] The card of the sync mark names the reason when a sync cannot update the working branch.
- [ ] The impacts open from the Checks of a feature, and the old address opens them.

### Existing References

- Supersedes or extends: `spec:code#REQ-007`, `spec:code#REQ-014`, `spec:code#REQ-026`, `spec:code#REQ-027`, `spec:code#REQ-029`.
- Related: `spec:shell#REQ-021` (look pass 1 removed the status bar: the card of the sync mark holds the commit action and the sync action).

## MODIFIED Requirements

### Requirement: REQ-026 QA checks

Flow / Health SHALL list the check scripts that the project declares, for every role. The system MUST NOT run a check that the project does not declare. A run SHALL need a confirmation that names the check, and SHALL be off without the right. Each result SHALL show pass or fail, the duration and the output tail.

Screen: SCR-065

#### Scenario: Run a check
- GIVEN a declared check `test`
- WHEN a person confirms the run
- THEN the result shows its state, duration and output tail

#### Scenario: A role with no right on code
- GIVEN a tester with no right on code
- WHEN the tester opens Flow / Health
- THEN the checks show with their state and Run is off

### Requirement: REQ-027 Security scanners

Flow / Health SHALL run the security scanners and show their results. The scans cover vulnerable dependencies, leaked secrets, flaws in the code and risks in agent skills. Each finding SHALL show a severity and a path. Shipyard downloads each program into the app data folder after one click that names it.

Screen: SCR-065

#### Scenario: Leaked secret
- GIVEN a working copy with a secret in a file
- WHEN a person runs the secret scan
- THEN one finding shows with its severity and its path and without the secret value

### Requirement: REQ-029 Impacts compare

The impacts of a change SHALL open from the Checks of its feature. They SHALL compare the working copy with a branch, a tag or a revision. The person chooses it. The comparison SHALL include uncommitted work. The default ref SHALL be the base branch.

Screen: SCR-066

#### Scenario: Compare with a tag
- GIVEN a tag `v1.0` and two uncommitted files
- WHEN a person chooses the tag
- THEN the changed files include the two uncommitted files

### Requirement: REQ-007 Commit action

The card of the sync mark SHALL hold the commit action of the shell (`spec:shell#REQ-021`), and Code / Now SHALL keep its commit box. The action SHALL take two fields: the summary and the description. The action SHALL commit the staged files only. The action SHALL stay off when no file is staged or when a conflict remains.

#### Scenario: Commit staged files
- GIVEN two staged files and one unstaged file
- WHEN a person commits with a valid summary
- THEN one commit holds the two staged files and the unstaged file stays unstaged

#### Scenario: Nothing staged
- GIVEN no staged file
- WHEN a person looks at the commit action
- THEN the action is off

### Requirement: REQ-014 Publish and sync

The system SHALL publish the working branch with a person's click and MUST NOT use a force push. The sync action of the card of the sync mark SHALL fetch. It SHALL then bring the working branch up to date when the working copy is clean. One tick, then fetch and fast-forward the working branch when the working copy is clean. Publish stays a separate click in Code / Branches.

#### Scenario: Dirty sync
- GIVEN a working copy with uncommitted changes and a newer remote head
- WHEN a person runs the sync action
- THEN the fetch runs, the working copy stays as it is and the card of the sync mark names the reason

#### Scenario: Rebase conflict
- GIVEN a clean working copy with a local commit that conflicts with a newer remote commit
- WHEN a person runs the sync action
- THEN the working branch stays as it was and the card of the sync mark names the conflicted files

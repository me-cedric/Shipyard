# Spec: code

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-code`

### Goal

Code is one space for the working copy, the history, the branches, the pull requests and the quality reports. It has one commit action and one place for each git action. Each commit and pull request links to its work item and its run.

### Why

The earlier tool has these features, but commit sits in 11 pages and pull sits in three places. A developer or a QA tester then loses time on where to act. Shipyard keeps the code next to the tickets and runs that caused it. The reader can follow a change from `wi:` to `run:` to `pr:` to `commit:`.

### Users And Scenarios

- Developer: stages, commits, switches branch, resolves a conflict and merges a pull request.
- QA: reads the pull request checks and runs the QA checks and the security scanners.
- PM: reads the impacts digest and sees which pull requests wait.
- Architect: reads the impacts action plan and the files of a pull request before approval.
- BA: follows a requirement to its commit and its pull request.
- Functional lead: reads the impacts digest in plain language.
- Junior: sees one commit action, one sync action and a branch name that tells the purpose.

### Requirements

- REQ-001: Code / Changes SHALL show the working copy as a folder tree of the changed files.
- REQ-002: Selecting a file SHALL show its staged diff and its unstaged diff as two separate diffs.
- REQ-003: The system SHALL stage and unstage a file, a folder or a selection of files.
- REQ-004: The system SHALL discard changes only after a confirmation.
- REQ-005: When a merge or a stash stops on a conflict, the Conflicts group SHALL list each conflicted file.
- REQ-006: The system SHALL save the working copy as a stash, untracked files included.
- REQ-007: The status bar of the shell SHALL hold the one commit action (`add-shell` REQ-007).
- REQ-008: The summary SHALL follow `<type>(<scope>): <subject>`.
- REQ-009: The system SHALL expose each commit as a `commit:<sha>` entity.
- REQ-010: Code / History SHALL list the commits of the working branch with branch and tag labels.
- REQ-011: The Code header SHALL show the working branch in one selector.
- REQ-012: The system SHALL create a branch from the current head and SHALL switch to it.
- REQ-013: The system SHALL delete a branch after two clicks. The second click SHALL be a confirmation that names the branch.
- REQ-014: The system SHALL publish the working branch with a person's click and MUST NOT use a force push.
- REQ-015: In the background, the system SHALL fetch the remote heads of each project that has a remote.
- REQ-016: The remote watch MUST move only the remote tracking references.
- REQ-017: The system SHALL notify only when the remote heads change between two fetches.
- REQ-018: Code / Pull requests SHALL list the mirror pull requests of every forge in one layout.
- REQ-019: Selecting a pull request SHALL open its description, files with their diff, commits, CI checks, conversation and verdicts.
- REQ-020: The system SHALL open a pull request from the working branch.
- REQ-021: The system SHALL post a comment, approve, and request changes as a person's click.
- REQ-022: The system SHALL merge a pull request with a method that the forge offers: merge, squash or rebase.
- REQ-023: A draft pull request SHALL show a Mark ready action in Code / Pull requests.
- REQ-024: A pull request SHALL show its linked `wi:` and `run:` refs and its commits as `commit:` refs.
- REQ-025: When a forge write fails, the system SHALL show the forge message.
- REQ-026: Code / Quality SHALL list the check scripts that the project declares.
- REQ-027: Code / Quality SHALL run the security scanners and show their results.
- REQ-028: The system SHALL keep the last report of each check and scanner as a repository text file.
- REQ-029: Code / Impacts SHALL compare the working copy with a branch, a tag or a revision.
- REQ-030: The Analyze action SHALL write a developer action plan for the comparison.
- REQ-031: Analyze SHALL also write a digest for the PM in plain language.
- REQ-032: The system SHALL give the digest of a run's diff to `add-delivery`.
- REQ-033: The system SHALL keep each action plan and each digest as a dated text file in the repository.
- REQ-034: Code / Terminal SHALL be a panel that opens from every view with a keyboard shortcut.
- REQ-035: The terminal MUST NOT put a secret of a connection in the environment of the shell.
- REQ-036: The system SHALL open a working copy file in a read-only viewer.
- REQ-037: Each Code view SHALL follow the interface rules of the constitution.

### Non-Goals

- A second commit control or a second sync control. `add-shell` owns the status bar and this change owns the operations.
- A pull request opened by a run, its branch name, its labels and its summary. `add-delivery` owns them.
- The mirror of pull requests and the polling of the forge. `add-sync` owns them.
- Forge adapters and git credentials. `add-connections` owns them.
- A force push, a plain force or a history rewrite by a person's click in this version.
- A file editor, a rename, a delete and a new file in the file viewer. The viewer reads only.
- A terminal that starts an external terminal program. Only the panel exists.
- A conflict resolver that uses an agent. A person resolves each conflict.
- Writing the change request document and the work-done sheet that the earlier tool exported from Impacts. The digest goes into the pull request (`add-delivery` REQ-027), and `add-knowledge` REQ-013 to REQ-016 export client documents.

### Acceptance Criteria

- [x] Code / Changes shows the tree and the two diffs. It stages, unstages, discards after a confirmation, resolves conflicts and stashes. Test: `src/features/code/changes.test.tsx`, `crates/shipyard-git/tests/code.rs`.
- [x] The commit action commits staged files only. It refuses a summary with a wrong type. Test: `src/features/code/changes.test.tsx`, `crates/shipyard-git/tests/code.rs`.
- [x] A commit on `feat/auth/SHIP-42-login` links to `wi:SHIP-42`. A commit of a run links to its `run:`. Test: `crates/shipyard-store/tests/code.rs`, `crates/shipyard-app/src/code.rs`.
- [x] A branch named `patch-3` is refused, and the working branch cannot be deleted. Test: `src/features/code/branches.test.tsx`, `crates/shipyard-core/tests/code.rs`.
- [x] The remote watch notifies once per push by someone else. It never changes a working copy file. Test: `crates/shipyard-app/src/commands/code.rs`.
- [x] Code / Pull requests lists the mirror offline. A person can open, comment, approve, request changes, merge and mark ready. Test: `src/features/code/pull-requests.test.tsx`, `crates/shipyard-forges/tests/code.rs`.
- [x] A draft pull request from a run shows Mark ready. Merge stays off until it is ready. Test: `src/features/code/pull-requests.test.tsx`.
- [x] Code / Quality runs only declared checks after a confirmation, and a report holds no secret value. Test: `src/features/code/quality.test.tsx`, `crates/shipyard-app/src/code.rs`, `crates/shipyard-store/tests/code.rs`.
- [x] Code / Impacts writes an action plan and a digest in two files. The digest holds no path. Test: `crates/shipyard-app/src/code.rs`, `crates/shipyard-core/tests/code.rs`.
- [x] The terminal panel opens at the project root and shows no connection secret. Test: `src/features/code/terminal.test.tsx`, `crates/shipyard-app/src/terminal.rs`.
- [x] The file viewer opens a cited file at its line and never changes it. Test: `src/features/code/viewer.test.tsx`, `crates/shipyard-app/src/commands/code.rs`.
- [ ] Every Code view works with the keyboard, shows a focus ring and has French and English text.

### Links

- Consumes: `add-connections` (Forge adapter, git credentials; REQ-005, REQ-011).
- Consumes: `add-delivery` (draft rule, digest section, `pr:` entity; REQ-009, REQ-013, REQ-027, REQ-028).
- Consumes: `add-refs` (links to `wi:` and `run:`; REQ-005, REQ-007).
- Consumes: `add-sync` (the `pr:` mirror and the sync action; REQ-005, REQ-013).
- Consumes: `add-factory` (run branches and lanes; REQ-038) and `add-assistant` (the runner for Analyze; REQ-012).
- Produces: `commit:` entities and the commit operation for `add-shell` (REQ-007).
- Produces: branch and commit operations, and the impacts digest, for `add-delivery` (REQ-027).
- Produces: quality and impact reports for `add-knowledge` (dashboards) and `add-specs`.
- Related: `add-shell` REQ-008 (the watch notice), `add-design` REQ-023 (safe save), `add-projects` REQ-007 (the project file).

### Feature list

| Feature | Shipyard view | REQ ids |
| --- | --- | --- |
| Git: changes, diffs, stage, unstage, discard | Code / Changes | REQ-001, REQ-002, REQ-003, REQ-004 |
| Git: conflict resolver | Code / Changes, group Conflicts | REQ-005 |
| Git: stash | Code / Changes | REQ-006 |
| Git: commit in two fields | Status bar commit action | REQ-007, REQ-008, REQ-009 |
| Git: history | Code / History | REQ-010 |
| Git: branches; La branche de travail | Code header selector; Code / Branches | REQ-011, REQ-012, REQ-013, REQ-014 |
| Surveillance des dépôts distants | Remote watch and notifications | REQ-015, REQ-016, REQ-017 |
| Pull requests (GitHub, GitLab) | Code / Pull requests | REQ-018 to REQ-025 |
| QA | Code / Quality | REQ-026, REQ-028 |
| Security scanners | Code / Quality | REQ-027, REQ-028 |
| Impacts (diff, dev plan, PO digest) | Code / Impacts | REQ-029 to REQ-033 |
| Embedded terminal | Terminal panel | REQ-034, REQ-035 |
| Les fichiers | File viewer | REQ-036 |

### Existing References

- `docs/plan/MASTER-PLAN.md` sections 4, 5.7 and 7.1.
- `docs/openspec/constitution.md` sections 1, 3, 4 and 6.
- `docs/delivery/questions/Q-041.md`
- `docs/delivery/questions/Q-042.md`
- `docs/delivery/questions/Q-043.md`

## ADDED Requirements

### Requirement: REQ-001 Changes tree

Code / Changes SHALL show the working copy as a folder tree of the changed files. Each file SHALL show a status mark that uses shape and colour together. The groups Staged, Unstaged and Conflicts SHALL show a count.

#### Scenario: Open Changes
- GIVEN a working copy with three changed files in two folders
- WHEN a person opens Code / Changes
- THEN the tree shows the two folders and the three files with their marks and the group counts

### Requirement: REQ-002 Two diffs

Selecting a file SHALL show its staged diff and its unstaged diff as two separate diffs. A file with only one kind of change SHALL show only that diff.

#### Scenario: File with both
- GIVEN a file with a staged change and a later unstaged change
- WHEN a person selects the file
- THEN two diffs show, one for each kind of change

### Requirement: REQ-003 Stage and unstage

The system SHALL stage and unstage a file, a folder or a selection of files. Stage SHALL be the one primary action of Code / Changes.

#### Scenario: Stage a folder
- GIVEN a folder with four unstaged files
- WHEN a person stages the folder
- THEN the four files move to Staged

### Requirement: REQ-004 Discard

The system SHALL discard changes only after a confirmation. The confirmation SHALL name the paths and their count. The scope MAY be a file, a folder or a selection. A discard of an untracked file SHALL delete the file.

#### Scenario: Cancel a discard
- GIVEN two changed files
- WHEN a person asks to discard them and cancels the confirmation
- THEN both files keep their changes

#### Scenario: Confirm a discard
- GIVEN two changed files
- WHEN a person confirms the discard that names both paths
- THEN both files return to the committed content

### Requirement: REQ-005 Conflicts

When a merge or a stash stops on a conflict, the Conflicts group SHALL list each conflicted file. For each block of a file the person SHALL choose ours, theirs, both or none. The person SHALL also be able to take a whole side, or mark the file resolved after a hand edit in another tool. The system MUST refuse to mark a file resolved while it holds a conflict marker.

#### Scenario: Resolve a block
- GIVEN a conflicted file with two blocks
- WHEN a person chooses theirs for one block and ours for the other
- THEN the file holds the two chosen texts and no marker

#### Scenario: Marker left
- GIVEN a conflicted file that still holds a marker
- WHEN a person marks it resolved
- THEN the system refuses and names the file

### Requirement: REQ-006 Stash

The system SHALL save the working copy as a stash, untracked files included. The name is optional. The system SHALL list the stashes and SHALL apply or drop one. An apply leaves the stash in the list, and a drop removes it. A drop SHALL need a confirmation that names the stash.

#### Scenario: Apply and drop a stash
- GIVEN a stash that holds two files
- WHEN a person applies it on a clean working copy and then drops it
- THEN the two files return as unstaged changes and the stash leaves the list

### Requirement: REQ-007 Commit action

The status bar of the shell SHALL hold the one commit action (`add-shell` REQ-007). It SHALL open a form with two fields: the summary and the description. The action SHALL commit the staged files only. The action SHALL stay off when no file is staged or when a conflict remains.

#### Scenario: Commit staged files
- GIVEN two staged files and one unstaged file
- WHEN a person commits with a valid summary
- THEN one commit holds the two staged files and the unstaged file stays unstaged

#### Scenario: Nothing staged
- GIVEN no staged file
- WHEN a person looks at the commit action
- THEN the action is off

### Requirement: REQ-008 Commit message

The summary SHALL follow `<type>(<scope>): <subject>`. The type SHALL be one of feat, fix, chore, docs, refactor and test. The scope MAY be empty. The form SHALL refuse an empty subject. A counter SHALL advise 50 characters and MUST NOT block a longer summary. The system MUST NOT add an AI attribution line.

#### Scenario: Bad type
- GIVEN a summary that starts with `wip:`
- WHEN a person commits
- THEN the form refuses the summary and names the allowed types

#### Scenario: Long summary
- GIVEN a valid summary of 70 characters
- WHEN a person commits
- THEN the counter shows the advice and the commit succeeds

### Requirement: REQ-009 Commit entity and links

The system SHALL expose each commit as a `commit:<sha>` entity. The commit SHALL link to `wi:` when its message or branch name holds the key of a mirrored work item. It SHALL link to `run:` when a run made it. Its backlinks SHALL show in the inspector.

#### Scenario: Link to a work item
- GIVEN a branch named `feat/auth/SHIP-42-login`
- WHEN a person commits on it
- THEN the commit links to `wi:SHIP-42`

### Requirement: REQ-010 History

Code / History SHALL list the commits of the working branch with branch and tag labels. A person SHALL open a commit to see its info and its changed files, one diff at a time. The view SHALL load older commits when the person scrolls and SHALL say when the log is cut.

#### Scenario: Open a commit
- GIVEN a log of 30 commits
- WHEN a person opens a commit
- THEN the changed files and the diff of the first file show beside the info

### Requirement: REQ-011 Working branch selector

The Code header SHALL show the working branch in one selector. One value SHALL drive each git action of the project. These are the fetch, the sync, the publish and the remote watch. A switch SHALL refuse to overwrite an uncommitted change.

#### Scenario: Switch with changes
- GIVEN an uncommitted change that the target branch would overwrite
- WHEN a person switches branch
- THEN the system refuses and names the file

### Requirement: REQ-012 Create and switch

The system SHALL create a branch from the current head and SHALL switch to it. The name SHALL be `<type>/<area>/<kebab>`. The type SHALL come from the commit types. The area and the subject SHALL use lower case with hyphens. Switching to a remote branch SHALL first create a local branch that tracks it.

#### Scenario: Create
- GIVEN the working branch `main`
- WHEN a person creates a branch of type fix with the area `auth` and the subject `login-timeout`
- THEN the branch `fix/auth/login-timeout` exists and is the working branch

#### Scenario: Bad name
- GIVEN a name `patch-3`
- WHEN a person creates the branch
- THEN the form refuses the name and shows the type list

### Requirement: REQ-013 Delete a branch

The system SHALL delete a branch after two clicks. The second click SHALL be a confirmation that names the branch. The system MUST refuse to delete the working branch. The system SHALL delete a forge-only branch on the forge after the same confirmation. This version deletes local branches only: the forge call comes with the forge adapter writes.

#### Scenario: Working branch
- GIVEN the working branch
- WHEN a person asks to delete it
- THEN the system refuses

### Requirement: REQ-014 Publish and sync

The system SHALL publish the working branch with a person's click and MUST NOT use a force push. The sync action of the status bar SHALL fetch. It SHALL then bring the working branch up to date when the working copy is clean. [NEEDS CLARIFICATION: Q-041 Does the status-bar sync action also pull git?] Working assumption: Q-041 option 1, one tick, then fetch and update.

#### Scenario: Dirty sync
- GIVEN a working copy with uncommitted changes and a newer remote head
- WHEN a person runs the sync action
- THEN the fetch runs, the working copy stays as it is and the status bar names the reason

#### Scenario: Rebase conflict
- GIVEN a clean working copy with a local commit that conflicts with a newer remote commit
- WHEN a person runs the sync action
- THEN the working branch stays as it was and the status bar names the conflicted files

### Requirement: REQ-015 Remote watch

In the background, the system SHALL fetch the remote heads of each project that has a remote. It SHALL watch the working branch and each branch that the project lists. Each project SHALL set its own interval. The default SHALL be 15 minutes. [NEEDS CLARIFICATION: Q-042 Where does the watch interval live?] The interval is a per-machine value for each project (Q-042 option 1). The commands set it. No view sets it yet (Q-085).

#### Scenario: Default interval
- GIVEN a project with no interval set
- WHEN the app runs for 16 minutes
- THEN the system fetched the remote heads once

### Requirement: REQ-016 Watch writes no file

The remote watch MUST move only the remote tracking references. It MUST NOT change the working copy, the index or a local branch.

#### Scenario: Colleague pushed
- GIVEN a clean working copy and a new remote commit
- WHEN the watch runs
- THEN the files of the working copy are unchanged

### Requirement: REQ-017 Watch notification

The system SHALL notify only when the remote heads change between two fetches. The notice SHALL name the commit count, the branch, the author and the last subject. It SHALL carry the Sync action. Being behind with no new push SHALL NOT notify. The notice SHALL leave the list when the project is quiet again: this version removes it when the sync action brings the working branch up to date.

#### Scenario: Push by someone else
- GIVEN a remote head that moved by two commits
- WHEN the watch runs
- THEN one notification names two commits, the branch, the author and the last subject

#### Scenario: No new push
- GIVEN a branch that stays behind with no new push
- WHEN the watch runs again
- THEN no new notification shows

### Requirement: REQ-018 Pull request list

Code / Pull requests SHALL list the mirror pull requests of every forge in one layout. Each row SHALL show the `pr:` ref, title, author, draft state, CI state and review state. The list SHALL filter by state, author and label. The list MUST NOT call the forge for a read.

#### Scenario: Offline
- GIVEN the network is off
- WHEN a person opens Code / Pull requests
- THEN the list shows the mirror

### Requirement: REQ-019 Pull request detail

Selecting a pull request SHALL open its description, files with their diff, commits, CI checks, conversation and verdicts. Each CI check SHALL show its name and state.

#### Scenario: Open a pull request
- GIVEN a pull request with two failed checks
- WHEN a person opens it
- THEN the CI tab names the two failed checks

### Requirement: REQ-020 Open a pull request

The system SHALL open a pull request from the working branch. The person SHALL give a title, a description and a base. The base SHALL follow `add-delivery` REQ-009 by default. The form SHALL offer a draft option and SHALL use only labels that exist on the forge. Open pull request SHALL be the one primary action of the view.

#### Scenario: Open
- GIVEN a published working branch
- WHEN a person opens a pull request with a title
- THEN the forge holds the pull request and the list shows it

### Requirement: REQ-021 Comment and verdicts

The system SHALL post a comment, approve, and request changes as a person's click. A request for changes SHALL need a comment text. The system SHALL show the verdict of each reviewer.

#### Scenario: Request changes
- GIVEN an open pull request
- WHEN a person requests changes with no text
- THEN the system refuses and asks for the text

### Requirement: REQ-022 Merge

The system SHALL merge a pull request with a method that the forge offers: merge, squash or rebase. Merge SHALL need a confirmation that names the method. Merge SHALL stay off while the pull request is a draft. The view SHALL show the CI state and the review state beside Merge.

#### Scenario: Draft
- GIVEN a draft pull request
- WHEN a person looks at Merge
- THEN Merge is off

### Requirement: REQ-023 Mark ready

A draft pull request SHALL show a Mark ready action in Code / Pull requests. It SHALL change the draft to ready with one click of a person (`add-delivery` REQ-013). The change SHALL reach the lanes of `add-factory` at the next tick.

#### Scenario: Mark a run draft ready
- GIVEN a draft pull request that a run opened
- WHEN a person marks it ready
- THEN the forge shows it as ready and Merge becomes available

### Requirement: REQ-024 Pull request links

A pull request SHALL show its linked `wi:` and `run:` refs and its commits as `commit:` refs. The inspector SHALL show the backlinks of the pull request. The pull request itself belongs to `add-delivery` (REQ-028).

#### Scenario: Run pull request
- GIVEN a pull request that a run opened for `wi:SHIP-42`
- WHEN a person opens it
- THEN the `wi:SHIP-42` chip and the `run:` chip show

### Requirement: REQ-025 Forge write failure

When a forge write fails, the system SHALL show the forge message. The view SHALL keep its state. The system MUST NOT retry a write without a click. A project with no forge connection SHALL show one Connect action in place of the list.

#### Scenario: Refused write
- GIVEN a forge that refuses a merge
- WHEN a person merges
- THEN the refusal text shows and the pull request keeps its state

### Requirement: REQ-026 QA checks

Code / Quality SHALL list the check scripts that the project declares. The system MUST NOT run a check that the project does not declare. A run SHALL need a confirmation that names the check. Each result SHALL show pass or fail, the duration and the output tail.

#### Scenario: Run a check
- GIVEN a declared check `test`
- WHEN a person confirms the run
- THEN the result shows its state, duration and output tail

### Requirement: REQ-027 Security scanners

Code / Quality SHALL run the security scanners and show their results. The scans cover vulnerable dependencies, leaked secrets, flaws in the code and risks in agent skills. Each finding SHALL show a severity and a path. [NEEDS CLARIFICATION: Q-043 Which scanners ship and who installs them?]

#### Scenario: Leaked secret
- GIVEN a working copy with a secret in a file
- WHEN a person runs the secret scan
- THEN one finding shows with its severity and its path and without the secret value

### Requirement: REQ-028 Quality reports kept

The system SHALL keep the last report of each check and scanner as a repository text file. A teammate who clones the repository SHALL see the last results with no scan. A report MUST NOT hold a secret value.

#### Scenario: Fresh clone
- GIVEN a repository that holds a security report
- WHEN a teammate opens Code / Quality
- THEN the last results show with their date

### Requirement: REQ-029 Impacts compare

Code / Impacts SHALL compare the working copy with a branch, a tag or a revision. The person chooses it. The comparison SHALL include uncommitted work. The default ref SHALL be the base branch.

#### Scenario: Compare with a tag
- GIVEN a tag `v1.0` and two uncommitted files
- WHEN a person chooses the tag
- THEN the changed files include the two uncommitted files

### Requirement: REQ-030 Developer action plan

The Analyze action SHALL write a developer action plan for the comparison. The plan SHALL rate the impact on behaviour, contracts, data, configuration, security, operations and artifacts. It SHALL name the entities (refs) that the change makes stale. It SHALL give an ordered list of actions. Analyze SHALL be the one primary action of the view.

#### Scenario: Analyze
- GIVEN a comparison with a changed contract
- WHEN a person runs Analyze
- THEN the plan rates the contracts axis and lists the actions in order

### Requirement: REQ-031 PM digest

Analyze SHALL also write a digest for the PM in plain language. The digest SHALL state the business impact, the change of scope and planning, the risks, and who must act. The digest MUST NOT hold a secret, a file path or a technical trace. It MUST NOT tie a person's name to a judgment.

#### Scenario: Clean digest
- GIVEN a comparison that touches a file with a secret
- WHEN a person reads the digest
- THEN the digest holds no path, no trace and no secret

### Requirement: REQ-032 Digest for delivery

The system SHALL give the digest of a run's diff to `add-delivery`. Delivery SHALL put it in the pull request body as one section (`add-delivery` REQ-027). The digest SHALL come from the diff of the run against its base.

#### Scenario: Run digest
- GIVEN a run with a finished diff
- WHEN delivery asks for the digest
- THEN the system returns the digest of that diff

### Requirement: REQ-033 Impact reports kept

The system SHALL keep each action plan and each digest as a dated text file in the repository. Code / Impacts SHALL list the past reports. The action plan and the digest SHALL stay in two separate files.

#### Scenario: Past report
- GIVEN two saved analyses
- WHEN a person opens Code / Impacts
- THEN both appear in the list with their dates

### Requirement: REQ-034 Terminal panel

Code / Terminal SHALL be a panel that opens from every view with a keyboard shortcut. It SHALL start the login shell of the person at the root of the working copy. An Open terminal here action on a folder SHALL start it at that folder.

#### Scenario: Open here
- GIVEN a folder in the Changes tree
- WHEN a person chooses Open terminal here
- THEN the panel opens with that folder as the current folder

### Requirement: REQ-035 Terminal secrets

The terminal MUST NOT put a secret of a connection in the environment of the shell. Closing the panel SHALL end its shell.

#### Scenario: Clean environment
- GIVEN a connection with a token in the keychain
- WHEN a person lists the environment in the terminal
- THEN the token does not appear

### Requirement: REQ-036 File viewer

The system SHALL open a working copy file in a read-only viewer. The viewer SHALL show line numbers and syntax colour. The viewer SHALL open from the Changes tree, a commit, a pull request file and a ref. It SHALL open at a given line. A binary file SHALL show its size and no content.

#### Scenario: Open at a line
- GIVEN a finding that cites `src/lib.rs` line 40
- WHEN a person opens the finding
- THEN the viewer shows the file at line 40

### Requirement: REQ-037 Interface rules

Each Code view SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have at most one primary action. It SHALL have a keyboard path, a focus ring, assistive labels, contrast and reduced motion. It SHALL show French and English text.

#### Scenario: Keyboard
- GIVEN any Code view
- WHEN a person uses only the keyboard
- THEN every action is reachable and the focus ring shows

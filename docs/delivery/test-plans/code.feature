Feature: code

  @spec:code#REQ-001
  Scenario: Changes tree: Open Changes
    Given a working copy with three changed files in two folders
    When a person opens Code / Changes
    Then the tree shows the two folders and the three files with their marks and the group counts

  @spec:code#REQ-002
  Scenario: Two diffs: File with both
    Given a file with a staged change and a later unstaged change
    When a person selects the file
    Then two diffs show, one for each kind of change

  @spec:code#REQ-003
  Scenario: Stage and unstage: Stage a folder
    Given a folder with four unstaged files
    When a person stages the folder
    Then the four files move to Staged

  @spec:code#REQ-004
  Scenario: Discard: Cancel a discard
    Given two changed files
    When a person asks to discard them and cancels the confirmation
    Then both files keep their changes

  @spec:code#REQ-004
  Scenario: Discard: Confirm a discard
    Given two changed files
    When a person confirms the discard that names both paths
    Then both files return to the committed content

  @spec:code#REQ-005
  Scenario: Conflicts: Resolve a block
    Given a conflicted file with two blocks
    When a person chooses theirs for one block and ours for the other
    Then the file holds the two chosen texts and no marker

  @spec:code#REQ-005
  Scenario: Conflicts: Marker left
    Given a conflicted file that still holds a marker
    When a person marks it resolved
    Then the system refuses and names the file

  @spec:code#REQ-006
  Scenario: Stash: Apply and drop a stash
    Given a stash that holds two files
    When a person applies it on a clean working copy and then drops it
    Then the two files return as unstaged changes and the stash leaves the list

  @spec:code#REQ-007
  Scenario: Commit action: Commit staged files
    Given two staged files and one unstaged file
    When a person commits with a valid summary
    Then one commit holds the two staged files and the unstaged file stays unstaged

  @spec:code#REQ-007
  Scenario: Commit action: Nothing staged
    Given no staged file
    When a person looks at the commit action
    Then the action is off

  @spec:code#REQ-008
  Scenario: Commit message: Bad type
    Given a summary that starts with `wip:`
    When a person commits
    Then the form refuses the summary and names the allowed types

  @spec:code#REQ-008
  Scenario: Commit message: Long summary
    Given a valid summary of 70 characters
    When a person commits
    Then the counter shows the advice and the commit succeeds

  @spec:code#REQ-009
  Scenario: Commit entity and links: Link to a work item
    Given a branch named `feat/auth/SHIP-42-login`
    When a person commits on it
    Then the commit links to `wi:SHIP-42`

  @spec:code#REQ-010
  Scenario: History: Open a commit
    Given a log of 30 commits
    When a person opens a commit
    Then the changed files and the diff of the first file show beside the info

  @spec:code#REQ-011
  Scenario: Working branch selector: Switch with changes
    Given an uncommitted change that the target branch would overwrite
    When a person switches branch
    Then the system refuses and names the file

  @spec:code#REQ-012
  Scenario: Create and switch: Create
    Given the working branch `main`
    When a person creates a branch of type fix with the area `auth` and the subject `login-timeout`
    Then the branch `fix/auth/login-timeout` exists and is the working branch

  @spec:code#REQ-012
  Scenario: Create and switch: Bad name
    Given a name `patch-3`
    When a person creates the branch
    Then the form refuses the name and shows the type list

  @spec:code#REQ-013
  Scenario: Delete a branch: Working branch
    Given the working branch
    When a person asks to delete it
    Then the system refuses

  @spec:code#REQ-014
  Scenario: Publish and sync: Dirty sync
    Given a working copy with uncommitted changes and a newer remote head
    When a person runs the sync action
    Then the fetch runs, the working copy stays as it is and the status bar names the reason

  @spec:code#REQ-014
  Scenario: Publish and sync: Rebase conflict
    Given a clean working copy with a local commit that conflicts with a newer remote commit
    When a person runs the sync action
    Then the working branch stays as it was and the status bar names the conflicted files

  @spec:code#REQ-015
  Scenario: Remote watch: Default interval
    Given a project with no interval set
    When the app runs for 16 minutes
    Then the system fetched the remote heads once

  @spec:code#REQ-016
  Scenario: Watch writes no file: Colleague pushed
    Given a clean working copy and a new remote commit
    When the watch runs
    Then the files of the working copy are unchanged

  @spec:code#REQ-017
  Scenario: Watch notification: Push by someone else
    Given a remote head that moved by two commits
    When the watch runs
    Then one notification names two commits, the branch, the author and the last subject

  @spec:code#REQ-017
  Scenario: Watch notification: No new push
    Given a branch that stays behind with no new push
    When the watch runs again
    Then no new notification shows

  @spec:code#REQ-018
  Scenario: Pull request list: Offline
    Given the network is off
    When a person opens Code / Pull requests
    Then the list shows the mirror

  @spec:code#REQ-018
  Scenario: Pull request list: No stat strip
    Given pull requests in three states
    When a person opens Code / Pull requests
    Then the list shows no stat strip, and each state group shows its count

  @spec:code#REQ-019
  Scenario: Pull request detail: Open a pull request
    Given a pull request with two failed checks
    When a person opens it
    Then the Checks tab names the two failed checks

  @spec:code#REQ-019
  Scenario: Pull request detail: Files collapsed
    Given a pull request with forty-five files
    When a person opens the Files changed tab
    Then all files show collapsed with their counts, and expanding one shows its diff with line numbers

  @spec:code#REQ-019
  Scenario: Pull request detail: Expand next 30
    Given a pull request with forty-five files
    When a person clicks Expand all
    Then thirty files open and the action offers Expand next 15

  @spec:code#REQ-019
  Scenario: Pull request detail: Viewed marks
    Given a pull request with three files
    When a person marks one file as viewed
    Then the count shows 1 / 3 viewed

  @spec:code#REQ-021
  Scenario: Thread: Reply and resolve
    Given an unresolved thread
    When a person replies and then clicks Resolve
    Then the code host receives the reply and the resolution, and the thread shows the Resolved mark

  @spec:code#REQ-021
  Scenario: Inline comment: Pending review
    Given the Files changed tab
    When a person adds a comment to a line with Add review comment
    Then the comment shows under the line as Pending and the review bar counts one pending comment

  @spec:code#REQ-021
  Scenario: Submit review: Verdict
    Given two pending comments
    When a person clicks Submit review and picks Approve
    Then the code host receives one review with both comments and the pending list is empty

  @spec:code#REQ-021
  Scenario: Submit review: A partial result
    Given three pending comments of which the code host cannot place one
    When a person submits the review
    Then the page clears the two that were sent and keeps the third as pending

  @spec:code#REQ-021
  Scenario: Submit review: Request changes needs text
    Given a pending review
    When a person picks Request changes with no review text
    Then the system refuses and asks for the text

  @spec:code#REQ-020
  Scenario: Open a pull request: Open
    Given a published working branch
    When a person opens a pull request with a title
    Then the code host holds the pull request and the list shows it

  @spec:code#REQ-021
  Scenario: Comment and verdicts: Request changes
    Given an open pull request
    When a person requests changes with no text
    Then the system refuses and asks for the text

  @spec:code#REQ-022
  Scenario: Merge: Draft
    Given a draft pull request
    When a person looks at Merge
    Then Merge is off

  @spec:code#REQ-023
  Scenario: Mark ready: Mark a run draft ready
    Given a draft pull request that a run opened
    When a person marks it ready
    Then the code host shows it as ready and Merge becomes available

  @spec:code#REQ-024
  Scenario: Pull request links: Run pull request
    Given a pull request that a run opened for `wi:SHIP-42`
    When a person opens it
    Then the `wi:SHIP-42` chip and the `run:` chip show

  @spec:code#REQ-025
  Scenario: Code host write failure: Refused write
    Given a code host that refuses a merge
    When a person merges
    Then the refusal text shows and the pull request keeps its state

  @spec:code#REQ-026
  Scenario: QA checks: Run a check
    Given a declared check `test`
    When a person confirms the run
    Then the result shows its state, duration and output tail

  @spec:code#REQ-027
  Scenario: Security scanners: Leaked secret
    Given a working copy with a secret in a file
    When a person runs the secret scan
    Then one finding shows with its severity and its path and without the secret value

  @spec:code#REQ-028
  Scenario: Quality reports kept: Fresh clone
    Given a repository that holds a security report
    When a teammate opens Code / Quality
    Then the last results show with their date

  @spec:code#REQ-029
  Scenario: Impacts compare: Compare with a tag
    Given a tag `v1.0` and two uncommitted files
    When a person chooses the tag
    Then the changed files include the two uncommitted files

  @spec:code#REQ-030
  Scenario: Developer action plan: Analyze
    Given a comparison with a changed contract
    When a person runs Analyze
    Then the plan rates the contracts axis and lists the actions in order

  @spec:code#REQ-031
  Scenario: PM digest: Clean digest
    Given a comparison that touches a file with a secret
    When a person reads the digest
    Then the digest holds no path, no trace and no secret

  @spec:code#REQ-032
  Scenario: Digest for delivery: Run digest
    Given a run with a finished diff
    When delivery asks for the digest
    Then the system returns the digest of that diff

  @spec:code#REQ-033
  Scenario: Impact reports kept: Past report
    Given two saved analyses
    When a person opens Code / Impacts
    Then both appear in the list with their dates

  @spec:code#REQ-034
  Scenario: Terminal panel: Open here
    Given a folder in the Changes tree
    When a person chooses Open terminal here
    Then the panel opens with that folder as the current folder

  @spec:code#REQ-035
  Scenario: Terminal secrets: Clean environment
    Given a connection with a token in the keychain
    When a person lists the environment in the terminal
    Then the token does not appear

  @spec:code#REQ-036
  Scenario: File viewer: Open at a line
    Given a finding that cites `src/lib.rs` line 40
    When a person opens the finding
    Then the viewer shows the file at line 40

  @spec:code#REQ-037
  Scenario: Interface rules: Keyboard
    Given any Code view
    When a person uses only the keyboard
    Then every action is reachable and the focus ring shows

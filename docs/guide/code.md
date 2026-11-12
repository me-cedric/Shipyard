# Code

Code works on the git repository of the project. You do not need to know git commands: each action has a button.

## Local changes

Local changes lists the files that you changed, as a tree.

1. Select a file to see what changed.
2. Stage the files to keep. Or discard a change.
3. Write a short message in the commit control of the status bar, then click Commit. A commit takes the staged files only.

A group with no files shows one muted line, such as "Nothing staged".

A renamed file shows under its new path, with the old one: `old → new`. Staging it or discarding its change acts on both paths.

When two changes meet in the same lines, a conflict view shows both sides. Choose one, or write the result.

## History

History lists the commits, newest first. Select a commit to see its files and its changes. Each author shows a profile picture: from GitHub for a GitHub no-reply address, else from Gravatar, or the initials when there is none. Shipyard sends Gravatar only a hash of the address.

## Branches

Branches lists the branches on this computer and on the server. Create, switch to, merge or delete a branch. The app never deletes the branch that you work on.

The branch selector in the top bar has a filter box. Type to narrow the list, move with the arrow keys and press Enter. A remote branch checks out as a new local branch that follows it. The New branch row makes a branch from the branch that you work on.

## Pull requests

Pull requests lists the pull requests of the code host. The list has a search and two filters. All shows every pull request. Needs review shows the open pull requests that are not drafts, wait for a review and have no request for changes. The rows sit in three groups: Open, Merged and Closed, each with its count. A row shows the number, the title, the draft mark, the state of the checks and the state of the review. A row shows no author: the app does not keep it. Open pull request starts a new one.

Click a row to open the pull request as its own page. Back returns to the list with the same search and filter.

### The page

The header shows the title, the state, the source and target branch and the lines added and removed. The menu next to the state opens the pull request in the browser, copies its ref and closes it. A draft has Mark ready in the header. The four tabs are Overview, Commits, Checks and Files changed, each with its count. The tab stays in the address.

The merge box opens the Overview. It says in one line whether the pull request can merge, and why not. Three segments follow:

- Checks: the passing, failing and pending checks.
- Comments: the unresolved threads of all threads.
- Approvals: the reviewers who approved, with the verdict of each.

The Merge button is a split button. Click Merge, then confirm. The confirmation names the merge method and has Cancel; it stays busy while the merge runs. The arrow opens the menu of methods (Merge, Squash, Rebase) when the code host offers more than one. Merge is off when the pull request is a draft, closed or merged, when you lack the right to merge, or when the code host blocks it. The line of the box says why. Failing checks or requested changes do not turn Merge off: the confirmation then names that risk and the method.

### Overview

The Overview shows the description as Markdown, the actions of an agent review (see below) and the conversation. The narrow column shows the reviewers with their verdicts, the linked tickets and runs, and Cited by: the items that cite the pull request. It shows no label, assignee, project or milestone.

The conversation lists the general comments and the review threads in time order, with the author, the date and the time. When the code host returned only the newest comments, a note says so. A thread shows its file and line and its comments. Click Reply to answer a thread, Resolve to close it and Reopen to open it again. A resolved thread folds to one line. A thread that came back with fewer comments than it has says "Showing the last 50 of N comments".

The write box under the conversation has Write and Preview. Comment posts a general comment. Send back to the agent shows for a pull request that a run opened. Close asks first, then closes the pull request. Submit review opens the dialog described below; while a review waits, the review bar has that button and the write box does not.

### Files changed

Every file starts collapsed, with its path, its status and its lines added and removed. Click a file to read its diff, with line numbers. The tree on the left has a filter. Click a file in the tree to go to it. Expand all opens the first 30 files that match the filter. While more files stay collapsed, the action reads "Expand next 30". Collapse all closes them. Tick the box of a file to mark it as viewed. The count "n / total viewed" stays on this computer, for this pull request and this head commit.

### Comments on lines

The "+" in the gutter of a line adds a comment to that line. It shows on the line that you point at or reach with the arrow keys (the diff is one tab stop), on lines that the pull request added or left as they were, never on removed lines: comments go on the new side of the diff only. The box has two buttons:

- Add review comment adds the comment to your pending review.
- Add single comment posts it at once, as a review of one comment.

Cancel asks before it drops text. A pending comment shows under its line with the mark Pending, and Edit and Delete.

The pending review stays on this computer until you submit or discard it. It survives a restart. The review bar above the tabs counts the pending comments and has Submit review and Discard. When the browser refuses to save, the page says "This comment is not saved on this computer" and keeps the comment until you close the page.

Submit review opens a dialog. Pick one verdict: Comment, Approve or Request changes. Request changes needs some review text. A review takes at most 100 comments: with more, the dialog says how many to remove and Submit review stays off. Click Submit review to post all pending comments as one review. The dialog keeps your text until the review is posted.

A comment that the code host cannot place on a line goes into the text of the review, and a notice says how many. A comment on an older version of the file is marked "On an older version" and goes into the text. When the code host posts only part of the review, the page clears the comments that were sent and keeps the others as pending. A refusal of the whole review shows the refusal text and keeps every comment. Azure DevOps puts every comment in the text of the review, with its file and line.

A comment on a line that the pull request no longer has shows at the foot of its file. A comment on a file that left the pull request shows in the group "Comments on files no longer in this pull request".

Replies, Resolve, the "+", Submit review and Comment need the right to write to the code host. Without it, each control is off and says why.

### Limits

- GitHub and GitLab list up to 3000 files. A longer list shows "Showing the first N files".
- A thread shows its last 50 comments.
- The general comments show the latest ones. GitLab review threads show the first 100.
- The list shows no author.

### Agent review

Agent actions on a pull request:

1. Click Review with an agent on an open pull request. An agent reads the changes at the head commit, in a read-only copy. It follows the review skill and the reviewer role of the project when it has them. The review is a draft: a summary, a verdict and findings that show on their lines of the diff.
2. Edit the summary and the verdict, click Drop on a finding that you do not want, then click Post review. A review posts once.
3. In the form of a new pull request, click Write with an agent. The agent fills the title and the body from the branch changes, the linked ticket and the linked spec change. It follows the pr-flow skill when the project has it. Nothing opens until you click Open.
4. In Settings / Project, choose the agent review of each pull request: Off, Draft or Post. Draft keeps one draft for each new head commit on the pull request page. Post adds a comment review and never approves.

A review shows in Factory / Sessions, where Stop ends it, and counts in the agent limit. A draft that waits shows in Home / Needs you with a link to its pull request. Post review puts each finding on its line on GitHub and GitLab. A line that the diff does not show goes in the text of the review. Azure DevOps puts every finding in the text of the review.

An agent review counts against the budget of the project. The Agents stopped switch, the budget and the limit of runs stop it. A read-only project refuses all three actions.

## Quality

Quality runs the checks of the project and the security scanners, after your click. Each finding shows its file and its line.

The software parts list (SBOM, "software bill of materials") names every library the project uses, with its version. Export it when a client or a security team asks which software the project contains.

Docs freshness is a check of Quality. It lists the docs that did not follow the code of the branch, with the count. The same warning shows in the commit gate, the push gate and the docs chain of Impacts. Each stale doc has "Update with an agent". An agent run starts only after your click, and the pull request that it opens waits for your review. A doc that the agent left unreadable is named and stays out of the pull request. "Acknowledge" keeps a warning as it is, with a reason.

### Run a check or a scanner

A run starts after your click. While it runs, the card shows Running, the time that counts up and the last lines of the output, and Run stays off. The run goes on when you leave the page. Open in terminal, on a check, runs its command in the terminal drawer. The info button of each card says what it looks for, why it matters and what to do when it fails.

The scanners are:

- secrets: keys and tokens in the tracked files. Put `shipyard:allow-secret` on the line of a test fixture, or on the line before it, to skip it.
- dependencies: known vulnerabilities (CVE) in the lock files, with `osv-scanner`. Record a reviewed finding in `.osv-scanner.toml`.
- code: OWASP issues such as injection, XSS and remote code execution, with `semgrep`. Put `// nosemgrep` on the line of a reviewed false positive.
- skills: unsafe instructions in agent skills, with `skillspector`.

## Impacts

Impacts tells which items a change touches, and proposes an action plan.

## Terminal

The Terminal button in the top bar opens a command line in the folder of the project, in the terminal drawer. Terminal is not a tab. The address `/code/terminal` opens the drawer too. When the shell ends, click Restart. A link in the output opens in your browser.

## Sync

The Sync button in the top bar gets the changes of the team and brings your branch up to date, and shows how many commits you are ahead and behind. The arrow joined to it opens Fetch only and Push. Sending your commits to the server is a separate action. The app never forces a push.

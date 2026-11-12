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

History lists the commits, newest first. Select a commit to see its files and its changes.

## Branches

Branches lists the branches on this computer and on the server. Create, switch to, merge or delete a branch. The app never deletes the branch that you work on.

The branch selector in the top bar has a filter box. Type to narrow the list, move with the arrow keys and press Enter. A remote branch checks out as a new local branch that follows it. The New branch row makes a branch from the branch that you work on.

## Pull requests

Pull requests lists the pull requests of the code host. Open one to read it, comment, approve, ask for changes or merge it. Merge stays off for a draft. The app asks again before a merge with failing checks.

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

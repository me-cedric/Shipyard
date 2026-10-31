# Code

Code works on the git repository of the project. You do not need to know git commands: each action has a button.

## Local changes

Local changes lists the files that you changed, as a tree.

1. Select a file to see what changed.
2. Stage the files to keep. Or discard a change.
3. Write a short message in the commit control of the status bar, then click Commit. A commit takes the staged files only.

When two changes meet in the same lines, a conflict view shows both sides. Choose one, or write the result.

## History

History lists the commits, newest first. Select a commit to see its files and its changes.

## Branches

Branches lists the branches on this computer and on the server. Create, switch to, merge or delete a branch. The app never deletes the branch that you work on.

## Pull requests

Pull requests lists the pull requests of the code host. Open one to read it, comment, approve, ask for changes or merge it. Merge stays off for a draft. The app asks again before a merge with failing checks.

Agent actions on a pull request:

1. Click Review with an agent on an open pull request. An agent reads the changes at the head commit, in a read-only copy. It follows the review skill and the reviewer role of the project when it has them. The review is a draft: a summary, a verdict and findings that show on their lines of the diff.
2. Edit the summary and the verdict, click Drop on a finding that you do not want, then click Post review. A review posts once.
3. In the form of a new pull request, click Write with an agent. The agent fills the title and the body from the branch changes, the linked ticket and the linked spec change. It follows the pr-flow skill when the project has it. Nothing opens until you click Open.
4. In Settings / Project, choose the agent review of each pull request: Off, Draft or Post. Draft keeps one draft for each new head commit on the pull request page. Post adds a comment review and never approves.

An agent review counts against the budget of the project. The Agents stopped switch, the budget and the limit of runs stop it. A read-only project refuses all three actions.

## Quality

Quality runs the checks of the project and the security scanners, after your click. Each finding shows its file and its line.

## Impacts

Impacts tells which items a change touches, and proposes an action plan.

## Terminal

Terminal opens a command line in the folder of the project.

## Sync

The sync action in the status bar gets the changes of the team and brings your branch up to date. Sending your commits to the server is a separate click. The app never forces a push.

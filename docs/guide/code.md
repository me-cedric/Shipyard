# Code

Code works on the git repository of the project. You do not need to know git commands: each action has a button. The switch has four sections: Now, History, Branches and Terminal.

## Now

Now shows the files to commit, then the pull requests.

The files that you changed show as a tree.

1. Select a file to see what changed.
2. Stage the files to keep. Or discard a change.
3. In the commit box under the files, write a summary, add a description if you want one, then click Commit. A commit takes the staged files only. The commit control of the status bar does the same from any page.

- Write it for me asks the assistant for a message from the staged files. Nothing is sent until you send it.
- A group with no files shows one muted line, such as "Nothing staged".
- A renamed file shows under its new path, with the old one: `old → new`. Staging it or discarding its change acts on both paths.
- When two changes meet in the same lines, a conflict view shows both sides. Choose one, write the result, or hand it to an agent.

The pull requests of the code host come next. The list has a search and two filters. All shows every pull request. Needs review shows the open pull requests that are not drafts, wait for a review and have no request for changes. The open pull requests show first. The button Merged and closed shows the other two groups, each with its count. A row shows the number, the title, the draft mark, the state of the checks and the state of the review. Open pull request starts a new one: Write with an agent fills the title and the body from the branch changes, the linked ticket and the linked spec change, and nothing opens until you click Open.

Click a row to open the pull request on the page of its feature, section Changes (see the page Flow, The feature page). A pull request that is ready shows Merge: it opens that page, where you confirm the merge.

Two doors at the bottom open Product health (Flow / Health) and the files of the project.

## History

History lists the commits, newest first. Select a commit to see its files and its changes. Each author shows a profile picture: from GitHub for a GitHub no-reply address, else from Gravatar, or the initials when there is none. Shipyard sends Gravatar only a hash of the address.

## Branches

Branches lists the branches on this computer and on the server. Create, switch to, merge or delete a branch. The app never deletes the branch that you work on.

The branch selector in the top bar has a filter box. Type to narrow the list, move with the arrow keys and press Enter. A remote branch checks out as a new local branch that follows it. The New branch row makes a branch from the branch that you work on.

## Terminal

Terminal is a command line in the folder of the project. The Terminal button in the top bar opens the same command line in the terminal drawer, from any page. When the shell ends, click Restart. A link in the output opens in your browser.

## Sync

One mark beside the branch, in the top bar of each page, shows the state of the repository: Sync failed, the count of changed files, Not shared yet, behind, ahead or In sync. Click it to open Code / Now.

Sync gets the changes of the team and brings your branch up to date. The arrow joined to it opens Fetch only and Push. Sending your commits to the server is a separate action. The app never forces a push.

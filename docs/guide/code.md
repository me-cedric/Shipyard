# Code

Code works on the git repository of the project. You do not need to know git commands: each action has a button. The switch has four sections: Now, History, Branches and Terminal.

## Now

Now is a short summary: the files to commit and the open pull requests, a row to the health of the product, and the actions Working branch, Terminal, Files and Open pull request.

The card of the files to commit shows the first three files with the lines added and removed, a link to the other files, one commit message, Write it for me and Commit. The link opens the page of the local changes.

1. Tick the files to keep in one flat list. Choose all and Choose none tick the whole list. Or discard a change.
2. Write the commit message, add a description if you want one, then click Commit. A commit takes the ticked files only. The Commit button in the card of the sync mark does the same from any page. A commit message in plain words is accepted: pick the Kind in a list and Shipyard adds the prefix.

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

The branch selector, in the card of the sync mark and on Code / Now, has a filter box. Type to narrow the list, move with the arrow keys and press Enter. A remote branch checks out as a new local branch that follows it. The New branch row makes a branch from the branch that you work on. A branch name in plain words becomes a valid name.

## Terminal

Terminal is a command line in the folder of the project. The Terminal button of Code / Now and the Terminal action of the bar Ask or tell Shipyard open the same command line in the terminal drawer, from any page. When the shell ends, click Restart. A link in the output opens in your browser.

## Sync

One mark at the right end of the top row of each page shows the state of the repository: Sync failed, the count of changed files, Not shared yet, behind, ahead or In sync. Click it to open a card with the changed files, the working branch and the buttons Sync, Fetch only, Push and Commit. A link in the card opens Code / Now.

Sync gets the changes of the team and brings your branch up to date. The arrow joined to it opens Fetch only and Push. Sending your commits to the server is a separate action. The app never forces a push.

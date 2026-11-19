# Flow

Flow shows each feature once, from the idea to the merge. A feature joins a ticket of the issue tracker, a spec change, the work of an agent and a pull request. The app keeps a copy of the tickets, so Flow also opens without a network.

The switch has four sections: Flow, List, Done and Health. Flow is the board. It has five stages:

| Stage | What is there |
|---|---|
| Idea | A ticket with no work yet, or a spec change with only its proposal. |
| Spec | A spec change in progress, or a run that waits, plans or has its plan in review. |
| Build | An agent works or reviews its own work. A run that failed or was cancelled stays here, marked as stopped. |
| Review | The pull request is open, or changes are requested. |
| Ready | The pull request is merged, or the run is done. |

A card shows the title, who works on the feature and its state. A card that needs you has the attention colour. Click a card to open the page of the feature. The menu of a card has Stop, the history and Move to a status of the issue tracker. When the issue tracker refuses the move, the card shows the reason.

The bar above the board has:

- Search: find a feature by its ticket key or its title.
- A filter: All, Needs me or Mine. The search and the filter stay in the address.
- The agents switch. Off stops every agent and stops new runs. Turn it on again to go on.
- Start run: pick a ticket by its title.
- New: start a new feature.

## New feature

New opens one page with one question: What do you want to build?

1. Type the title.
2. Pick the kind: Feature, Bug or Idea for later. An idea makes the spec change only.
3. Pick the way: An agent writes the spec, I write the spec, or Build now, no spec.
4. Click Create.

Or start from a ticket: find a ticket that has no run, then click Start an agent.

Each way first makes a spec change with your text as its title. A way is off when you lack the right that it needs.

## List

List shows the same features as one table: the title, the stage, who and the state. It also holds the controls of the tickets:

- Filter by status, person, label and run.
- Bring a ticket by its key.
- Import: the app shows the count first. It writes nothing before you confirm.
- Assign: pick a person. The app proposes a person by skills and free time. The choice is yours.
- Mark for the agent: one click gives the ticket to the agents.
- New change starts a spec change. Give it a plain title: the app makes the id from the title. From a ticket makes the change with the ticket title, puts the ticket text in the proposal and moves you to the branch `specs/<id>`, so the change stays apart from the code.

## Done

Done holds the features that are ready, and the history of the runs: each run that ended and each older run of a ticket, newest end first. Click a row to open its feature. The latest failed run of a ticket also stays on the board, with Try again.

## The feature page

Each feature has one page, `/flow/feature/<id>`. The id is the ref of one of its parts: the ticket, the spec change, the run or the pull request. The page shows the title, the stage line and a switch of six sections. Back returns to Flow with its search and its filter, and Escape does the same. A link to a run or to a pull request opens this page on the section of that part.

### Story

Story shows first what waits for you: the questions, the approvals, the plan with its actions, and the reason that an agent stopped with its one action. Then it lists the events as plain sentences. One control opens the full log, where Important shows the questions, the errors, the state changes and the results, and All shows every event. Requests and sessions shows the requests with their cost, the graph of the recipe and the sessions. Follow shows a live session. Open in terminal resumes an ended session.

The side column shows the agent (the AI tool, the model, the step as n of m, the cost and the budget, the elapsed time, with Talk and Stop), the brief, the changes and the people. A feature with no agent has Start an agent.

### Brief

Brief shows the plan in review, the facts of the ticket and the spec change of the feature. A form shows each part of the change with its state: missing, draft or done. A raw text view is also there. Click Validate: each problem shows on its part, with its line. Follow the next step that the app shows, for example split the work into tickets. A change takes its title from the first heading of its proposal. The id stays the folder name. A feature with no spec has Write the spec.

### Design

Design lists the decisions, diagrams, screens, API contracts and data models that cite a part of the feature.

### Changes

Changes shows the diff of the run and the pull request.

The header of the pull request shows the title, the state, the source and target branch and the lines added and removed. The menu next to the state opens the pull request in the browser, copies its ref and closes it. A draft has Mark ready.

The merge box says in one line whether the pull request can merge, and why not. Three segments follow: Checks (passing, failing and pending), Comments (the unresolved threads of all threads) and Approvals (the reviewers who approved, with the verdict of each). The Merge button is a split button. Click Merge, then confirm. The confirmation names the merge method and has Cancel. The arrow opens the methods (Merge, Squash, Rebase) when the code host offers more than one. Merge is off when the pull request is a draft, closed or merged, when you lack the right to merge, or when the code host blocks it. Failing checks or requested changes do not turn Merge off: the confirmation then names that risk.

The narrow column shows the reviewers with their verdicts, the linked tickets and runs, and the items that cite the pull request.

Files: each file starts collapsed, with its path, its status and its lines added and removed. Click a file to read its diff. The tree on the left has a filter. Expand all opens the first 30 files that match the filter, then the action reads "Expand next 30". Tick the box of a file to mark it as viewed. The count of viewed files stays on this computer, for this pull request and this head commit.

Comments on lines: the "+" in the gutter of a line adds a comment to that line. It shows on lines that the pull request added or left as they were, never on removed lines. Add review comment adds the comment to your pending review. Add single comment posts it at once. The pending review stays on this computer until you submit or discard it, and it survives a restart. Submit review opens a dialog: pick Comment, Approve or Request changes. Request changes needs some review text. A review takes at most 100 comments.

A comment that the code host cannot place on a line goes into the text of the review, and a notice says how many. When the code host posts only part of the review, the page keeps the other comments as pending. Azure DevOps puts every comment in the text of the review, with its file and line. Replies, Resolve, the "+", Submit review and Comment need the right to write to the code host. Without it, each control is off and says why.

Limits: GitHub and GitLab list up to 3000 files. A thread shows its last 50 comments. GitLab review threads show the first 100. The app does not keep the author of a pull request.

Agent review:

1. Click Review with an agent on an open pull request. An agent reads the changes at the head commit, in a read-only copy. The review is a draft: a summary, a verdict and findings on their lines of the diff.
2. Edit the summary and the verdict, click Drop on a finding that you do not want, then click Post review. A review posts once.
3. In Setup / This project, choose the agent review of each pull request: Off, Draft or Post. Post adds a comment review and never approves.

An agent review shows in Crew / Sessions, where Stop ends it. It counts in the agent limit and against the budget of the project. A read-only project refuses it.

### Checks

Checks shows the gates of the run, the checks of the pull request with the CI state, and the row Impacts on other code.

### Chat

Chat shows the conversation of the agent session, the conversation of the pull request and the comments of the ticket. The pull request conversation lists the general comments and the review threads in time order. Click Reply to answer a thread, Resolve to close it and Reopen to open it again. The write box has Write and Preview. Comment posts a general comment. Send back to the agent shows for a pull request that a run opened.

## Approvals

The approvals of one run are one question that names each effect.

- The main button approves each effect.
- Each step opens the list where you approve or reject one effect alone.
- Not yet moves the question to Later and decides nothing.
- Do not ask again for this recipe allows exactly the shown kinds of writes for that recipe. A push that rewrites history is never part of it. A write that already waits keeps its question: the permission applies to the writes that come later.

Crew / Recipes and Setup / This project list the permissions of each recipe, with Remove.

## When an agent stops

A run fixes its own problems first. A blocking finding, a red check, a conflict or an empty branch starts a fix round with no click. The rounds are limited: 3 failed tries for each step, 3 feedback rounds and 8 fix rounds for each run. The same failure twice in a row stops the run at once.

Then the run stops, and the feature needs you. The page says the state in plain words, the cause in one sentence and what the run tried, with one main action. Today and the Ask bar give the same action. The run also writes the same text as a comment on the ticket, and the ticket gets the label `shipyard:blocked`.

| Action | When |
|---|---|
| Reply | The agent asked a question. |
| Unblock | The run is blocked. Type a message: the run gets one more round and reads it. |
| Add budget | The run spent its budget or its turns. Raise the budget, then the run goes on. |
| Resume | The run is paused. |
| Try again | The run failed or was cancelled. A new run starts. |
| Close as done | The run changed no file and the work is already there. |

A reply on the ticket by a team member also unblocks the run. While the team file names no admin, any reply counts: on a public issue tracker, name an admin. A pause for the day budget has no action: it ends by itself at the first sync of the next day. A run that ended does not start again by itself.

## Health

Health shows the product health: the checks of the project and the security scanners. Each role sees it. A person with no right on the code sees the gates with their state, and Run, Set up, the terminal and Install are off. The title says how many gates need a fix.

A run of a check starts after your click. While it runs, the card shows Running, the time that counts up and the last lines of the output. The run goes on when you leave the page. Open in terminal, on a check, runs its command in the terminal drawer. The info button of each card says what it looks for, why it matters and what to do when it fails. Each finding shows its file and its line.

The scanners are:

- secrets: keys and tokens in the tracked files. Put `shipyard:allow-secret` on the line of a test fixture, or on the line before it, to skip it.
- dependencies: known vulnerabilities (CVE) in the lock files, with `osv-scanner`. Record a reviewed finding in `.osv-scanner.toml`.
- code: OWASP issues such as injection, XSS and remote code execution, with `semgrep`. Put `// nosemgrep` on the line of a reviewed false positive.
- skills: unsafe instructions in agent skills, with `skillspector`.

The software parts list (SBOM, "software bill of materials") names every library the project uses, with its version. Export it when a client or a security team asks which software the project contains.

Docs freshness lists the docs that did not follow the code of the branch, with the count. The same warning shows in the commit gate, the push gate and the docs chain of Impacts. Each stale doc has "Update with an agent". An agent run starts only after your click, and the pull request that it opens waits for your review. "Acknowledge" keeps a warning as it is, with a reason.

## Impacts

Impacts tells which items a change touches, and proposes an action plan. It opens from the Checks of a feature: click Impacts on other code. The full page is `/flow/impacts`. It needs access to the code.

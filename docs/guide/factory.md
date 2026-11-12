# Factory

The Factory lets agents work on tickets. Each job is a run. A run follows a workflow: plan, work, review, then a pull request.

## Runs

Runs shows the runs that need attention in five lanes: Queued, Working, Needs you, In review and Ready to merge. Each lane shows its count, and None when it is empty. The count next to Runs is the number of cards on the board, or the number of rows in History. The five lanes fit the window with no sideways scroll.

The bar above the lanes has:

- Search: find a run by its ticket key or title.
- A filter: All, Needs you or Mine.
- Board and History. History lists each run that ended, and each older run of a ticket, newest end first. Click a row to open the run.

A run that is Merged, Done or Cancelled is in no lane: History lists it. The latest failed run of a ticket stays in Needs you, with Start again, and shows in History too. Start again on the card starts a new run and opens its page.

A card shows the ticket key, the title, the step as n of m, the cost and the pull request number. A card that waits for you has one button, for example Review plan. The button opens the run at that action. The card menu has Stop and History.

1. Click Start run, then pick a ticket by its title.
2. Click a card to open its run.
3. When a run needs you, it moves to Needs you. Approve its plan, answer its question or unblock it.
4. Stop a run at any time from the card menu or from the run page.

### The run page

Each run has its own address, `/factory/runs/<id>`. Each link to a run opens this page: Home, a notification, the menu bar panel, Activity, Sessions, Usage and the Agents map. Back and Forward work. At the top, Back returns to the page you came from, with its search and its filter, and Escape does the same. A link that you opened directly shows Runs and goes to Runs. Copy ref is beside it.

The summary stays in view at the top. It shows:

- The ticket key and title. The link opens the ticket.
- The state in words.
- The step as n of m, with its name.
- The cost, and the budget when one is set.
- The elapsed time.
- The AI tool and the model.
- The pull request with its checks and its review.

The menu of the summary has Stop.

The summary shows one action for the state:

| State | Action |
|---|---|
| Waiting for an answer | Answer |
| Plan review | Approve plan |
| Blocked | Unblock |
| Paused | Resume |
| Changes requested, in review, ready to merge | Open pull request |
| Done or merged, with a pull request | Open pull request |
| Failed, cancelled | Start again |

Start again makes a new run and opens its page.

What waits for you shows directly under the summary: the questions, the approvals, the plan with its actions, and the reason that the run stopped with its form. A paused run has one form with the added budget, the message and Resume.

Under it are three tabs:

- Activity: the live conversation and the events. Important shows the questions, the errors, the state changes and the results. All shows every event.
- Changes: the findings and the diff. Each file is collapsed with its counts.
- Workflow: the graph and the sessions. Follow shows a live session. Open in terminal resumes an ended session.

### When a run cannot go on

A run fixes its own problems first. A blocking finding, a red check, a conflict or an empty branch starts a fix round with no click. The rounds are limited: 3 failed tries for each step, 3 feedback rounds and 8 fix rounds for each run. The same failure twice in a row stops the run at once.

Then the run stops and moves to Needs you. The run page says the cause in one sentence, the last lines, and what the run tried. The run also writes the same text as a comment on the ticket, and the ticket gets the label `shipyard:blocked`.

To move it on, do one of these:

- Type a message and click Unblock. The run gets one more round and reads your message.
- Reply on the ticket. A reply by a team member also unblocks the run. While the team file names no admin, any reply counts: on a public issue tracker, name an admin.
- Click Close as done when the run changed no file and the work is already there.

A run that spent a budget or its turns stays paused. Raise the budget, then click Resume. A pause for the day budget ends by itself at the first sync of the next day.

A run that ended does not start again by itself. Click Start again on a failed or cancelled run, or change the ticket.

## Workflows

Workflows lists the workflows and the roles of the agents. Open one to read or change it, then save. A broken file shows its error and its line. The last good version keeps running.

A workflow opens in a form. Use Form and Text to switch between the form and the YAML text. Both edit the same file.

- Steps: set the role or the action, the model tier, the effort, the mode, the needs, the tools and the gate of each step. More shows the other fields: workspace, for each, parallel children, retries, time limit, budget, skill, fresh context and review rounds. Add, remove and move a step up or down.
- Limits: the stall timeout in seconds. Turn on Budget to stop each run at an amount in USD, and Turn limit to pause each run after a number of turns. Both are off by default.
- The form checks the workflow at each change. Save stays off while it shows an issue.
- New makes a workflow from a preset: feature, bug, spike, docs-update, review-only, spec-split or bootstrap. The More actions menu of the open workflow has Duplicate, Rename and Delete. Duplicate copies the workflow. Rename and Delete refuse the default workflow of the project and a workflow that a run uses. Delete asks you to confirm.
- A save from the form keeps the comment lines at the top of the file. Use Text to keep other comments.
- An outside agent with the Workflows tools on (Settings / Connections / MCP) can list, read, check and propose a workflow. A proposal does not change the file: open the workflow, read the diff, then Apply or Discard.

## Agents map

Agents map draws the runs, their tickets, their agent sessions and the files of their findings as a graph. A node shows the ticket key and title, the step name or the file name. Hover a node to see its ref. Right-click it, or press the context-menu key, to copy the ref. Click a run or a session to open its run. The table button lists the same nodes for the keyboard.

## Sessions

Sessions lists the agent sessions of the runs and the sessions on this computer. Click a run session to open its run at that step. Stop a session that you do not need.

The Agents switch stops every run and stops new runs. Turn it on again to go on.

## Usage

Usage shows the tokens and the money that the agents used, by day and by person, against the budgets, and the success rate of the runs.

- Budgets shows the amounts that are set, with Edit. With no budget set, it shows the form. Click a day or a member to fill the form.
- Click a run to open it.

- Iterations counts the requests that each run sent to the model.
- The amounts show by default. Switch Show prices off to hide them: a money tile then shows the token count. The app remembers the switch for each project.

- An alert shows at 80 percent of a budget.
- A run pauses at 100 percent. Raise the budget to go on.

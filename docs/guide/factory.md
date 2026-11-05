# Factory

The Factory lets agents work on tickets. Each job is a run. A run follows a workflow: plan, work, review, then a pull request.

## Runs

Runs shows the runs in six lanes: Queued, Working, Needs you, In review, Ready to merge and Done.

1. Click Start run, then pick a ticket by its title.
2. Open a run to see its steps, its events, its changes and its cost.
3. When a run needs you, it moves to Needs you. Approve its plan, answer its question or unblock it.
4. Cancel a run at any time.

## Workflows

Workflows lists the workflows and the roles of the agents. Open one to read or change it, then save. A broken file shows its error and its line. The last good version keeps running.

A workflow opens in a form. Use Form and Text to switch between the form and the YAML text. Both edit the same file.

- Steps: set the role or the action, the model tier, the effort, the mode, the needs, the tools and the gate of each step. More shows the other fields: workspace, for each, parallel children, retries, time limit, budget, skill, fresh context and review rounds. Add, remove and move a step up or down.
- Limits: the stall timeout in seconds. Turn on Budget to stop each run at an amount in USD, and Turn limit to pause each run after a number of turns. Both are off by default.
- The form checks the workflow at each change. Save stays off while it shows an issue.
- New makes a workflow from a preset: feature, bug, spike, docs-update, review-only or spec-split. Duplicate copies the open workflow. Rename and Delete refuse the default workflow of the project and a workflow that a run uses. Delete asks you to confirm.
- A save from the form keeps the comment lines at the top of the file. Use Text to keep other comments.
- An outside agent with the Workflows tools on (Settings / Connections / MCP) can list, read, check and propose a workflow. A proposal does not change the file: open the workflow, read the diff, then Apply or Discard.

## Agents map

Agents map draws the workflows, the roles and the skills as a graph.

## Sessions

Sessions lists the agent sessions on this computer. Stop a session that you do not need.

The Agents switch stops every run and stops new runs. Turn it on again to go on.

## Usage

Usage shows the tokens and the money that the agents used, by day and by person, against the budgets.

- Iterations counts the requests that each run sent to the model.
- The amounts show by default. Switch Show prices off to hide them: a money tile then shows the token count. The app remembers the switch for each project.

- An alert shows at 80 percent of a budget.
- A run pauses at 100 percent. Raise the budget to go on.

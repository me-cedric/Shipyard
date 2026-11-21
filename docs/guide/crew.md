# Crew

The crew is the people and the agents of the project. The switch has five sections: Crew, Recipes, Sessions, Spend and Rights. The Agents on switch is in the header of Crew: off stops every agent and stops new runs. Stop all agents is on Spend: it stops each running agent and leaves the agents on, so a new run can start.

Crew opens on the cards. People shows each person as a card: the current work, the load, the role, the days a week and the skills. Agents shows each agent role with its current work. The page also shows the spend on open work and the recipes.

- Click Member to add a person. Click a card to open the page of a person.
- On the page of a person, enter the name, the handle, the e-mails and the accounts of the issue tracker and the code host. Pick a role: the rights of the role show before you save. Set the admin flag for the people who manage the team. Remove from the team is on the same page.
- Add the admin last: a team with an admin gives the rights only to the people in the file.

## Live

The switch Cards and Live is at the top of Crew. Live shows the agents at work. Each row shows an agent, its feature with its state, and the files and specs that the agent reads and changes. The filter is At work, Ended, Files or Specs. Hover an agent to see its ref. Right-click it, or press the context-menu key, to copy the ref. Click the feature to open its page.

## Recipes

A recipe is the list of steps that an agent follows on a feature. Recipes lists the recipes and the roles of the agents, each as a card with its step names. Click a card to read or change it, then save. A broken file shows its error and its line. The last good version keeps running.

A recipe opens in a form. Use Form and Text to switch between the form and the YAML text. Both edit the same file.

- Steps: each step is a card with the groups Who, People, How it works and Limits. Set the role or the action, the model tier, the effort, the mode, the needs, the tools and the gate of each step. More shows the other fields: workspace, for each, parallel children, retries, time limit, budget, skill, fresh context and review rounds. Add, remove and move a step up or down.
- A step page also shows Kind (agent, person or check, from the step), Runs beside other steps (on when the step has no step to wait for), Child steps run side by side and Mode. A step that waits for a person has Who approves: only a person with that role approves it, and only that role gets its card on Today. In People, May write is Asks first or Alone: Alone is the approval "Do not ask again for this recipe".
- Limits: the stall timeout in seconds. Turn on Budget to stop each run at an amount in USD, and Turn limit to pause each run after a number of turns. Both are off by default.
- The form checks the recipe at each change. Save stays off while it shows an issue.
- New makes a recipe from a preset: feature, bug, spike, docs-update, review-only, spec-split or bootstrap. The More actions menu of the open recipe has Duplicate, Rename and Delete. Rename and Delete refuse the default recipe of the project and a recipe that a run uses. Delete asks you to confirm.
- A save from the form keeps the comment lines at the top of the file. Use Text to keep other comments.
- An outside agent with the Recipes tools on (Setup / This computer, Outside agents) can list, read, check and propose a recipe. A proposal does not change the file: open the recipe, read the diff, then Apply or Discard.
- Writes without a question lists the permissions of a recipe (see the page Flow, Approvals). Remove asks you to confirm, then saves for the whole team.

## Sessions

Sessions lists the sessions of the agents: a run, a review of a pull request, an estimate and a tile build. Click a session to show it with Open and Stop. Stop of a run asks you to confirm. Stop of a review ends the review. Stop of an estimate ends the agent, and the sheet keeps its values. Stop of a tile build ends the build, and the dashboard does not change. Ended sessions are on their own page.

Read only shows the live output of a session when its tool writes a history file that Shipyard can read (Claude Code and Codex do). With no history file, the pane shows no output. Take control stops the session after you confirm, and runs the resume command of its tool in the Shipyard terminal.

## Spend

Spend shows the tokens and the money that the agents used, by day and by person, against the budgets, and the success rate of the runs.

- Budgets lists each amount that is set, with its own Edit. With no budget set, it shows the form. Click a day or a member to fill the form.
- Click a run to open its feature.
- Iterations counts the requests that each run sent to the model.
- The amounts show by default. Switch Show prices off to hide them: a money tile then shows the token count. The app remembers the switch for each project.
- Warn at is the percent of a budget where the alert shows. It is 80 percent for the project until you click Edit and set another percent from 1 to 100.
- Each limit of a feature, a day and a person has a Then choice: Stop and ask (the default), Pause, Ask me or Go on. The run stops at 100 percent with the first three. Stop and ask also writes a comment on the ticket, Ask me asks in the app only, and Pause stops with no question. Raise the budget to go on. Go on turns the budget into a warning: the run goes on, and the alert shows once. Stop all agents, the stall timeout and the most turns still stop the run.

How agents do shows Processor and Memory bars for the agent processes only, not for the whole computer. Each step of a run lists the tool calls of the agent.

## Rights

The team file `.shipyard/team.yaml` lists the people of the project, their role and their rights. Crew edits the members, and Rights shows the rights of each role. A project with no team file, or with no admin, gives every person every right.

### Roles and rights

Each member has one role: Product owner, Project manager, Architect, Tech lead, Business analyst, Developer, Tester, Designer or Viewer. The role gives the rights, the first page and the panels on Today (see Getting started, Your role).

A right turns a control off. The control stays visible, and its tooltip names the missing right and your role. A place or a section hides only when the team gives your role no access to it.

- `work.edit`: tickets, the list, the board, the plan, estimates, time.
- `specs.edit`: spec changes, specs, questions, test plans, project rules.
- `design.edit`: diagrams, decisions, API, data, network flows, screens.
- `knowledge.edit`: handbook, documents, slides, dashboards.
- `code.write`: commit, push, branch, open a pull request.
- `code.merge`: merge a pull request.
- `runs.start`: start, stop and resume a run.
- `runs.approve`: approve what an agent wants to write, and its plan.
- `plan.edit`: estimates, the plan calendar and the write of a plan to the issue tracker. Your own time entries stay personal and do not need it.
- `project.settings`: Setup / This project, automation, recipes, connections, the team file.
- `costs.view`: amounts of money.

The admin flag gives every right. A member can have changes: `+code.merge` adds a right, `-runs.approve` removes one. Your personal role in Setup / Me and the read-only profile of a project can only remove rights.

Code and merge is one row: the Code level and a Merge switch, which set `code.write` and `code.merge`. The Plan level of a role follows its Work level until you change it. Each role has a Places setting: a place that you switch off is hidden for that role. By default, Product owner and Project manager do not see Code, Business analyst and Viewer do not see Crew and Code, Architect does not see Plan, Tester does not see Plan and Crew, and Designer does not see Plan, Crew and Code. The default rights do not change.

### Who you are

Shipyard finds you from the account of a signed-in connection, then from your git e-mail. Rights shows who it found. When the team file has an admin and you are not in it, you are a viewer: you can read and change nothing. Fill in Ask to join and send the copied entry to an admin.

### The rights come from the default branch

When the project has a remote, Shipyard reads the rights from the team file of the default branch. A change in your working copy gives no right until it is merged. Rights warns you while the two differ. Protect the default branch in your code host, and require a review for `.shipyard/team.yaml`: Shipyard cannot stop a person who edits files with another tool.

### Move the roles of this machine

If this machine holds roles by e-mail, Rights offers to write them as members. A former functional lead becomes a product owner. A former junior becomes a developer without `code.merge` and `runs.approve`. The page modes of the old profiles are dropped, and the list shows each of them. A person with `project.settings` confirms.

### Audit

Each write that needs a right, and each refusal, adds a line to the audit log on your machine. Rights shows the last 100 lines to a person with `project.settings`.

## Pages

A sub-page has its own address and a back link, and no section switch.

- Crew: `/crew/crew`. The More menu holds Live (`?view=live`) and Add a person. A person opens at `?member=<handle>`.
- Recipes: `/crew/recipes`. A recipe opens at `?recipe=<id>` and a step at `&step=<id>`. The files of the agent roles are in the More menu.
- Sessions: `/crew/sessions`. The ended sessions are at `?page=ended`.
- Rights: `/crew/rights`. The team file is at `?page=team`.
- Spend: `/crew/spend`. How agents do is at `?page=how` and Budgets at `?page=budgets`. Show prices, Add a limit and the tables of usage (`?page=usage`) are in the More menu.

## Join requests

On the team file, each person who asked to join shows as a card with the pull request. As sets the role, Refuse closes the pull request, and Accept writes the role in the team file and merges the pull request. Accept needs the right to merge. Accept refuses a pull request that changes another file, another person or the rights of the new person: it adds one person with the role that you set and no admin.

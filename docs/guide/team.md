# Team and rights

The team file `.shipyard/team.yaml` lists the people of the project, their role and their rights. Work / Team edits it. A project with no team file, or with no admin, gives every person every right.

## Roles

Each member has one role. The role gives the rights, the first tab and the panels on Home / Today.

| Role | First tab |
|---|---|
| Product owner | Work / Backlog |
| Project manager | Work / Board |
| Architect | Design / Decisions |
| Tech lead | Factory / Runs |
| Business analyst | Specs / Changes |
| Developer | Factory / Runs |
| Tester | Specs / Test plans |
| Designer | Design / Screens |
| Viewer | Home / Today |

A role never hides a page. Each person can open each page.

## Rights

A right turns a control off. The control stays visible, and its tooltip names the missing right and your role.

- `work.edit`: tickets, backlog, board, plan, estimates, time.
- `specs.edit`: spec changes, capabilities, questions, test plans, constitution.
- `design.edit`: diagrams, decisions, API, data, flows, screens.
- `knowledge.edit`: handbook, documents, slides, dashboards.
- `code.write`: commit, push, branch, open a pull request.
- `code.merge`: merge a pull request.
- `runs.start`: start, stop and resume a run.
- `runs.approve`: approve what an agent wants to write, and its plan.
- `project.settings`: Settings / Project, automation, workflows, connections, the team file.
- `costs.view`: amounts of money.

The admin flag gives every right. A member can have changes: `+code.merge` adds a right, `-runs.approve` removes one. Your personal role in Settings / Me and the read-only profile of a project can only remove rights.

## Set up the team

1. Open Work / Team and click Member.
2. Enter the name, the handle, the e-mails and the accounts of the issue tracker and the code host.
3. Pick a role. The rights of the role show before you save.
4. Set the admin flag for the people who manage the team.
5. Save.

Add the admin last: a team with an admin gives the rights only to the people in the file.

## Who you are

Shipyard finds you from the account of a signed-in connection, then from your git e-mail. Work / Team shows who it found. When the team file has an admin and you are not in it, you are a viewer: you can read each page and change nothing. Fill in Ask to join and send the copied entry to an admin.

## The rights come from the default branch

When the project has a remote, Shipyard reads the rights from the team file of the default branch. A change in your working copy gives no right until it is merged. Work / Team warns you while the two differ. Protect the default branch in your code host, and require a review for `.shipyard/team.yaml`: Shipyard cannot stop a person who edits files with another tool.

## Move the roles of this machine

If this machine holds roles by e-mail, Work / Team offers to write them as members. A former functional lead becomes a product owner. A former junior becomes a developer without `code.merge` and `runs.approve`. The page modes of the old profiles are dropped, and the list shows each of them. A person with `project.settings` confirms.

## Audit

Each write that needs a right, and each refusal, adds a line to the audit log on your machine. Work / Team shows the last 100 lines to a person with `project.settings`.

## Inbox

Home / Needs you shows what you can act on: approvals with your rights, questions of your tickets or of your role, reviews. Everyone shows the rest, with the controls off.

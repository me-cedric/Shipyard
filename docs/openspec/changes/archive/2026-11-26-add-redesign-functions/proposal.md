# Add the functions of the redesign

## Why

The design of the redesign shows 46 controls that the app does not have (`change:update-app-redesign`, `adr:0023`). `change:update-app-redesign` kept the Non-Goal "No new function", so it built the look and left these controls out. The owner asked to build them now (`q:Q-173`).

## What Changes

- This change lifts the Non-Goal "No new function" of `change:update-app-redesign` for these 46 controls, and only for them.
- Runs and recipes: Pause, Take it over, file in the agent chat, document and limit of a new feature, Warn at and Then of budgets, stage limits, role of a human step, rows of a recipe step.
- Code host, tickets and releases: Run again, Keep beside Undo, recipe of a ticket, releases of the issue tracker, kinds of ticket, reviewers and merge method, close and ready, authors, action plan, join requests, calendar.
- Library: items in Opened last, earlier versions, added files, notes of slides, Learn, PDF and Markdown reports, report cards, chart kinds, Pin to Today, release picker, flow check, stale code, endpoint link.
- Shell, Setup, sessions and rights: Sign out, Take control, Processor and Memory, Plan right, Fill from my work, model of a role, budget notice and release channel, data folder, feedback file, permissions card, hidden places, close guard.
- Go on of a budget makes the budget a warning only (`q:Q-174`). Pause and Ask me stay. Stop all agents and the stall timeout stay. The max turns went later (`adr:0025`).
- A release is the version of the issue tracker (`q:Q-176`). Sign out removes the tokens of the code host and the issue tracker (`q:Q-175`).

## Impact

- Affected capabilities (new): `runs-recipes` (9 requirements), `code-host-tickets` (11), `library-functions` (13), `shell-setup-rights` (12). Four writers work apart, one on each.
- Order rules: F24 and F36 wait for F10. F41 waits for F16. F40 puts its command in a new file of group D.
- Rule check: Go on weakens the budget of a run (constitution section 5, rule 5). The checklist of `runs-recipes` asks the owner to confirm or to require an ADR.
- Affected code/docs: see the `plan.md` of each capability. Docs per the table of `CLAUDE.md`: diagrams, flows, data models, screens, test plans, changelogs, guide.
- Questions answered: `q:Q-173` (scope), `q:Q-174` (Go on), `q:Q-175` (Sign out), `q:Q-176` (releases). Lead defaults for the other controls are in the plans.

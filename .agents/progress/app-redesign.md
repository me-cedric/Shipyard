# Progress: update-app-redesign

Change: `docs/openspec/changes/update-app-redesign/`. Decision: `adr:0023`. One session per wave.

## Wave 1, foundation (2026-11-16): T004 to T009 done

Branch `feature/app-redesign-wave-1-d9708f`, local commits only. Not pushed, no pull request.

What the wave did:

- T005, T006: `crates/shipyard-core/src/feature.rs` has `stage_of` (the sixteen run states to a stage and a mark) and `features` (ticket, spec change, newest run and its pull request as one `FlowFeature`). The command `features_list` is in `crates/shipyard-app/src/factory.rs`. The mock is `src/lib/ipc/mock-features.ts`. No page reads the command yet.
- T007: tokens of the new look in `src/ui/tokens/tokens.css`: one blue accent, the tokens `--attention*` (only `attention-card.tsx` can use them, a test checks it), `--control-h` 44 px with the class `min-h-control`. Light is the theme when no theme is stored. A stored theme stays, System included.
- T008: `src/ui/molecules/`: `place-menu`, `ask-bar`, `stage-line`, `attention-card`, `section-switch`, `door`. The value row is `SettingsRow`. Each has a gallery entry.
- T009: `src/features/shell/places.ts` holds the seven places. Each section is one old view `space/tab`, and its slug is the old tab id. The new addresses are `/<place>/<section>`, `/flow/runs/$runId` and `/code/pull-requests/$pullId`. Each old address stays registered in `src/app/router.tsx` and redirects with its search and its hash. A bare old space opens its own first view (`/factory` opens `/flow/runs`). The sidebar draws the place menu, one section switch replaces the tab bar, and the native Go menu holds the seven places.
- T004: `src/features/shell/inventory.test.tsx` loads each old address and checks that a real page opens and that each action id runs.

Decisions of this wave (change them in one place):

- Stage map: Queued, Claimed, Planning and PlanReview are Spec. Working and SelfReview are Build. PROpen and ChangesRequested are Review. Merged and Done are Ready. Failed and Cancelled are Build with the mark stopped. A side state takes the stage of its return state. The map is one `match` in `feature.rs` and `SPLIT` in `mock-features.ts`.
- An older run of a ticket and its pull request do not show as a feature.
- The names of the places in French, German and Spanish are the defaults of `q:Q-172`.
- The old action ids `go-<space>` stay, hidden from the palette. A stored shortcut for one still runs it.

Checks, run by the lead on the final tree:

- Passed: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --no-fail-fast` (app library 504), `pnpm typecheck`, `pnpm lint`, `pnpm test` (248 files, 2014 tests), `pnpm ipc:check`, `openspec validate update-app-redesign --strict`, `CI=1 npx playwright test` (130), `pnpm test:personas`.
- Review in a fresh context: 2 major and 4 minor findings, all fixed. The lead also found that the dark accessibility run scanned Light after the new default: `e2e/first-run.ts` now picks Dark from the palette.

Open after Wave 1:

- The typed links in the feature folders still name the old addresses (about 850 uses). They work through the redirect. Each wave rewrites the links of its pages.
- The Button, Input and IconButton atoms are 28 px high. A page of the new look must pass `min-h-control` until the atoms get a 44 px size (REQ-026).
- `FlowFeature` has no field for who works on the feature (REQ-011). Add it in Wave 3.
- The `wi:` ref of a proposal is read only in the Jira key form. A ticket of another issue tracker links to its change through the mirror only.
- `role-panels.tsx` and `onboarding/pictures.tsx` still show the names of the old spaces. `orderedSpaces`, `visibleTabs` and `barTabs` in `spaces.ts` serve only the redirects and the tests: T028 and T030 remove them.
- Home / Projects is a section of Today for now. The plan puts it behind the project name (T027).
- The guide has the new menu in `start.md` only (four languages). The pages by old space are for T032.
- `q:Q-172` is open: the owner can change the French, German and Spanish names in `src/lib/i18n/` (`ui.place`).
- No old page was removed: Wave 1 replaced the shell only (the tab bar file is gone).

## How Wave 2 starts (T010 to T012, Today and Ask)

1. Read this file, `tasks.md`, `plan.md`, REQ-004, REQ-005, REQ-007, REQ-008 and REQ-009 of the spec, and the Today and Ask screens in `docs/designs/redesign/`.
2. Build Today in `src/features/home/` with `AttentionCard`, and the Ask bar in the top bar with `AskBar`. The section `today/today` already hosts the page of today.
3. Keep `inventory.test.tsx` green. Remove an old page only when the wave replaced it.
4. End with the review in a fresh context, the screens registry, the screenshots (`node scripts/screenshots.ts`), the guide, both changelogs and one entry here.

## Wave 2, Today and Ask (2026-11-17): T010 to T012 done

Branch `feature/app-redesign-wave-2-619160`, cut from the wave 1 branch, local commits only. Not pushed, no pull request.

What the wave did:

- T010: `useNeedsYou` in `src/lib/home/index.ts` is the one list of what needs the person (questions, approvals, plan reviews, agent reviews, messages, with the routing by role). Today (`src/features/home/today.tsx`), the count of the menu (`counts.ts`) and the menu bar panel read it. Today shows one `AttentionCard` with the answer rows of `inbox/inbox.tsx`, Later, the queue, and the count in the title. The place has the sections Today, News (`news.tsx`, the notifications of the old bell), Activity (`home/activity.tsx`, the runs and the sessions of the old Activity panel) and Projects. `/home/activity` opens `/today/activity`.
- T011: `role-panels.tsx` has one Open for each panel, the new addresses and a role picker; a panel of a hidden section stays hidden. `my-work.tsx`, `away.tsx`, `time-reminder.tsx` and `working-now.tsx` hold the parts of Today.
- T012: the Ask bar is in the top bar (`context-bar.tsx`, `palette-host.tsx`, `src/ui/organisms/command-palette.tsx`). The palette shortcut moves the focus to it. The panel has the answer, Go to and Do. `ask-answer.ts` answers what blocks, what stopped and what needs the person from `features_list`. The Ask split button, the search button, the bell and the Activity button left the top bar. The assistant stays the side panel with each control, and has Undo for its changed files (`assistantWorktreeDiscard`).

Decisions of this wave:

- The reminder to log time is its own card, out of the count. It shows from Monday to Friday when no time entry of the day exists (`timesheetDue`), not on Thursday only.
- The title of Today counts the list that the page shows: with Everyone on, it can differ from the count of the menu.
- A dot on Today in the menu marks unread news, and a live mark shows while a run or a session works.
- A match word of the Ask answer is the start of a word, from `palette.words*` in each language. The action of an answer opens the run: the one-click actions are T016.
- An answered spec question stays on the card until it is folded.

Audit against the map of `plan.md` (rows "Home / Today, notifications, Activity, menu bar panel" and "Search, command palette, Ask, assistant panel"): each control, right gate, error line, palette entry, canned prompt, notification action and tray control has its new place. One thing is gone on purpose: the pressed state of the Ask button (the open panel shows it).

Checks, run by the lead on the final tree:

- Passed: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --no-fail-fast` (app library 504), `pnpm typecheck`, `pnpm lint`, `pnpm test` (252 files, 2049 tests), `CI=1 npx playwright test` (130), `pnpm test:personas` (7), `openspec validate update-app-redesign --strict`. No Rust file changed in this wave.
- Review in a fresh context: three rounds (10, 5 and 6 findings), all fixed or recorded below. The persona walks of the developer and the project manager now pick a thing in the queue before they answer it.

Open after Wave 2:

- REQ-005 names "keep" for the changed files of the assistant. No keep operation exists in the app: the changes stay unless the person presses Undo. Decide in Wave 3 whether a Keep control is needed.
- The answer of the Ask bar opens the run for Unblock, Try again and Answer (T016 gives the one-click actions).
- `runHref` and `pullHref` in `src/lib/shell` still build the old addresses. They redirect. Wave 3 owns the run page.
- The Get started list sits above the card on Today. The design puts it beside the card.
- The answer buttons inside `QuestionCard` and `ApprovalBar`, and the rows of Activity, are under 44 px until the atoms get the new size (REQ-026, T031).
- The queue lists each waiting thing. The design shows a short queue: cut it when Flow holds the full list (Wave 3).
- The German and Spanish texts of this wave are translations by the agent: the owner can check them with `q:Q-172`.
- The worktree needs `git submodule update --init docs/agent-compass` before `cargo` builds.

## How Wave 3 starts (T013 to T017, Flow and one feature)

1. Read this file, `tasks.md`, `plan.md`, REQ-010 to REQ-015 and the Flow and feature screens in `docs/designs/redesign/`.
2. Add who works on a feature to `FlowFeature` (REQ-011), then build Flow on `features_list`.
3. Give the Ask answer and the Today card the one-click actions of T016.

## Wave 3, Flow and one feature (2026-11-17): T013 to T017 done

Branch `feature/app-redesign-wave-3-949c03`, cut from the wave 2 branch, local commits only. Not pushed, no pull request.

What the wave did:

- T013: Flow is `src/features/flow/flow-page.tsx` on `features_list`: the views Flow (five stage columns), List (one table of features), Done (the ready features and the run history) and Health (the Quality page of today), the filter All / Needs me / Mine, the agents switch, Start run and New. A card shows the title, who works on it and its state. `FlowFeature` has `who`, `runState`, `approvals`, `questions`, `checks` and `stop`. `places.ts` holds a view of Flow as `flow/<slug>`, and `REPLACES` names the old tabs that it takes over. Work / Backlog, Work / Board, Factory / Runs and Specs / Changes redirect, and their page files are removed.
- T014: one feature page, `src/features/flow/feature/`, at `/flow/feature/$featureId` (the ref of the first part: ticket, change, run, pull request). The stage line and the sections Story, Brief, Design, Changes, Checks, Chat. `/flow/runs/$runId` and `/code/pull-requests/$pullId` show the same page. The run page, the change detail, the ticket detail and the pull request page are its parts now.
- T015: the approvals of one run are one question (`ApprovalsQuestion` in `src/features/home/inbox/inbox.tsx`) on the feature page and on Today, counted once. "Each step" has Approve and Reject for each effect. "Not yet" sends nothing. "Do not ask again for the <recipe> recipe" calls `approvals_allow_recipe(ids)`: the recipe and the kinds come from the waiting approvals, and the permission is one list of write kinds for each workflow in `recipe_writes` of the automation file. Settings / Project lists the permissions, and Remove goes with Save.
- T016: `stop_of` in `crates/shipyard-core/src/feature.rs` gives the one action of a stopped run (`stop` on `RunView` and `FlowFeature`): Reply, Unblock, Add budget, Try again, Resume, Close as done. The card of the feature page (`stop-card.tsx`), the row of Today and the answer of the Ask bar use it.
- T017: `/flow/new` (`src/features/flow/new-feature.tsx`): what to build, the kind, three ways, or start from a ticket.

Decisions of this wave (change them in one place):

- A spec change with only its proposal, and no run and no pull request, is an idea. A change with a file under `specs/` is in Spec (`feature()` in `feature.rs`, mirrored in `mock-features.ts`).
- New feature: each way first makes a spec change with the text as its title. A ticket comes from `change:<id>`, never from an invented ref. "Idea for later" makes the change only.
- A recipe permission covers only a write that comes later. A write that already waits keeps its question, also after a reload (`release_allowed` reads the project switches only). A push with force with lease is never in a permission. A save of the settings can remove a kind and can never add one. One mutex guards each writer of the automation file.
- The day budget pause gives no action: the run goes on the next day.
- Close as done on a run whose pull request merged or closed on the code host gives the run that event: merged ends as Done, closed ends as Cancelled.
- The move of a card is the menu item "Move to <status>". The drag and Shift+Arrow of the old board are gone.
- `openRef` of a change or a ticket from the palette still opens the inspector. Its "Open page" goes to the feature page, section Brief.

Audit against the map of `plan.md` (rows "Work / Backlog, Board; Factory / Runs board and History; Specs / Changes" and "Run page, change detail, ticket detail, pull request page, unit chat"): a reviewer in a fresh context compared each old page at the wave 2 commit with the new pages. Each control, filter, right gate, error line, empty state and deep link has its new place. Gone on purpose: the drag of the board, the status group headings of the backlog (the Status filter gives each count), the stepper and the task progress on a change row (they are on Brief), the cost and the step on a run card (they are on the feature page).

Reviews in a fresh context (Opus): the T015 backend (2 major, 3 minor), the interface (1 major, 9 minor), the whole wave with the audit (3 major, 4 minor). All fixed. The majors: the permission was stored by switch and not by kind, the settings form erased the permissions, a grant released the waiting writes of other runs, Close as done called a command that refused the run, Flow hid a load error, "Open page" of a change went nowhere.

Checks, run by the lead on the final tree:

- Passed: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --no-fail-fast` (2037 tests), `pnpm typecheck`, `pnpm lint`, `pnpm test` (260 files, 2175 tests), `pnpm ipc:check`, `CI=1 npx playwright test` (130), `pnpm test:personas` (7), `openspec validate update-app-redesign --strict`.
- The end-to-end specs and the persona walks moved to the new pages: each test and each check stays, with its new path. One walk found a gap: the Checks section now names the CI state of the pull request.

Open after Wave 3:

- No command exists for these controls of the design, so they are left out: Pause on the agent card, Limit (a budget for one run) and Add a document on New feature, Recipe for "Build now".
- The mirror keeps no author of a pull request: `who` of a feature with only a pull request is empty.
- The label "Close as done" also shows for a pull request that was closed with no merge, where the run ends as Cancelled.
- A teammate with an older build reads an automation file that has `recipe_writes` as not valid. The guide says so.
- The feature page shows the title two times on Changes (the page and the pull request header), and the approvals question has no title line as the picture has ("Send it for review?").
- Other pages still link to `/specs/changes`, `/work/backlog` and `/factory/runs` (the Get started list, the next step of Specs, Capabilities). They redirect.
- Dead i18n keys of the removed pages stay (`sync.backlog.adopt` and others), and `src/ui/molecules/run-card` can have no user now: T030 removes them.
- The guide has the new text in `factory.md` and short notes in the other pages (English and French; German and Spanish have `start.md` only). T032 rewrites the guide by place.
- The German and Spanish texts of this wave are translations by the agent (`q:Q-172`).
- The controls inside `ApprovalBar`, `QuestionCard` and the pull request parts are under 44 px until the atoms get the new size (T031).

## How Wave 4 starts (T018 to T020 and T035, Crew and Plan)

1. Read this file, `tasks.md`, `plan.md`, REQ-016 to REQ-019, REQ-030 and REQ-033, and the Crew and Plan screens in `docs/designs/redesign/`.
2. Crew / Recipes is the place for the permissions of a recipe: show them with each step field (they are in Settings / Project today).
3. Keep `inventory.test.tsx` green. Update the end-to-end specs and the persona walks with each page that moves.

## Wave 4, Crew and Plan (2026-11-18): T018 to T020 and T035 done

Branch `feature/app-redesign-wave-4-0f489d`, cut from the wave 3 branch, local commits only. Not pushed, no pull request. Waves 5 and 6 run on other branches at the same time.

What the wave did:

- T018: Crew has the sections Crew, Recipes, Sessions, Spend and Rights (`src/features/crew/`). Crew shows the people (load, role, days a week, skills) and the agent roles with their current work, the spend card and the recipes. One person is a page (`member.tsx`, `?member=<handle>`). Recipes is the workflows page with each step field and "Writes without a question", the durable permissions of a recipe. Spend is the usage page with the budgets (`budgets.tsx`). Rights holds the rights of the roles, the team file error, the join request, the migration and the audit tail. The agents switch (it stops all agents) is in the header of Crew, Sessions and Spend.
- T019: the live work rows (`live.tsx`, `/crew/crew?view=live`) replace the agents map: agent, feature, and the files and specs with Open and Copy ref. The agents map folder is removed.
- T020: Plan has the sections Timeline, People, Estimates and Time (`src/features/plan/`). The title of Timeline says when the plan ends. A capacity problem is one `AttentionCard` with proposals (`proposals.ts`, a pure function) and Rebalance. People shows the load against the capacity for each week. Time has a week grid above the month view. The send preview says New, Changed and Stays the same. The sheet is in the address (`?sheet=`), shared by Timeline, People and Estimates.
- T035: "Ask an agent to estimate" (`src/features/plan/estimate-agent.tsx`, `crates/shipyard-app/src/estimate_agent.rs`, `crates/shipyard-engine/src/estimate.rs`, `src/lib/ipc/mock-estimate-agent.ts`). The commands `estimate_agent_start` and `estimate_agent_stop`. The agent proposes best, likely and worst with assumptions for each selected task. A value enters the sheet only on Accept. A sealed or frozen sheet refuses.

Decisions of this wave (change them in one place):

- Sections of Plan and Crew are `plan/<slug>` and `crew/<slug>` in `PLACES`, as the views of Flow. `REPLACES` names the old tabs, `OLD_SLUGS` holds the addresses of waves 1 to 3 (`/crew/team`, `/plan/plan`). `/factory/agents-map` opens `/crew/crew?view=live`. The sections load through `src/app/tab-view.tsx`, so Retry works after a failed load.
- The i18n areas are `t.crewPlace` and `t.planPlace`.
- No rebalance existed. A proposal moves the last task of a person who is over to a person of the same role who stays in capacity on each day, else it starts the task later. Apply uses `saveDecisions`.
- The estimate agent follows `pr_agent.rs`: a slot that shows as a session (step `estimate`, key = the sheet), the budget gate and the usage of the assistant member, the agents switch, the agent limit (runs, reviews and estimates count together). It never writes a sheet. Stop is on Estimates, on its row in Crew / Sessions, and in the agents switch.
- Remove of a recipe permission on Crew / Recipes saves at once, after a confirmation. Setup / Project still lists the permissions with Remove and Save (wave 6 owns that page).
- The search keys: `view` and `member` on `/crew/crew`, `recipe` on `/crew/recipes`, `sheet` on the sections of Plan.

Audit against the map of `plan.md` (rows "Work / Team, rights; Factory / Workflows, Agents map, Sessions, Usage" and "Work / Plan, Estimates, Time"): a reviewer in a fresh context compared each old page at the wave 3 commit with the new pages. Each control, filter, right gate, error line, empty state, intent and deep link has its new place. Gone on purpose: the graph canvas of the agents map (the runner name and the step status of an agent are not in a live row), the members table (cards with one line of facts, the rest on the member page), the member inspector (a page), the Gantt grouped by member with its load band (People), the capacity lines in the Warnings box (the card and People).

Reviews in a fresh context: the interface with the audit (2 major, 3 minor) and the agent estimate (2 major, 4 minor). All fixed. The majors: an estimate agent had no Stop in Crew / Sessions, a second Accept could undo the first, the week grid erased the note of an entry of the month beside. The end-to-end run found two accessibility defects (heading order on Timeline, card names on Crew): fixed.

Checks, run by the lead on the final tree:

- Passed: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --no-fail-fast` (2049 tests), `pnpm typecheck`, `pnpm lint`, `pnpm test` (268 files, 2221 tests), `pnpm ipc:check`, `CI=1 npx playwright test` (134), `pnpm test:personas` (7), `openspec validate update-app-redesign --strict`.
- The first run had three lanes at the same time: one Rust test with a timeout and the start of the dev server failed under that load. Run the Rust tests and Playwright in two lanes at most.
- The manual finds the help of a page by the name of its old tab: `docs/guide/factory.md` keeps the headings Workflows, Agents map and Usage until T032.

Open after Wave 4:

- Not built from the pictures: the Costing tab (072: the seal stays in the toolbar and the costs in the summary), the budgets sub-page (083: Warn at, Then, Raise have no command), the team sub-page (084), the No / See / Change view of Rights (029), the grid of People (031), the live output and Take control of Sessions (028), the three cards of the member page (101).
- "Ask an agent to estimate" is above the backlog for the selected tasks, not in the task panel as picture 085 shows.
- A cell of the week grid with two entries or more shows the sum and is read-only.
- Two Accept clicks in the same tick can both save: the buttons are off only after the first render.
- The `Switch`, `Checkbox` and `Segmented` atoms and `RoleSelect` are under 44 px (T031).
- The screenshots of the new screens are not taken: SCR-041 to SCR-043 of `docs/designs/screens.json` have no file. Run `node scripts/screenshots.ts` after the merge of waves 4 to 6.
- `src/lib/i18n/errors.ts` and other pages still link to `/work/team` and `/factory/runs`. They redirect.
- The guide has the new text in English and French. `docs/guide/team.md` still lists the old first tabs of each role (T032).
- The German and Spanish texts of this wave are translations by the agent (`q:Q-172`).
- Shared files that this wave touched, for the merge with waves 5 and 6: `src/app/router.tsx`, `src/app/tab-view.tsx`, `src/features/shell/places.ts`, `spaces.ts`, `ref-page.ts` and three shell tests, `src/features/home/role-panels.tsx` (four links), the four i18n index files (two lines each), `src/lib/ipc/mock.ts`, `src/ui/organisms/apply-dialog.tsx`, `e2e/`, `scripts/screenshots.ts`, `docs/designs/screens.json`, `docs/guide/`, both changelogs, `docs/openspec/specs/work/`.

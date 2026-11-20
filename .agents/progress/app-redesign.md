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
## Wave 5, Library (2026-11-18): T021 to T023 and T036 done

Branch `feature/app-redesign-wave-5-e2d864`, cut from the wave 3 branch, local commits only. Not pushed, no pull request. Waves 4 and 6 ran at the same time on their own branches.

What the wave did:

- T021: Library opens on `/library/home` (`src/features/library/library-home.tsx`): four doors, one chip for each view, the waiting items first (the open questions, the proposed decisions). Library has no section switch: each page has the back link "Library" (`back-link.tsx`, drawn by `section-bar.tsx`). The stale mark of a page is on its chip. `PLACES.library` holds `library/home` and `library/reports`; the space `library` works like the space `flow`. `Door` has a `chips` slot.
- T022: a reader opens on the picture or the read form alone. `SideSwitch` in `src/ui/molecules/pane-toggle.tsx` is one switch Picture / Both / Text (Read / Both / Text for a document). The stored key `sides:<id>` and its shape stay. The text shows by itself for a new file, a save conflict and an error with a line. A test plan opens as scenario cards with its tags (`test-plans.tsx`), with Read and Edit.
- T023: `/library/reports` (`src/features/reports/reports-page.tsx`) lists each export of today, the two forms, and a link to Plan or Estimates where the export needs data of that page. Each Export menu stays on its page. The source and view switches of the graph and of the network flows are buttons of 44 px. The manual opens its Library and Reports sections for the new addresses.
- T036: `dashboard_tile_build(slug, text, budget_usd)` in `crates/shipyard-app/src/pr_agent/tile.rs`, with the reply check in `crates/shipyard-core/src/tile.rs`. One read-only turn in the review slot, no worktree, no file change. The page (`dashboards.tsx`) shows the proposed tile with Accept and Discard; Accept saves through `dashboard_save_one`. The mock is `src/lib/ipc/mock-tile-build.ts`.

Decisions of this wave (change them in one place):

- The click on Library always opens the doors. The first page of the app for a role keeps the role rule (an architect starts on Decisions).
- A report shows only to a role that sees the page of its export. Reports hides when no report is left (`REPLACES["library/reports"]` in `places.ts`, `AREA` in `reports-page.tsx`: keep the two lists in step).
- The tile turn is a session row with the step `tile`, the dashboard as key and a pull number from 4,000,000,000, so the stop of a session of today stops it. It stops at its budget where the AI tool reports a live cost, and after 120 seconds on each AI tool. The last reply can pass the budget by a small amount.
- The format choice of Reports is a filter: each export has one format today.
- Not built, because no page of today holds the function: "What is tested", "Answers", "Glossary", "Pinned" and "Opened last" of picture 006, "Written for you" of picture 071, Orphans / Stale and "Check against the code" of pictures 075 and 077.

Audit against the map of `plan.md` (row "Design (all tabs); Specs / Capabilities, Questions, Test plans, Constitution; Knowledge (all tabs); reports"): a reviewer in a fresh context compared each old page at the wave 3 commit with the new pages. All 19 views open from a door, old addresses keep their search and hash, the stale marks and the waiting chips are there, no test assertion was weakened. Gone on purpose: the section switch of Library, the two icon toggles Editor and Preview.

Reviews in a fresh context: the interface with the audit (1 major, 6 minor), the tile agent with a security view (2 major, 4 minor). All fixed. The majors: Reports showed each export to each role, Accept lost the tile on a save conflict with no message, the budget did nothing on an AI tool that reports no live cost.

Open after Wave 5:

- A dashboard tile with its source off shows the word "tracker" (`off` of the tile data). T029 owns the words.
- Rust does not refuse a second tile build of the same dashboard: only the page does.
- The Crew row of a tile build shows the raw step `tile`, as `review` does. Wave 4 owns Crew.
- The chips name the pages as today (Graph, Capabilities, Constitution). The pictures say Map, Specs, Project rules: T029.
- The change request form stays a dialog (picture 096 shows a page). The side card of the code map stays the inspector.
- A role that sees only Design, in a project with no flow file, gets an empty Reports page.
- The Learn chip has no progress count.
- The guide has the Library text in English and French; German and Spanish have `start.md` only (T032). 20 older screenshots are not retaken.
- The German and Spanish texts of this wave are translations by the agent (`q:Q-172`).
- Merge note: waves 4, 5 and 6 each add a command. Run `pnpm ipc:gen` after the merge; `bindings.ts` is generated.
## Wave 6, Code, Health and Setup (2026-11-18): T024 to T027 and T037 done

Branch `feature/app-redesign-wave-6-ed14f2`, cut from the wave 3 branch, local commits only. Not pushed, no pull request. Waves 4 and 5 ran at the same time on their own branches.

What the wave did:

- T024: Code has the sections Now, History, Branches and Terminal (`/code/now`, `src/features/code/now.tsx`). Now shows the files to commit with an inline commit box (`WorkingCopy` in `changes.tsx`), the pull requests (`PullList` in `pull-requests.tsx`) and the doors Product health and Files. Terminal is a page on the switch. `SyncMark` (`sync-mark.tsx`) is in the top bar of each page: the branch, one state and Sync.
- T025: Flow / Health shows for every role. A missing right turns Run, Set up, the terminal, Install and the file link off. The impacts open from the row "Impacts on other code" in the Checks of a feature. The full page is `/flow/impacts`, off the switch, with the gate of the code area.
- T026: Setup has Start, This project, This computer and Me (section space `setup`, labels in `t.tabs.setup`). Start (`src/features/onboarding/start.tsx`) is the guided start with each item of the checklist and three doors. The scopes are `setup-project.tsx`, `setup-computer.tsx` and `setup-me.tsx` in `src/features/settings/`. A sub-page of a scope is `?page=<id>` with a back link. `setupAddress` gives the new address of each old Settings address.
- T027: the Projects page is `/projects`, behind the project name of the top bar. The new project steps have an "All steps" view. The system moments have the new look with their logic of today.
- T037: Health of this project has "Fix all with an agent" (`HealthActions` in `src/features/projects/doctor-compliance.tsx`). It uses the commands of "Build now": a spec change with the findings in its proposal, a ticket with the label `health-fix`, then one run. No new command, no Rust change.

Decisions of this wave (change them in one place):

- The connection of an issue tracker and of a code host is under This project only. The add form of This computer offers only MCP server and Model provider.
- Health is split: the tools are Health of this computer, the rest is Health of this project. The health link of the status bar opens the scope of the worst finding.
- The permissions of the operating system and "Replay the tour" are under This computer. A role with no access to the settings area gets them under Me (`usePermissionsPlace`).
- The old Settings tabs open a sub-page: Extensions opens `/setup/project?page=extensions`, Agents and rules opens `/setup/computer?page=models`, Health opens `/setup/project?page=health`.
- One feature holds the fix of the findings: while its ticket is not done, a new start runs on that ticket. The budget is the one of the recipe that the engine picks. With no budget, the button is off.
- "Merge" on a pull request row is a link to the pull request page: the merge box there asks for the confirmation.
- "Write it for me" puts a prompt with the staged files in the draft of the assistant: no command writes a commit message.
- The Projects page has "Open now" and "Opened before", with the host as a badge. It is never stored as the last view.
- The typed links do not know `?page`: two casts with a `shortcut:` comment, the other callers use `navigate({ href })`.

Audit against the map of `plan.md` (rows "Home / Projects, first run, new project wizard", "Code / Quality", "Code / Impacts", "Code / Changes, History, Branches, Pull requests, Terminal, Files" and the three Settings rows): a reviewer in a fresh context compared each old page at the wave 3 commit with the new pages. Gone on purpose: the stat strip of Changes, the groups by host of the Projects page, the progress bar of the checklist.

Reviews in a fresh context: three reviewers, 18 findings (6 major, 12 minor), all fixed with a test. The majors: four controls of Health stayed on with no right on code, "Fix all with an agent" could make a second feature after a start that failed, the run could start with no budget, the Ask bar lost the Go to entries of the moved pages, the health link opened the wrong scope, the permissions were hidden for a role with no access to the settings area.

Shared files touched (small edits, for the merge with waves 4 and 5): `src/features/shell/places.ts`, `spaces.ts`, `context-bar.tsx`, `status-bar.tsx`, `ref-page.ts`, `palette-host.tsx`, `item-facts.tsx`, `page-chrome.tsx`, `view-memory.tsx`, `no-project.tsx`, `close-guard.tsx` and the shell tests; `src/app/router.tsx`, `tab-view.tsx`, `views.tsx`; `src/lib/i18n/en.ts`, `fr.ts`, `de/index.ts`, `es/index.ts`; `src/ui/molecules/project-switcher.tsx`, `src/ui/organisms/editor-frame.tsx`, `leave-guard.tsx`, `src/lib/menus/rename.tsx`; `src/features/home/role-panels.tsx`, `inbox/inbox.tsx`; each file of `e2e/` except assistant, delivery, design, design-system, factory, knowledge, questions-loop and shell (address and label lines), the developer and tester walks; `scripts/screenshots.ts`; `docs/designs/screens.json`; both changelogs (8 bullets at the top of 0.2.0); one line each in `src/features/factory/runs.test.tsx` and `src/features/knowledge/manual.test.tsx`.

Open after Wave 6:

- No old page file was removed: each one is a part of a new page. The old page modes of Connections, Health, ProjectSettings and Me (no scope) are dead code: T030 removes them.
- Partial against the pictures: the scopes reuse the panels of today behind doors (no card grid of pictures 054 to 058, no finding cards of picture 091), Health has no "Fix with an agent" card, Impacts keeps its layout of today, History and Branches keep their layout.
- The unsaved changes dialog has no "Save all" and no file list, and "Keep them working" of the close guard cannot hide the window: no command exists for them.
- The backend does not check a right in `terminal_open` and in the install commands: the gate of Health is in the interface only.
- In the browser mock, "Fix all with an agent" and "Build now" end with "not found" after the ticket is made (`adopt` in `mock-sync.ts`). The unit tests cover the flow.
- A person who changes the label `health-fix` or the title of the fix ticket gets "Fix all" again.
- Links in the folders of the other waves and in `src/lib/notifications/targets.ts` still name the old addresses. They redirect.
- The guide has the new text in English and French. German and Spanish have `start.md` only (T032). The German and Spanish labels are translations by the agent (`q:Q-172`).
- The controls inside the reused parts are under 44 px until the atoms get the new size (T031).
- The pictures of the pages of the other waves still show the top bar of before (no sync mark). They were left as they are, so that the three branches merge with no conflict in a picture: regenerate all after the merge (`node scripts/screenshots.ts`).

Checks, run by the lead on the final tree:

- Passed: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --no-fail-fast`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (265 files, 2303 tests), `CI=1 npx playwright test` (134), `pnpm test:personas` (7), `openspec validate update-app-redesign --strict`. No Rust file changed in this wave.

## Wave 7, roles, words, removal, sizes and docs (2026-11-19): T028 to T032 in the commits, fix round after the review

Branch `feature/app-redesign-wave-7-0c590f`. The commits `400cbe95` (guide by place in four languages), `b04345c8` (screens, Screen tags, spec deltas, changelog) and `724c3d92` (role first pages, plain words, 44 px controls, removal of the dead old pages) hold T028 to T032. The boxes of `tasks.md` and of `plan.md` are for the lead to tick after the validation run (T033).

Notes of the earlier waves that are closed now:

- The atoms `Button`, `Input`, `IconButton`, `Checkbox`, `Switch`, `Segmented` and `Select` have `min-h-control`, and `src/ui/tokens/tokens.css` has one base rule of 44 px for each control (notes of waves 1, 2, 3, 4 and 6 about T031).
- `orderedSpaces`, `visibleTabs` and `barTabs` are gone from `src/features/shell/spaces.ts`. The role views and `FIRST_PAGE` are in `src/features/shell/places.ts`. The old page modes of Connections, Health, ProjectSettings and Me are removed.
- The guide is by place in English, French, German and Spanish: `start`, `today`, `flow`, `plan`, `crew`, `library`, `code`, `setup`, `projects`, `ask`, `theming`, `dev`. The pages `home`, `work`, `factory`, `specs`, `design`, `knowledge`, `settings` and `team` are gone.
- Today has three sections (Today, News, Activity). Projects is the page `/projects` since wave 6.
- A dashboard tile with its source off names the issue tracker.

Fix round of the frontend and the docs (after three reviews and one audit):

- Rights: the palette hides Setup / Tickets with no access to the settings; Flow hides New feature and Add idea, and the feature page hides Start an agent for a feature with no ticket, when the role sees no List; the Runs heading of Today / Activity is plain text when the role sees no Flow.
- Words: the conflict action is "Send to Flow"; the tile action is "Pin to Today" and Not found opens "Today"; "Spécifications", "Spezifikationen" and "Especificaciones" in Crew and Rights; "Code-Plattform" and "plataforma de código"; "Feature" in German and "funcionalidad" in Spanish, in the catalogues and in the German guide. The word test has one pattern for each language.
- Sizes: a table row that opens is 44 px high (`DataTable`); `summary` is in the base rule; five buttons lost `min-h-row`; the bars of the terminal drawer and of the inspector, and the account button, are 44 px; the bar of the timeline keeps 20 px with `min-h-0` and is exempt in the run; Learn keeps 20rem for the path beside the side column.
- `e2e/a11y.spec.ts`: one axe pass with no second try; the sideways scroll reads `main` too; the controls include `summary`, a row that opens, the menu and tree items and the select; the run adds `/flow/new`, each section of the feature page, an open menu and an open select list (sizes only for the two popups).
- Docs: the README map, the developer guide, `adr:0018` in the theming guide, "My items" in the Today guide and in SCR-001, the plan map and the commands of `plan.md`, the paths of T013, T020 and T028, the state of `q:Q-172` in the checklist.

Open after Wave 7:

- REQ-001: the feature page and Crew / Crew draw a second section switch under the place switch.
- REQ-005: the selection action says "Send to Flow", and the changed files have Undo only.
- REQ-008: the first view of Today is named "Today", not "Needs you".
- REQ-016 and REQ-017: one control turns the agents on and off and stops them; Live shows the ticket, the run, the spec change and the files of findings only.
- REQ-026: a ref chip and a glossary word have a 44 px hit box that passes over the lines next to them (`-my-3`); a link in running text is under 44 px; the narrow top bar preference has no effect on a bar with 44 px controls. Each one needs a decision of the owner.
- REQ-033: Crew / Sessions has no stop and no label for a tile build.
- The action "Open the manual for this page" still shows for a role with no access to Library / Manual (owner decision: hide the action, or let every role read the manual).
- `spec:shell#REQ-001` says a collapsed sidebar of 48 px; the code draws 56 px.
- No test opens the gallery to find a new card, and no test runs each action of the inventory.
- SCR-096 (the close guard) has no picture: the dialog opens only on the event of the desktop shell, and the browser mock cannot show it. `feature-design.png` shows the empty state, and `menu-bar-panel.png` shows the panel with no project.

Rust side of the fix round and last steps of the lead:

- The default level of the viewer for code is `none` (`crates/shipyard-core/src/rights.rs`, the mock, the team-rights spec, `adr:0019`): a viewer opens Today and sees no Code place (`spec:app-redesign#REQ-006`). The `roles:` block of the team file can give Code back. An unknown person gets the same levels.
- Saving a member keeps the `roles:` block of the team file (`team_save_members` in `crates/shipyard-app/src/work.rs`, the mock). Before, each save of a member removed it.
- The error texts of the crates and their mirrors say issue tracker, code host and recipe, and each error target is the new address. The descriptions of the MCP tools in `crates/shipyard-mcp/src/outside.rs` still say "workflow": a change there needs `docs/api/shipyard-mcp.yaml` too.
- `e2e/a11y.spec.ts` waits for a page at rest (no change of the page for 250 ms) before each scan. Before, a scan could start while a page still loaded: it missed the scroll area of Library / Data, which had no keyboard stop at 960 by 600 (fixed in `src/features/design/text-tab.tsx`), and it gave a false contrast fault on the deck face of Library / Slides.
- Pictures: `node scripts/screenshots.ts` made all 77 pictures again from the final tree; 79 of 80 screen entries have a picture.
- Picture 066 hides more places by role (for example Plan for the architect, Crew for the tester). The levels cannot hide Plan and keep Flow, because both read the area `work`. Only the viewer default changed. The rest needs a decision of the owner.
- Each German and Spanish text of the interface and of the guide is a translation by the agent, with the names of option 1 of `q:Q-172`, which is still open.
- Not pushed, no pull request, the change is not archived.

Checks, run by the lead on the final tree: see the last commit message of the wave and the final report of the session.

## Look pass 1, shell, tokens and shared parts (2026-11-19)

The pass set the tokens to the values of the design, replaced the top bar and the status bar by a rail and one top row, rebuilt the Ask bar and the first run, and gave each page the shared parts of the design. Tasks T038 to T044 of `tasks.md`. The pages of a place are not rebuilt: five later sessions do that on these parts.

Tokens (`src/ui/tokens/tokens.css`, `src/ui/tokens/fonts.css`): flat page background, one accent, one attention colour, near-black `primary`, Geist and Geist Mono bundled (`spec:design-system#REQ-003`), 15 px text, radius 12 px for controls and 20 px for cards. New tokens: `accent-tint`, `primary`, `primary-fg`, `attention-strong`, `rounded-field`, `text-15`, `text-17`, `text-30`, `text-44`.

Shell (`src/ui/templates/shell.tsx`, `src/features/shell/`): the rail is 72 px closed and 216 px open (the splitter sets 180 px to 320 px). The page area has the attribute `data-page-area` and starts with the top row. The first run and "No project is open" claim a bare page through `useBare()` of `src/features/shell/bare.ts`. The spec delta is `spec:shell#REQ-001`, `spec:shell#REQ-018` to `spec:shell#REQ-021`; `spec:shell#REQ-021` replaces the status bar requirement (REQ-007 of `shell`).

### Shared parts

| Part | File | Props |
|---|---|---|
| `Button` | `src/ui/atoms/button.tsx` | `variant?: "primary" \| "secondary" \| "ghost" \| "danger"`, `size?: "md" \| "lg"` (`lg` is 52 px), `busy?`, `reason?`, and the props of a button |
| `LinkButton` (new) | `src/ui/atoms/link-button.tsx` | the props of a button. The file also exports `linkClass` for a router link |
| `IconButton` | `src/ui/atoms/icon-button.tsx` | `label: string`, `shortcut?: string`, `reason?: string`, `variant?: "ghost" \| "outline"` |
| `Badge` | `src/ui/atoms/badge.tsx` | `variant?: "neutral" \| "you" \| "accent" \| "success" \| "warning" \| "danger" \| "info"`, `dot?: boolean` |
| `Avatar` | `src/ui/atoms/avatar.tsx` | `name: string`, `src?: string`, `size?: "s" \| "m"`, `agent?: boolean`, `className?` |
| `Chip` (new) | `src/ui/atoms/chip.tsx` | `selected?: boolean` (sets `aria-pressed`), and the props of a button |
| `Input` | `src/ui/atoms/input.tsx` | `label: string`, `caption?`, and the props of an input |
| `Segmented` | `src/ui/atoms/segmented.tsx` | `label: string`, `value`, `onValueChange`, `items: { value; label }[]` |
| `Progress` | `src/ui/atoms/progress.tsx` | `value: number`, `max: number`, `label: string`, `over?: boolean`, `className?` |
| `StepBar` (new) | `src/ui/atoms/step-bar.tsx` | `total: number`, `current: number` (1-based), `label: string`, `className?` |
| `Kbd` | `src/ui/atoms/kbd.tsx` | the props of `kbd` |
| `PageHeader` | `src/ui/molecules/page-header.tsx` | `title: string`, `count?: number`, `chips?`, `action?`, `menu?: PageMenuItem[]`, `back?`, `icon?` (draws nothing). It reads `PageSwitchContext` and draws the section switch in the title row |
| `SectionSwitch` | `src/ui/molecules/section-switch.tsx` | `label: string`, `items: SwitchItem[]`, `onSelect?`, `renderItem?` |
| `Card` | `src/ui/molecules/card.tsx` | `interactive?: boolean`, `pad?: boolean`, and the props of a `div` |
| `AttentionCard` | `src/ui/molecules/attention-card.tsx` | `who: string`, `title: string`, `children?` |
| `Row` (new) | `src/ui/molecules/row.tsx` | `render?: (props: RowProps) => ReactNode`, `className?`, `children` |
| `Option` (new) | `src/ui/molecules/option.tsx` | `selected?: boolean`, `trailing?`, and the props of a button |
| `Tile` (new) | `src/ui/molecules/tile.tsx` | `icon?`, `label: string`, `selected?: boolean` (sets `aria-pressed`), and the props of a button. The file also exports `TILE_GRID` |
| `StageLine` | `src/ui/molecules/stage-line.tsx` | `stage: Stage`, `mark?: Mark \| null` |
| `SettingsRow` | `src/ui/molecules/settings-row.tsx` | `id?: string`, `icon?`, `label`, `current?: boolean`, `children` |
| `BackLink` (new) | `src/ui/molecules/back-link.tsx` | `label: string`, `render?: (props: BackLinkProps) => ReactNode` |

Each part has an entry in `src/ui/gallery/gallery.tsx`.

### Moved controls: old control, new home

The test `src/features/shell/inventory.test.tsx` finds each control by its role and its name (`spec:shell#REQ-020`).

| Old control | Old place | New home | Role and name |
|---|---|---|---|
| Hide sidebar / Show sidebar | Top bar | Top row (banner) | button "Hide sidebar" |
| Back | Top bar | Top row | button "Back" |
| Forward | Top bar | Top row | button "Forward" |
| Ask bar | Top bar, right | Top row, after Forward | combobox "Ask or tell Shipyard" |
| Project picture | Top bar | Rail, in the project switch | part of button "Project <name>" |
| Project switch | Top bar | Rail, top | button "Project <name>" |
| Switch to a project | Menu of the project switch | Same menu | menuitemradio "<name>" |
| All projects | Menu of the project switch | Same menu | menuitem "Projects" |
| Open a local folder | Menu of the project switch | Same menu | menuitem "Open a local folder" |
| Clone a repository | Menu of the project switch | Same menu | menuitem "Clone a repository" |
| Close project | Menu of the project switch | Same menu | menuitem "Close project" |
| Remove from list | Menu of the project switch | Same menu | menuitem "Remove from list" |
| Working branch | Top bar | Card of the sync mark, and the action row of Code / Now | combobox "Working branch" |
| Sync state (link to Code / Now) | Top bar | Top row, right end: the sync mark opens a card | button "Sync state: <state>" |
| Sync | Top bar, split button | Card of the sync mark | button "Sync" |
| Ahead and behind counts | On Sync | On Sync, in the card | name "Sync 2 ahead 1 behind" |
| Fetch only | Menu "More ways to sync" | Card of the sync mark | button "Fetch only" |
| Push | Menu "More ways to sync" | Card of the sync mark | button "Push" |
| Files | Top bar | Ask bar, under Do. Door on Code / Now | option "Files", button "Files" |
| Terminal | Top bar | Ask bar, under Do. Action row of Code / Now | option "Terminal", button "Terminal" |
| More (Files, Terminal under 1100 px) | Top bar | Removed: its two items are in the Ask bar | option "Files", option "Terminal" |
| Account | Top bar | Rail, foot: the account row | button "Account <name>" |
| Setup / Me | Account menu | Account menu, header row | menuitem "<name> <role> Change" |
| Theme: Light, Dark, System | Account menu | Account menu, one segmented row | group "Theme", menuitemradio "Theme: Light" |
| Open the manual for this page (F1) | Account menu | Account menu | menuitem "Manual" |
| Keyboard shortcuts | Account menu | Account menu | menuitem "Shortcuts" |
| What's new | Account menu | Account menu | menuitem "What is new" |
| Replay the tour | Account menu | Account menu | menuitem "Show the tour again" |
| Commit | Status bar | Card of the sync mark. The commit box of Code / Now stays | button "Commit" |
| Changed files (count) | Status bar | Card of the sync mark | link "Changed files (n)" to /code/now |
| Lines added and removed | Status bar | Card of the sync mark | link "Changes: +5 lines added, −2 removed" to /code/now |
| Watch notice | Status bar | Card of the sync mark. Top row (hidden text) while the card is closed | status |
| Sync failure | Status bar | Card of the sync mark. Top row (hidden text) while the card is closed. The mark says "Sync failed" | alert |
| Retry action of the failure | Status bar | Card of the sync mark | button "<action>" |
| Version | Status bar | Account menu, row "About Shipyard" | text "Version <n>" |
| Health (worst finding, count) | Status bar | Account menu, last item | menuitem "Health (n)", link to the scope of the worst finding |

New in the account menu: Language (one item for each language) and Check for an update. The actions of the Ask bar keep their long names ("Open the manual for this page", "Keyboard shortcuts", "Replay the tour"). The dot for unread news and the dot for working agents are gone from the rail; their spoken texts stay.

### Open after look pass 1

Owner decisions:

- The field border `n-7` (`#D5D9E2` on white, about 1.4:1) is under 3:1 (WCAG 1.4.11). The value is from the design.
- No Sign out action exists, so the account menu has no "Sign out" row. The design shows one.
- The narrow bar preference has no effect now, and its row is still in Setup / Me, Look and layout: remove the row, or give it a new effect.
- The rail counts on Flow and Code stay as neutral tags. The design shows a count on Today only.
- The first run keeps ten roles ("Other" included); the design shows nine tiles.

Look, for the later sessions:

- The feature page has no `PageHeader`, so its section switch floats alone at the top right, and its title is not 44 px.
- The `Switch` atom keeps the old geometry; the design switch (52 px by 30 px track) is not ported.
- Dialogs keep the old look.
- The account menu covers the foot of the rail; the design draws it in the page area beside the rail.
- `PageHeader` and most page bodies keep their own side padding of 16 px; `main` has a small left padding so that the title is flush with the top row. A page body with no padding of its own starts 14 px left of the title.
- The place pages still use `bg-accent-gradient`, `bg-dots` and `shadow-glow`. `ticket-card`, `run-step`, `question-card`, `view-tabs`, `split-button` and `conflict-block` have the new look through the tokens only.
- Library keeps its back link above the page, not in `PageHeader.back`.

Function and tests:

- The open Ask bar is not a portal: it is an absolute layer in `[data-page-area]`, and it holds only while no parent between the bar and the page area has a position.
- `src/lib/themes/tokens.json` does not list the new tokens, and the `radius` of a theme does not set `--radius-field`.
- The list frames of Plan / Estimates, Plan / Timeline and the run history have a minimum height of 256 px, so that the larger title cannot shrink a table to zero (`e2e/work.spec.ts`). No shared frame part exists: a new page must do the same.
- The account row and the mock have no person name, so the row shows "Account".
- `pr_agent::tests::a_draft_posts_only_once_and_needs_a_click` failed one time in a full `cargo test` run under load and passed alone. No Rust file changed in this pass.
- Not checked in a real window: the Dark, OLED and System themes of each page, and the focus return after Commit from the card of the sync mark.

Docs:

- The 77 pictures of `docs/assets/screenshots/` are retaken from the final tree. SCR-097 (the card of the sync mark) has no picture and no scene in `scripts/screenshots.ts` (T045).
- The deltas of `sync` (REQ-013, REQ-017), `projects` (REQ-013), `code` (REQ-007, REQ-014) and `ux-declutter` (REQ-010, REQ-012, REQ-013) name the new homes. The delta of `ux-declutter` needs the archive of `change:update-ux-declutter` first: the capability has no base spec yet. The Purpose text of the base specs still says "status bar": the archive merges only the requirement blocks.
- The delta of `spec:design-system#REQ-001` gives the radii, the type sizes and the elevation tokens of `src/ui/tokens/tokens.css`.
- `q:Q-001` (Switzer) is folded with the answer "use Inter"; the delta of `design-system` replaces that answer with Geist.

## Look pass 2, Today and Ask (2026-11-19)

The pass rebuilt the screens of the group Today and Ask from the design pictures and checked each one by picture. Commits `31cad7ad`, `135e3678`, `8784f994` and `57065d01`.

### What the pass did

- Today (pictures 1, 19, 62, 65, 66, 92): the first view is "Needs you", with one question card (and the field "Another answer"), a short queue with "N more", Working now, one small setup card and one slim time card. News has "Tell me when" and one action for each kind of news. The role panels have role chips and the link "Panels for my role". The new page Role views is in Setup. A product owner sees the plan cards on Today.
- Ask (pictures 9, 63, 70): the answer of the Ask bar has Reply, Go to and Do, with "Start an agent on a ticket" and "Sync now". The full assistant is the page Ask (`/ask`) with "Small bar", three columns, the Codex trust card and Undo for the changed files. A link in the text of a manual page opens the card that explains it.
- Menu bar panel (picture 20): the project and the sync mark in the heading, the same list as Today, Agents with the spend, a pinned footer.
- Projects (pictures 18, 60, 61, 68, 98): the open project card and "Opened before" with Details. New project is a page with five steps and "All steps". "No project is open" is one card. The first run has the order of roles of the design with "I only look".
- Manual (picture 79): the pages by place, "Start", F1 for every role, the buttons under a page.
- Shell: the count shows on Today only; the account row shows the name; the account menu opens beside the rail; the Switch and the Dialog take the look of the design.

### Decisions

- The first view of Today is "Needs you".
- The time reminder and the setup card are small cards.
- Role views is in Setup, at `/setup/role-views`.
- New project is a page, and it makes the project at the end.
- The first run is for a first launch only. "No project is open" is a card (`spec:projects#REQ-001`, `spec:shell#REQ-019`).
- The Codex trust card keeps its sentence behind "What this writes". Nothing is written before the click.
- Shell changes: count on Today only, account row with the name, account menu beside the rail, the look of Switch and Dialog. See `adr:0023`.
- Spec deltas: `spec:projects#REQ-001` (first run), `spec:shell#REQ-019` (first launch only), `spec:app-redesign#REQ-005` (no "keep" for changed files).
- New screens: SCR-100 `home-dark`, SCR-101 `link-card`, SCR-102 `home-product-owner`, SCR-103 `role-views`, SCR-104 `home-panels`, SCR-105 `new-project-all-steps`. The other screens of the group updated their old entries.

### Open

Known differences from the design:

- Shortcuts and What is new stay dialogs: the design has no card part beside a menu.
- No Sign out row: the app has no such action.
- The Health row stays in the account menu.
- The tenth role "Other" stays in the first run.
- "Keep" for changed files does not exist, and `spec:app-redesign#REQ-005` still names it. Owner decision: add a keep operation, or change the requirement.
- The cards of earlier projects have no "needs you" chip: a project that is not open has no data.
- The Folder row and the multi-line brief texts stay in All steps.
- The Enter hint on the first row of the Ask list is not shown: Enter sends the text to the assistant unless an arrow key chose a row.
- The top row buttons and the project chevron stay: picture 001 shows them, other pictures do not.
- The Ask and Manual pages keep the top row.
- The section switch stays on the three views of Today (`spec:app-redesign#REQ-008`).
- The lead adds the screenshot scenes for the six new screens.

Checks, run by the lead on the final tree: passed `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --no-fail-fast` (app library 531; no Rust file changed in this pass), `pnpm typecheck`, `pnpm lint`, `pnpm test` (282 files, 2537 tests), `CI=1 npx playwright test` (143, on port 4211 through a scratch config because port 4174 was held by another session), `pnpm test:personas` (7), `openspec validate update-app-redesign --strict`. Picture check in a fresh context, four rounds: 61, 66 and 68 match; 9, 20, 60 and 63 are close; the others keep the differences of the Open list.
## Look pass 2, Crew and Plan (2026-11-19)

Branch `feature/app-redesign-look-2-crew-plan`, base `108fb9c4`. Three picture checks in a fresh context (Opus).

### What the pass did

- Crew and Plan now match their design pictures: 21 screens (4, 30, 101, 27, 80, 28, 29, 84, 13, 78, 83, 5, 99, 31, 93, 32, 14, 69, 72, 85, 94).
- Sub-pages with their own address and a back link, and no section switch: one person (`/crew/crew?member=`), a recipe step (`/crew/recipes?recipe=&step=`), the team file (`/crew/rights?page=team`), How agents do (`/crew/spend?page=how`), Budgets (`?page=budgets`), the usage tables (`?page=usage`), the ended sessions (`/crew/sessions?page=ended`), Dates and days off (`/plan/timeline?page=dates`), Send (`/plan/people?page=send`), one estimate (`/plan/estimates?task=`), the import (`?page=import`), the sheets (`?tab=summary`) and Costing (`?tab=costing`).
- New command `agents_stop_all` (Rust, binding and mock): it cancels each active run, review and estimate, and leaves the agents on.
- Docs: SCR-140 to SCR-156 added with their pictures, nine entries retitled, the guide in four languages, three changelog bullets in each language, a sentence and a scenario each in REQ-016 and REQ-033.

### Decisions

- Two agent controls: the Agents on switch in the header of Crew (stops every agent and new runs) and Stop all agents on Spend (stops each running agent; agents stay on).
- One section switch on a main page; a sub-page claims the switch and draws none.
- The moved controls are in a More menu: Crew (Live, Add a person), Spend, How agents do and Budgets (Show prices, Add a limit, usage tables), Estimates (search, filters, columns, sheet actions), Recipes (role files).
- Spend lists the six features with the most spend, then "<n> more", so Stop all agents stays in the window.
- Estimates and one estimate keep a Save: the form validates before it writes.
- Each session kind has its Stop in Sessions: run (with confirm), review, estimate, tile build (it runs in the job list of the reviews, so the stop of a review and `agents_stop_all` end it).

### Differences that stay

Source: the accepted list of the picture checks.

- No command or no data: Take control and live output (028); Accept and Refuse of a join request (084); Fill from my work and a Save button (032, each field saves on leave); Processor and Memory bars and tool calls under a step (078); Edit on Warn at and Then: Stop or Go on (013, 083); role buttons and the proposal agent (027); Kind and Runs beside other steps (080); Release and Go to Today (099); the "Plan and estimates" row of Rights (029).
- A demo data state: the day rate on 101 (seal open), the Seal card on 072, Many tasks at once on 085, the capture before a file is read on 094, only Create on 093, months and not weeks on 069.
- Chosen: the six features on 013, a Save on 014 and 085.

### Shared parts that lack something

- `AttentionCard`: `who` cannot be an agent avatar with bold text (013).
- `Switch`: the 52 by 30 px track is not ported.
- `PageHeader`: the back link sits above the title; `action` draws after the section switch. A menu item got an optional `reason` in this pass, and `attention-card.tsx` exports `ATTENTION_FRAME`, `ATTENTION_TINT` and `ATTENTION_FILL` so that a page keeps the attention colour rule.
- `Select`: no outlined button look (078).

### Open points

- Guide pages describe addresses and menus from the page sources; no one has read them against a running window.
- `agents_stop_all` stops runs, reviews, estimates and tile builds. A "Fix all with an agent" run is a run, so it stops too.
- The weekday buttons of Dates are read as their short name ("Mon"): a long name failed the axe check in French and German.
- The e2e ports 4174 and 4175 can be held by the server of another worktree. Run the e2e with a copy of the config on a free port in that case, and never stop the server of another session.

### Checks, run by the lead on the final tree

- Passed: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --no-fail-fast` (2064), `pnpm typecheck`, `pnpm lint`, `pnpm ipc:check`, `pnpm test:personas` (7), `openspec validate update-app-redesign --strict`.
- `pnpm test`: 2544 of 2545 in the full run; the one failure (`flow/board.test.tsx`, a 15 s timeout under load) passed alone, 16 of 16.
- `CI=1 npx playwright test` (on port 4213, see above): 144 of 145; the one failure (the gallery lost its dev server on the port 4175 that another worktree shares) passed alone, 19 of 19.
## Look pass 2, Library (2026-11-19)

The pass rebuilt each page of Library from its design file, on the shared parts of look pass 1 and the parts of `src/features/library/page-parts.tsx` (`LibraryPage`, `ListColumn`, `ListCard`, `SideCards`, `LinkedCard`, `PageColumns`). Four writers worked in four folders, then three rounds of picture checks (a fresh agent compared each capture with `docs/assets/screenshots/redesign/NNN-*.jpg`) closed most differences. Tasks T047 and T048 of `tasks.md`; the spec delta is `spec:app-redesign#REQ-034` to `spec:app-redesign#REQ-036`.

### Decisions of the lead

- The shared layout parts of the group live in `page-parts.tsx`; the other writers import them and do not edit them.
- New addresses: Map of the code `/library/graph?source=code`, Flow matrix `/library/flows/matrix`, Edit a dashboard `/library/dashboards/$slug/edit`, What is tested `/library/test-plans/coverage`, report forms `/library/reports/$form`. Each has a back link and is not a dialog.
- An open item stays in the address where the page of before did it; else the mechanism of before stays.
- The mode switch (Picture, Both, Text; Read, Text) sits in the header row or the detail card header beside Edit. The stored choice stays.
- Ref chips and file chips leave the headers: Copy the reference and Copy the file name are in the More menu.
- The primary action is the near-black `Button variant="primary"` with a plain verb.
- An action of the design with no function today is not drawn: it is listed below as not built.

### Screens

Result of the last fresh-context check (round 5, 2026-11-20). Two fixes came after it and were checked by the lead on a capture: the Mermaid preview of Diagrams (038) and the tile title in edit mode (086). "Differs" lists what stays and why. A "..." page menu on each page holds the controls that the design does not show: that difference is accepted on each screen.

| Screen | Address or steps | Result |
|---|---|---|
| 006 Library | `/library/home` | Match |
| 015 Map | `/library/graph` | Close: the Knowledge segment is tight (`src/ui/atoms/segmented`) |
| 016 Architecture | `/library/architecture` | Differs on purpose: opens on Picture, the design shows Both. `spec:app-redesign#REQ-021` wins. A fourth zoom button (Fit) keeps the fit function |
| 033 Specs | `/library/capabilities` | Differs: no Changes in progress card in the demo (the demo change broke mock tests of other areas); no Build pill (no stage) |
| 034 Questions | `/library/questions` | Close: Export has an icon (`PageExport`) |
| 035 Test plan | `/library/test-plans` | Close |
| 036 Project rules | `/library/constitution` | Close: no Earlier versions card (no history function) |
| 037 Decisions | `/library/decisions` | Close: the demo shows the section names of its file |
| 038 Diagrams | `/library/diagrams` | Differs: no Zoom and Fit rows on the grid page (they live on the open canvas) |
| 039 API | `/library/api` | Differs: Try it keeps the server, method and path fields of today; no Add export endpoint link (no function) |
| 040 Data | `/library/data` | Close: a fourth zoom button (Fit) |
| 041 Network flows | `/library/flows` | Close |
| 042 Screens | `/library/screens` | Close |
| 043 Handbook | `/library/handbook` | Differs: no History and author line (no function) |
| 044 Documents | `/library/documents` | Differs: no Add a file and no Word or PDF download of one document (no function) |
| 045 Slides | `/library/slides` | Differs: no Speaker notes, Edit, Planning and Costing slides on a Markdown deck (no function); Find a deck stays |
| 046 Learn | `/library/learn` | Differs: no Experts card, no Add a word, no person chip and New path in the header, no second pill on a step |
| 047 Dashboards | `/library/dashboards` | Differs: no Reports segment and no release picker; tiles show the bar lists of today, not a chart box |
| 071 Reports | `/library/reports` | Differs: no PDF and Markdown formats, no dates in Written for you, no Costing card (the reports of today are listed) |
| 075 Map of the code | `/library/graph?source=code` | Differs: no Stale chip (no flag on code), no Who calls it when the symbol has no caller |
| 077 Flow matrix | `/library/flows/matrix` | Differs: no Check against the code, no Not in the code chip and no alert card (no function) |
| 086 Edit a dashboard | `/library/dashboards/team/edit` | Differs: no Pin to Today for a whole dashboard; the kind chips of today wrap the Build button to a second row |
| 095 What is tested | `/library/test-plans/coverage` | Differs: a long Not covered card makes its row tall, so the second row is below the fold |
| 096 Report forms | `/library/reports/change-request`, `/library/reports/work-done` | Differs: no PDF switch and no Fill row for the complete dossier (no function); the Written card shows after a write |

### Shared parts that lack something

- `src/ui/atoms/segmented`: the white segment of Knowledge and Code is tight.
- `PageColumns` and `LinkedRow` in `page-parts.tsx`: fixed column widths and large chevrons.
- `PageExport` (`src/features/reports/`): the Export button has an icon that the design does not show.
- The pins and the recent pages of Library keep pages, not items.

### Open points

- A person name for the avatar of Written for you: the row shows "Shipyard".
- The demo mock has no finished change, no screen without artifacts and a Reports dashboard (the slugs are `team`, `team-delivery`, `team-quality`, `team-agents`).
- Not built, no function: Add a word, Add a file, History of a page, Earlier versions of the rules, Speaker notes, PDF and Markdown reports, Check against the code in the matrix.
- The shared `PageHeader` (`src/ui/molecules/page-header.tsx`) keeps its action row and menu on one line now: this changes the header of every page.
- The zoom controls (`zoom-frame.tsx`) and the Mermaid viewer are shared with the Design section of the feature page.
- The pictures of the Library scenes are retaken from this tree. Scene `tile-build` now opens the edit page of the dashboard.
## Look pass 2, Code and Setup (2026-11-20)

The pass rebuilt the 19 Code and Setup pages from the design source (`T047`). Branch `feature/app-redesign-look-2-code-setup`, base `feature/app-ui-ux-redesign-df0d13` (108fb9c4). Screen ids SCR-180 to SCR-184.

What changed:

- Code / Now is a short summary: the files to commit, the pull requests and the Product health row. The staging tool is the page `/code/changes` with a back link to Code.
- History shows five commits and "Older commits". Branches is a grid of branch cards. Terminal has the Files card, the tabs and the command bar with "Ask an agent to run it".
- Setup keeps the title "Setup". Each scope has pills for its sub-pages and two columns of cards. No door replaces the page, and no anchor bar shows.
- New pages: `/setup/project?page=automation` and `/setup/project?page=plugins` (screen 88). The old page id `connections` of This project goes to the card on Details.
- The health of this computer counts a missing required tool as a problem, with "Fix it". Before, it said "Nothing to fix".
- The Setup parts are in `src/features/settings/parts/`: `Columns`, `SetupCard`, `SetupRow`, `ValueButton`, `Stepper`, `Toggle`, `StatePill`, `SetupPills`.

Picture check: an agent in a fresh context compared each capture with its design picture at the same size.

| Screen | Address | Result |
|---|---|---|
| 7 Code | `/code/now` | match |
| 52 Local changes | `/code/changes` | match |
| 48 History | `/code/history` | match |
| 49 Branches | `/code/branches` | difference: the line "main is the default branch of origin" stays (a safety notice); no owner badge (the branch data has no owner); Rename stays on a merged card |
| 51 Terminal | `/code/terminal` | match |
| 8 Setup | `/setup/start` | match |
| 54 This project | `/setup/project` | difference: the More card holds the rows of today, so "Import a project" is below the height of the picture |
| 55 This computer | `/setup/computer` | difference: the Security card starts below the height of the picture |
| 56 Models and rules | `/setup/computer?page=models` | match |
| 57 Extensions | `/setup/project?page=extensions` | difference: the Automation pill shows (design 54 has it); the row "Plugins and rule packs" is below the height of the picture |
| 58 Me | `/setup/me` | match (no "A budget reaches 80 %" row: no such event exists) |
| 59 Health of this computer | `/setup/computer?page=health` | match |
| 76 Automation | `/setup/project?page=automation` | difference: the limits by stage and the full status mapping stay behind "Edit" (the setting is per state, not per stage); the note "Off means: the agent asks in Today" is not shown (no helper text) |
| 82 Look and layout | `/setup/me?page=look` | match |
| 87 Share Shipyard | `/setup/computer?page=share` | match |
| 88 Plugins and rule packs | `/setup/project?page=plugins` | difference: the review keeps a check box for each item, the refused list and the previews (a person can apply a part of a plugin); the buttons show the count |
| 89 Tickets | `/setup/project?page=tickets` | difference: Unit has a third choice "None" (else "no estimate" cannot be set); no "Add" for the kinds (four fixed kinds) |
| 91 Health of this project | `/setup/project?page=health` | match |
| 100 Logs and feedback | `/setup/computer?page=logs` | difference: one more card of today below Personas and Feedback |

Not built, because no command, setting or data exists: Sign out, Sound, Release channel, Portable mode, Change of the data folder, Attach a file, Remove of a connected AI tool, the model button of an agent role.

Shared files touched: `src/app/router.tsx`, the i18n files of the areas (four languages), `src/lib/ipc/mock.ts`, `mock-code.ts`, `mock-agents.ts`, `mock-extensions.ts`, `mock-factory.ts` (a budget on the demo recipe), `mock-delivery.ts`, 9 e2e specs, the developer and tester walks, `scripts/screenshots.ts`, `docs/designs/screens.json`, the guide of Code and Setup in four languages, both changelogs, the spec delta, `tasks.md`. Smallest fixes in `src/ui/`: `tokens/tokens.css` (the accent swatches read the accent token) and `molecules/attention-card.tsx` (exports the outline classes), so that the tokens test keeps its rules. Join edits in `src/features/work/ticket-detail.tsx`, `src/features/projects/project-details.tsx` and the tests of home, reports, rights and shell.

Shared parts that lack something:

- `Segmented` has no width prop and no name for each item.
- `SetupCard` has no slot for a big title or a pill. `SetupRow` has no row that runs an action with a chevron.
- No dark card, tab pill, warning icon, swatch or theme tile in `src/ui/`: the pages use local classes.
- `Button` draws a disabled primary button grey: the Commit button looks grey while the message is empty.

Open:

- The plugin that waits for review is kept in `localStorage` (`shipyard.plugin-waiting`), because no command holds it.
- "Ask an agent to run it" and Rename of a branch open the assistant with the text filled in; the person sends it.
- The demo data holds a conflict file, so Commit in the card of the sync mark is off until the conflict is solved.
- The rtk hook rewrites `pnpm lint` to eslint: run `rtk proxy pnpm lint`.
## Look pass 2, group Flow and the feature page (2026-11-20)

Branch `feature/app-redesign-look-2-flow`, cut from `feature/app-ui-ux-redesign-df0d13` (`108fb9c4`), local commits only. Not pushed, no pull request. The brief is `.agents/progress/redesign-look-2.md`.

What the pass did:

- Flow (`src/features/flow/flow-page.tsx`, `feature-card.tsx`, `list-controls.tsx`): the title row holds the filter All / Needs me / Mine (a chip group, as wide as its labels), the view switch, "+ New" and More. A card is one target with the title and one line (the avatar or the agent tile, the state). The page scrolls as one page; each column ends after its last card. List is one table with the pill filters and "Bring a ticket by its key". Done is one list with the columns Feature, End, Who, Cost, the end filter and "Start again".
- Moved controls: "Agents on" and "Find a feature" are items of More on Flow; the Ticket field with "Start run" is "Find a ticket" with "Start an agent" on New feature (`/flow/new`); the search of the run history is "Find a finished feature" on Done; the extra history columns are in More of Done; "What happened" of a stop card is in More of the feature page.
- The feature page (`src/features/flow/feature/`) draws one section switch only (`spec:app-redesign#REQ-001`), with no switch of the place. Each section has its own file. The stage line shows on Story, Brief, Changes, the plan review, the ticket page and the stop cards; Design, Checks and Chat have none, as the design.
- New pages, each with its address and its back link: `/flow/feature/$featureId/impacts`, `/impact-report`, `/files`, `/spec`; `/flow/impacts/report`; `/code/pull-requests` (Pull requests, with the review panel); `/code/pull-requests/new` (New pull request, a page in place of the dialog). The ticket page is `/flow/feature/wi:<key>?ticket=true`; "Edit the ticket" and a `wi:` ref open it.
- Chat is never blank: the bubbles of the session, the composer, the Recipe card and "For developers" (the event log, the requests and cost, the sessions).
- Health is one grid of tiles for the checks and the scanners, with the bottom row (Run all, Set up the scanners, Security score, Export the list of parts) and "Commands of the gates".
- Texts: one file for each writer group in `src/lib/i18n/flow-look/` (four languages each), read as `t.flow.look.<group>`.

Decisions of this pass:

- The More button at the end of a title row is the home of the moved controls. The design does not show it.
- The demo feature ACME-2 has no spec change: the Crew / Live test of another session needs that. The demo spec `add-export` cites ACME-3.
- The demo of the design tokens is set in the Design test (a spy), not in `mock-design.ts` of the Library group.
- A demo main branch "behind" renamed the Sync button and broke tests of the shell group: the New pull request test sets that state with a spy.

Checks on the final tree (`eb9df05b`): `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --no-fail-fast` (2061; no Rust file changed), `pnpm typecheck`, `pnpm lint`, `pnpm test` (283 files, 2567 tests), `CI=1 npx playwright test` (143, on a copy of the config on port 4206), the persona walks (7, on port 4207) and `openspec validate update-app-redesign --strict` passed. A review in a fresh context (Opus) found no security defect and four other defects, all fixed with tests: a typed answer that a failed call cleared, the pick of a recommended option with the unclear and edited notes, the elapsed time of a run, and the back link. The picture check ran five times in a fresh context (Opus): 130, 111, 97, 96 differences in rounds 1 to 4; round 5 used captures at the full height of each design picture. The test audit ran five times: each dropped check came back on its new control, and each weakened check became as strict as before.

Open after look pass 2 (group Flow):

- No command exists for: Pause, Take it over, a limit for one run, Run again of the code host checks, the first error line of a check, Add a document, attach in Chat, the author of a pull request (row avatar), the answer options of a spec question, the Reviewers and Merge with rows of New pull request, the owner and the checkbox of a plan line, the columns "Code that depends on them" and "Features that share these files", the ticket fields Kind, Owner, Release, Estimate, Recipe and the two agent switches.
- Shared parts outside this group: `src/ui/molecules/stage-line.tsx` has no orange "Build, blocked" tone; `src/features/sync/ticket-thread.tsx` keeps the order and the controls of the ticket fields; `QuestionRow` of `src/features/home/inbox/` keeps its option panel (the stop card shows the options in a Choices menu).
- The demo mirror starts empty, so the ticket rows of New feature do not show in the demo (a unit test covers them).
- The demo Review column has 10 cards; the design has 2.
- `src/features/code/pull-header.tsx` has no user now (the Code and Setup group owns it).
- `src/features/code/now.tsx` still draws the old pull request list; one line there must link to `/code/pull-requests` (the Code and Setup group).

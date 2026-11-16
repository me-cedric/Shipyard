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

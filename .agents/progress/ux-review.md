# UX, UI and agent experience review (2026-11-26)

Branch: `feature/design-review-ux-improvements-1bae75`, from `main` at `73c4e988`. The change is not committed.

## Goal

A full review of each screen and each state of the app after the redesign. The app must be easy for a person with little technical knowledge, and must keep each function for an expert. The review also covers the atomic structure of `src/ui`, the design skills of agent compass 1.3.0, and the tools and texts that an agent reads.

## Method

1. Baseline: all gates passed on the clean tree.
2. Review: 10 reviewers in fresh contexts (Today and shell, Flow and a feature, Crew and Plan, Library, Code and Setup, design system, agent experience, copy in four languages, accessibility, a click crawl of each page). Result: 222 findings, 18 of them P1.
3. Fix wave 1: five writer lanes, each with a fresh-context review and one repair round. About 170 findings fixed.
4. Fix wave 2: four writer lanes (accessibility, crawl, copy, handoffs of wave 1), then the atomic structure alone.
5. Final review of the whole diff in six areas: 33 findings (1 P1, 11 P2). All 33 fixed, each fix checked in a fresh context.

## What changed

- Confirmations: stop of a session, stop of all agents, take over of a run and Rebalance ask first. A form with typed text asks before the person leaves.
- Today: an answered question leaves Needs you. A card names the agent, not the recipe id.
- Flow: Create opens the new feature on its Brief. A blocked card shows the reason of the agent. A change with no heading shows a title in plain words.
- Code: a commit message and a branch name in plain words are accepted. A dirty-tree error says which files block the action.
- Setup: the Share page shows the real state of the server, with Check and Copy access token in the address card.
- Accessibility: the focus returns to the opener of the assistant panel and of a link card. The page title and the announcement follow the page. The rail grows with the text size. No page scrolls sideways at 960 by 600 or at 200 % zoom.
- Copy: about 170 labels and error texts changed in English, French, German and Spanish. The manual follows.
- Agents: tool inputs have descriptions, an error says the cause and the next step, a cut answer ends with a `[cut: ...]` line, and a refusal names the switch with the words of the Share page.
- Atomic parts: the Library page template is in `src/ui/templates/library-page.tsx`. New shared parts: `Fold`, `Stepper`, `DateButton`, `SetupCard`. Twelve parts with no caller are deleted. `ZoomFrame` is an organism.

## Decisions

- `Board`, `ListDetail`, `Settings` and `BoardColumn` stay, with their gallery rows and tests: `spec:design-system#REQ-005` and `spec:design-system#REQ-006` require them. They have no caller in a page.
- The comment button of a diff line is 24 px, not 44 px: a 44 px button doubles the height of each line.
- The hit area of a splitter is 12 px in the rail and in the inspector, and 6 px in the other places, so that it takes no click from the content.
- Four compass files are now owned by the project (`exclude` in `.agents/compass.json`): the React rule and the e2e skill, in `.claude` and in `.agents`. The lock is in sync.
- The ten folds in chat and stop cards keep their own look. They do not use `Fold`, which is a Setup row.

## Later the same day

- An error with no code shows one plain sentence. `ErrorNotice` holds the raw text behind Details with Copy, and the app log gets it. The mock now fails with typed errors, as Rust does, so a sentence that the interface writes shows as written.
- A feature page has Link a screen and Link a diagram. The pick writes the ref in the proposal of the change with the stamp.
- Outside agents have `ref_read` (`spec:refs#REQ-015`, change `add-outside-ref-read`). It is in the Read files group, obeys the hidden areas and the switch of the source of an item, and gives no file content.
- A broken link in Project health names its target in words. The session panel has an edge. An e2e test covers the splitter hit area of the rail.

## Checks (last run)

| Check | Result |
|---|---|
| `pnpm typecheck`, `pnpm lint` | passed |
| `pnpm test` | passed, 2897 tests |
| `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings` | passed |
| `cargo test --workspace --no-fail-fast` | passed, 2203 tests |
| e2e (own config, port 4493) | passed, 151 tests |
| persona walks (own config, port 4494) | passed, 7 walks |
| `node docs/agent-compass/bin/ac.mjs check --frozen` | passed |
| `openspec validate --all --strict` (pinned 1.15.0, as the app runs it) | passed, 36 items |
| `pnpm ipc:gen` | the generated file does not change |

## After the first try of the build (2026-11-26, evening)

- Code / History draws the commit graph with curves. A test checks that no line of the graph ends in the air; the same check passed on the 600 newest commits of this repository.
- Active sessions: the Claude desktop app is not a session, Claude Code of the desktop app is one, and the process list reads a short process number. On this computer the list went from ten empty rows to the three real sessions.
- A missing right has the error code `missing_right`. An error with no code keeps its cause after the sentence where a view has no Details control: the interface has no log file.
- The owner answered Q-140, Q-154, Q-164 and Q-177. No question is open. The creator names the admins of a new team. German and Spanish were reviewed (about 220 strings changed).
- Semgrep with the five rule packs of CI: 0 findings. Its own download fails on this network (strict certificate check of Python); the rule packs were fetched with curl, with certificate checks on.
- Worktrees: only `main` and this session's worktree are left.

## 2026-11-27

- An admin, and a person who works alone, keeps all rights whatever the personal role (`spec:team-rights#REQ-006`, decision of the owner). The read-only profile still lowers each person.
- 14 built spec changes are archived by hand, as commit `abdf273a` did: 15 new capability folders in `docs/openspec/specs`, and merges into `factory`, `projects`, `shell`, `code`, `delivery`, `refs`, `work`, `sync` and `questions-loop`. Open changes: `add-azure-sign-in`, `add-windows-relay-pipe`, `update-app-redesign`.
- Terminal apps: Wave, Hyper, Tabby and Rio are found, and "Choose an app" keeps a hand-picked app.
- A row never leaves its card: the shared row has a width that a caller class cannot widen, and a guard test scans the source. A measure of 58 pages and 1044 rows in a browser build found 0 rows outside their card.
- A move to another page or sub-page starts at the top. A missing right shows as a plain sentence. Setup / Me shows an Admin badge.
- A check of the atomic structure and of the design skills on the later commits found 8 defects; all are fixed.
- Wave takes no folder from another app (it declares no document type and no URL scheme, and its `wsh` helper works only inside Wave). Shipyard opens Wave, puts `cd '<folder>'` in the clipboard and shows a notice. `terminal_launch` returns the folder that the app did not take.
- Today / Working now and the runs panel of a role show the newest run of each ticket only: an old failed run showed beside a newer run before.
- The built app was checked through its outside server in a portable copy with its own data folder: sign-in, 13 tools, `ref_read`, and the refusals for a path outside the project, a switched-off tool and a call with no token.

## 2026-11-27, later

- About 100 places that showed a failed command as a string now use `ErrorNotice`: four writer lanes by folder, each with a review in a fresh context, then one pass for the 3 defects and the 12 missed places of the reviews.
- A check of a real run (`Security scan findings`) found two engine defects. The reviewer got the first 40 spec files of the project as its criteria: it now gets the spec changes of its ticket (`spec:delivery#REQ-002`). A fix round ran each task of the plan again in a new worktree: one builder now fixes the findings in the run worktree (`spec:delivery#REQ-004`).
- Crew / Recipes: Remove on each step and the budget of the recipe on the chain page. Edit of the limit of each feature opens that budget. `workflows_list` gives the budget of each recipe.
- The Story line of a report is the first sentence of the agent. The Brief card has no "No spec yet" past Spec.
- A hand-picked Wave starts as the detected Wave. The Windows `ask` of the relay has the 120 s wait (`add-windows-relay-pipe` T006).

- The same run stopped at its gates: git starts a worktree with empty submodule folders, and `shipyard-app` reads a file of `docs/agent-compass` at build time. A new worktree now gets a local copy of each submodule at the pinned commit, with no network (`crates/shipyard-git/src/worktree.rs`).
- The stop card: the headline of a stop is the first line of its cause, the agent name is the next step that is not done, and the ticket rows show the recipe of the run and turn Start run off while a run works.

- Owner decisions of 2026-11-27: the border of a form field reaches 3:1 (token `--field-line`); the Narrow top bar switch is gone, with its stored value; the Azure sign-in is set aside (`docs/openspec/deferred/add-azure-sign-in`) and `adr:0017` is accepted; a run agent keeps each MCP server of the person.

- `update-app-redesign` is archived by hand (`docs/openspec/changes/archive/2026-11-27-update-app-redesign`): the new capability `app-redesign` with 37 requirements, and merges into `code`, `design-system`, `factory`, `projects`, `shell` and `sync`. One spec change is open: `add-windows-relay-pipe`. In the archived copy, 29 acceptance boxes stay open: no single test proves each of them.

- Acceptance proof: each of the 28 open acceptance boxes of the redesign has a test (15 new test cases in 7 new `acceptance.test.*` files, the others existed). The table is in `docs/openspec/changes/archive/2026-11-27-update-app-redesign/acceptance-proof.md`.
- Screen pass: three reviewers read the 131 screen pictures of the current build and reported 93 findings. Checked against the pictures and the code: 11 layout defects are fixed (commit row, stat cards, month strip, Skip, scope cards, empty tile, bar names, answer box, rights rows, link card buttons, plugin cards). The other findings are false (the fold of the window, a popover, text that the screenshot script types), a house rule (`80 %`, product words) or a wording proposal with no decision: the list is in the journal of workflow `wf_8bf81d14-1ea`.
- CI on `6115f472`: the five jobs passed, the Windows relay job included.

- Second pass on the screen findings: six writers gave each of the 93 findings a verdict with evidence. 37 fixed, 6 more fixed by the lead (they were outside the writers' folders), 3 fixed before, 31 false or by rule, 3 demo data, 13 wording only. The accessibility tests then caught two of the new changes (a title button under 44 px, a slide name that did not hold its text): both are undone.
- Wording: two English texts changed (`Checks running`). 28 other proposals are not applied: they change product words or a text that a test fixes. The list is in the journal of workflow `wf_b996dddf-73e`.
- Design census on the browser build, 58 routes in the dark and the light look (116 page views, 7052 text nodes): two font families (Geist, Geist Mono; 4 nodes in the system font), each text size and each radius on the token scale, no sideways scroll. The script is not in the repository.
- Atomic layers: `src/ui/layers.test.ts` checks that no layer imports a higher layer or a feature (130 files, 0 faults).
- CI on `b9a2d616`: passed.

- The owner gave Screen Recording access. A picture of the real window of the built app (a portable copy with its own data) showed two defects of Code / History that the browser pictures do not show: both are fixed. Accessibility access is still off, so no tool clicks in the window.
- Windows relay tests (T005): two tests prove the relay with a real server process on each system, through the example `fake_mcp`; a third reads the access list of the pipe. They are in two local commits. The push is refused by the company proxy (Zscaler, HTTP 403 on the upload), so the Windows job has not run them.

- The owner gave Accessibility access. A walk of the real window of the built app (portable copy, real clicks, 21 pictures of the seven places and their section tabs) found five defects that the browser checks do not show at the default window size: the fifth stage of Flow was cut, the section tabs moved sideways between the pages of a place, Crew / Sessions said No sessions above four sessions, a session showed `<synthetic>` as its model, and the actions of a Setup step sat at the fold. All are fixed and seen fixed in the real window.
- Windows relay tests: the Windows job ran them on the temporary branch `ci/windows-relay-tests` and passed. Task T005 of `add-windows-relay-pipe` is done.

## Open

1. `add-windows-relay-pipe`: each task is done. The change waits for its archive.
2. An agent of a run starts with each MCP server of the person's own Claude Code set-up. The owner keeps it so (2026-11-27).
3. The comment button of a diff line is 24 px, by decision (see Decisions).
4. The browser mock does not lower the rights of a member who is not an admin from a personal role.
5. The walk of the real window covered the seven places and their section tabs on a project with no ticket and no run. The pages of a feature and of a run were checked in the browser build only.

## Next session (stopped on 2026-11-27: weekly usage at 85 %, context of the session full)

State: the code of `main` is at `3cb8949f`, CI green on five jobs, the build of that commit is installed. A later commit changes this note only.

1. The six pages of a feature (Story, Brief, Design, Changes, Checks, Chat) are walked in the real window of the build of `3cb8949f` (2026-11-27, portable copy, feature "Windows relay pipe" of an older clone): each page fits the window, the tabs do not move, each empty page has one action. No defect. Still open: the pages of a run in the real window. Use the portable copy in the session scratch folder pattern: a copy of the built app beside a file `portable` and its own data folder, started as a background task. `screencapture -l <window id>` gives the picture, a small `CGEvent` click helper gives the clicks (Accessibility and Screen Recording are granted). A run page needs a run: start one only on a throwaway project with the owner's yes, because it spends money.
2. Wording proposals of the screen review, each with a verdict (30 entries, 2026-11-27). Applied: `Checks running` (two keys had `Checks run`). Kept as they are, with the reason:
   - Product words and names of the app: Recipe, `Limit`, `Handle`, `Other` (the role of a person who picks none), `Keep a receipt`, `Source off: {name}` (the French form needs no gender), `Set up`.
   - A text that a test fixes by decision: `Unrated`, `This item is in the project.`, `Open` (also the name of the list of open projects).
   - Pages for an expert, where the exact word helps: `Server on`, `Agents that use the Shipyard MCP server`, `Check before it applies`, `Package`, `Deploy to {count}`, `Scenarios with no Then step`, `main` and `HEAD` as version values.
   - A label that is right in its row: `Agents` in the tray (it names the switch too), `Usage` as a column, `Day rate`, `Missing: {name}`, `Blocked: the agent cannot go on`, `Review` and `Reply`, `Labels` and `Reviewers`, `Export`, `This is true only if`, `Reports with no form`, `Status in the issue tracker, stage in Shipyard`, the title and the buttons of the close question.
3. `add-windows-relay-pipe` is archived by hand (2026-11-27): the capability `windows-relay` is in `docs/openspec/specs`, each box is ticked with its test, and no spec change is open.
4. Atomic audit past the import direction, run on 2026-11-27: 118 shared parts, no raw colour and no raw size in `src/features` or `src/ui`. Gaps: 32 parts had no gallery row, and six components that three or more features share were in a feature folder (`shell/no-project`, `settings/parts`, `settings/picture-field`, `reports/page-export`, `shell/ref-page`, `onboarding/checklist`). Result: `settings/parts` and `settings/picture-field` are in `src/ui` now; each shared part has a gallery row or a reason in `NO_GALLERY_ROW` of `src/ui/gallery/coverage.test.ts`, and that test fails for a new part with neither. `HtmlPreview` has no row: axe cannot read inside its sandboxed frame, and the gallery accessibility test then hangs. Left in their feature folder, because each needs feature code: `shell/no-project`, `reports/page-export`, `shell/ref-page`, `onboarding/checklist`.
5. Tell the owner again: stop the blocked run "Security scan findings" and start a new one (its folder has no submodule files).
6. The Linux Rust job of `a95eb8a0` failed on one flaky test (`Text file busy` at the start of a fake program). Cause: a write handle of the test process leaked into the fork of another test thread. `shipyard_agents::fake::program` now writes the file through a shell.

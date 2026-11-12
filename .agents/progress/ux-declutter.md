# UX declutter (branch `feature/ui-ux-improvements-declutter-ccbcbc`, base `main` 12f47ce7)

Goal of the owner (2026-11-12): declutter and remove duplicates, make navigation and the first run easier, add consistent motion. No feature is lost. Sonnet medium workers, Opus high reviewer, two agents at a time.

## State

- 2026-11-12: audit done (two read-only agents and the screenshots). Draft plan below. Questions sent to the owner. No spec and no code yet.

## Audit findings

### First run

- F1. Home / Today shows two checklists with the same items: `SetupCard` (`src/features/onboarding/setup.tsx:75-80`) and `GetStarted` (`src/features/home/get-started.tsx:98-129`). Each decides "done" in a different way (a connection exists or the project is linked; a default agent is set or a tool is detected; an admin exists or a member exists).
- F2. The tour opens on top of the first-run page at the same moment (`tour.tsx:55-57`, `app/views.tsx:10-24`). Both offer New project. The tour sends the person to `/home/projects`, but the first-run page is on `/home/today`.
- F3. A setup action calls `closeTour()` (`setup.tsx:128`) and does not set `tourSeen`: the tour opens again at the next launch.
- F4. The AI item says "Sign in" (`setup.tsx:153`) but "done" means a default agent is set.
- F5. The permissions list is empty while it loads (`permissions.tsx:79`).
- F6. "Install {name}" runs in one click with no statement of what it installs (`get-started.tsx:122-126`).
- F7. Three copies of the no-project gate (`work/no-project.tsx`, `specs/no-project.tsx`, `code/project-gate.tsx`). They offer Open folder only, not Clone or New.
- F8. Factory / Runs with no AI tool: "No runs", and Start only focuses the field (`runs.tsx:173`).
- F9. The first-run role step has no Next button: it saves on click (`first-run.tsx:159-198`).

### Chrome and duplicates

- C1. The top bar holds about 21 controls (`src/features/shell/context-bar.tsx:111-289`).
- C2. Counts shown in two or three places: live runs (top bar, Home tiles, Today panel), needs-you (top bar, Home tile, Today), sessions (top bar popover, Factory / Sessions), spend (Home tile, role panel, Factory / Usage), repo state (top bar chip, status bar, Code / Local changes).
- C3. Terminal: the drawer and the Code / Terminal tab draw the same screen.
- C4. Manual: "?" in the top bar and the Knowledge / Manual tab.
- C5. Theme: the top bar cycle and Settings / Me.
- C6. Fetch and push: the Sync menu and Code / Branches.
- C7. Project actions: the project switcher and Home / Projects.
- C8. Settings in two places: issue tracker and code host pick (Project and Connections); notification and assistant overrides (Project and Me); Setup (Today and Me).

### Consistency

- K1. Page headers: `PageHeader`, `ListDetail` with a header, `ListDetail` with a hidden `h1`; some tabs have none.
- K2. Loading: `Loading`, `Skeleton`, `return null`. Empty: `EmptyState` and bare text.
- K3. Tables: `DataTable` and raw `<table>` (`work/time.tsx`, `team-rights.tsx`, `learn-paths.tsx`).
- K4. A second tab layer (`ViewTabs`) in 12 places, with no duration token (`view-tabs.tsx:39`).
- K5. `SectionNav` only on three Settings pages; two Settings pages build rows by hand.

### Motion

- M1. No motion: toasts (`toaster.tsx:25`), list removal (only `runs.tsx:223`), loading to content.
- M2. Width transitions, not springs: sidebar (`ui/templates/shell.tsx:55`), inspector (`inspector.tsx:49`).
- M3. Six places read only the OS reduced-motion setting, not the motion preference: `motion.ts:22`, `count-up.tsx:15`, `section-nav.tsx:40`, `run-graph.tsx:102`, `use-animation.ts:4`, `graph-canvas.tsx:223`.

## Draft waves (final after the owner's answers)

1. First run: one checklist with one rule for "done", tour timing and `tourSeen`, one no-project gate with the three ways to open, the small fixes F4 to F9.
2. Top bar and duplicates: group the controls, fold what the owner agrees to fold, keep each action reachable.
3. Consistency: one header pattern, one loading and one empty pattern, section list on each Settings page.
4. Motion: one motion-preference hook, toasts, list removal, loading to content, panels on springs.
5. Docs and gates: specs, test plans, `screens.json`, screenshots, changelogs, full suite, Opus review.

## Open questions

None. The owner answered on 2026-11-12:

1. Checklist: one "Get started" card on Today with one rule for "done"; Settings / Me shows the same card; it hides when all is done.
2. Tour: opens once after the first project is open, not at the first launch. Replay stays in Help, the palette and Settings / Me.
3. Counters: one Activity button with one count and a panel with three parts (Needs you, Runs with stop, Sessions with stop). The bell stays apart.
4. Right end of the bar: one avatar menu (Settings / Me, Theme, Manual, Shortcuts, What's new, Replay the tour). The "?" and theme buttons leave the bar. F1 and the palette stay.
5. Twin tabs: Code / Terminal and Knowledge / Manual leave the tab bars. The old addresses open the terminal drawer and the manual.
6. Home tiles: removed. My items and Spend today move into the headings of their panels.
7. Motion: quiet and precise (toasts, list removal, loading to content, panels and sidebar on springs, numbers count up). Nothing decorative.
8. Commits: one local commit per wave on the feature branch after its checks and its review. No push.
9. Repo state: Sync carries the ahead and behind counts; the changed-files count joins Commit in the status bar; the chip leaves the top bar.
10. Assistant: one split button "Ask" (toggle the panel; the chevron opens the Ask menu items).
11. Consistency scope: shared patterns, raw tables to `DataTable`, tab icons, the second tab layer with the sliding pill.
12. Plain words: a hover and focus glossary on marked terms in the checklist, the tour and the empty states, with a link to the manual.

Defaults taken by the lead (no question): fetch and push stay in Code / Branches (in context); project actions stay on Home / Projects; the per-project picks and overrides in Settings / Project stay (they are overrides, not copies).

## Log

- 2026-11-12: change `update-ux-declutter` written (proposal, spec with REQ-001 to REQ-026, plan with five waves, tasks T001 to T021, checklist). `ac check --docs` passed with one warning: the `openspec` CLI is not installed here, so strict validation did not run. In this worktree the submodule `docs/agent-compass` is empty: run `node /Users/mecedric/Documents/Projects/agent-compass/bin/ac.mjs check --docs`.
- 2026-11-12: wave 1 started. Writer A: T001 to T004 (inventory test, one checklist, tour timing, small fixes). Writer B: T005 to T007 (one no-project page, empty pages, glossary). Next: Opus review of the wave, fixer, lead checks (`pnpm typecheck`, `pnpm lint`, `pnpm test`, e2e, personas), the lead wires the glossary into the checklist and the tour, one local commit.
- 2026-11-12: wave 1 writer B done (its checks: typecheck passed, Vitest 829 passed in its scope, lint failed only in writer A's unfinished files). New: `src/features/shell/no-project.tsx` (Open, Clone, New; `WithProject` shows `Loading`), `src/ui/molecules/term.tsx` (`<Term id="code-host">`, eight ids, Base UI `PreviewCard`), `src/lib/i18n/glossary.ts` (four languages); Runs names the missing AI tool, Backlog names the missing issue tracker. For the fixer: `EmptyState.title` is a string, so a `Term` cannot sit in a title; `EmptyState` takes one action (Clone and New sit under it with `-mt-4`); `e2e/work.spec.ts:28`, `e2e/sync.spec.ts:35`, `e2e/extensions.spec.ts:72` click Import on Backlog and fail if the demo project has no linked issue tracker; the gallery is not checked for the new molecule. Writer A still runs.
- 2026-11-12: wave 1 writer A done (its checks passed: typecheck, lint, Vitest 291 in its scope). New: `src/features/onboarding/checklist.tsx` (eleven items, one rule each; Today lists the items to do, Settings / Me lists all), `src/features/shell/inventory.test.tsx` (33 palette ids, every route). Deleted: `onboarding/setup.tsx`, `home/get-started.tsx` and their tests. The tour opens only with a project open and `tourSeen` not set; each close sets `tourSeen`; Continue on the role step; `Loading` in the permissions list; Install asks first. For the fixer: the e2e specs, `e2e/personas/walk.ts`, `junior.persona.ts` and `scripts/screenshots.ts` click "Open a local folder" with no Continue click first; `add-onboarding-tour/proposal.md` lines 9 and 14 still say first launch and Setup checklist; the team item lost its link to the member form (Work / Team): put it back. Next: Opus review of the working tree, lead suite, fixer.
- 2026-11-12: lead checks on wave 1: typecheck and lint passed; Vitest 1 failed (`src/app/app.test.tsx` "shows the first run on Home…": needs the Continue click).
- 2026-11-12: Opus review of wave 1: 3 P1, 6 P2, 3 P3. P1: the team item lost its link to Work / Team with the member form (`checklist.tsx:306`); the Install action for a missing tool and the link to `/settings/connections#connections-runner` are gone when no default tool is set (`checklist.tsx:260`); `useState(role)` in `first-run.tsx:107` keeps the default role, so Continue overwrites a saved role. P2: the role step returns each time no project is open (start at the open step when a role is saved or a project exists); focus falls to `body` after Continue; the checklist counts a loading item as done (`checklist.tsx:360`); `Term` link not reachable by keyboard and no `aria-describedby`; `Term` used nowhere (REQ-008); no changelog entry. P3: `no-project.tsx:31` ignores an open outcome; `add-onboarding-tour` `tasks.md:20` and `proposal.md:9,14` are stale; done items lost their link and `aria-current="step"`. Found correct: tour condition and `tourSeen`, Install confirmation, Runs and Backlog conditions, the inventory test, i18n in four languages. One fixer runs on all of them, plus the e2e and persona Continue clicks. `screens.json` and the screenshots wait for wave 5.
- 2026-11-12: wave 1 fixer done: all review findings fixed (team link, Install and AI tools link, role from loaded prefs, role step only with no role and no project, focus after Continue, count only done items, `Term` on `Popover` with a button trigger and `aria-describedby`, new `Terms` that marks glossary words in a string, open outcome error, View link and `aria-current` on items, stale docs, `EmptyState.extra`, changelogs), new helper `e2e/first-run.ts` (`openFirstFolder`) in 15 specs. Its checks: typecheck, Biome, Vitest 1540, e2e 123 passed. `pnpm test:personas`: 6 of 7 fail, and the same 6 fail on a clean `HEAD` (pre-existing; the architect walk lands on Design / Decisions, not Diagrams): follow-up, not wave 1. Note: the shell hook rewrites `pnpm lint` to a missing eslint call; use `rtk proxy pnpm run lint`. Open: a `Term` inside the tour dialog is not tested under the focus trap; the tour titles and `no-project.tsx` carry no glossary word; the "2" badge shows on the start step when the role step is skipped. The lead re-runs the checks, then commits.
- 2026-11-12: lead checks on the fixed wave 1 passed: typecheck, Biome, Vitest 1541 of 1541, e2e (exit 0). Personas not re-run by the lead (6 pre-existing failures, see above). T001 to T007 ticked. Wave 1 committed locally (see `git log`). Next: wave 2. Writer A: T008 to T010 (Activity button, avatar menu, Ask split button, repository state). Writer B: T011, T012 (twin tabs, tab icons, Home tiles) plus the "2" badge of the first-run start step.

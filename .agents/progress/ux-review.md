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

## Open

1. `adr:0017` stays proposed: Azure sign-in is not built (it needs a Microsoft app registration).
2. 13 spec changes are built and not archived, so Flow shows them as "Not started". Archive them when the owner says so.
3. A personal role lowers the rights of an admin (`spec:team-rights#REQ-006`). The owner can change this rule.
4. About 120 places show an error as a string, not through `ErrorNotice`.
5. The comment button of a diff line is 24 px, by decision (see Decisions).

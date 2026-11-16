# Plan: app-redesign

Spec: [spec.md](spec.md)
Date: 2026-11-16

## Summary

Build the new interface on the data and the commands of today. The work is in the frontend: a new shell, new pages that reuse the current feature modules, and new shared components. The engine, the stores and the command surface stay, except a read model that joins a ticket, a spec change, a run and a pull request into one feature.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | The existing stack: Tauri, Rust crates, React frontend, the router of `src/app/router.tsx`. |
| Dependencies | None new. Shared components come from `src/ui/`. |
| Data/storage | No new table. One read model "feature" in `shipyard-core`, built from the ticket, the spec change, the run and the pull request refs. |
| APIs/contracts | One new read command for the feature model, one for the durable permission of a recipe, and the commands that start the three new agent actions (REQ-030 to REQ-033) on the run engine of today. The IPC mocks follow each command change. |
| Risks | The size of the change: mitigated by waves and by the inventory test of REQ-003. A lost function: mitigated by the map below and by one audit per wave. Two interfaces at once: each wave replaces its pages on main and removes its old pages when the inventory test passes (`q:Q-171`). |

## Affected Surfaces

- Code: `src/features/shell/`, `src/app/router.tsx`, each folder of `src/features/`, `src/ui/`, `src/lib/i18n/`, `src/lib/ipc/mock*.ts`, `crates/shipyard-core/` (feature read model, state to stage map), `crates/shipyard-app/` (two read commands).
- Tests: unit tests of the state to stage map and of the feature model, the inventory test, component tests of each new page, e2e and a11y runs, persona walkthroughs.
- Docs/specs: `docs/designs/screens.json`, `docs/assets/screenshots/`, `docs/guide/` in four languages, `docs/delivery/test-plans/app-redesign.feature`, `docs/decisions/0023-six-places-one-flow.md` (`adr:0023`) and the status of `adr:0004`, the constitution section 2 if the ADR renames the loop, the specs of the capabilities that each wave touches.

## Approach

1. Decided: `adr:0023` is accepted, and the four questions have their answers.
2. Foundation: the tokens of the new look, the shared components (place menu, Ask bar, stage line, attention card, section switch, door, value row), the state to stage map and the feature read model, each with tests. Old addresses redirect from the start.
3. One wave per place, in the order of the loop of a person: Today, Flow and the feature page, Crew, Plan, Library, Code and Health, Setup. Each wave moves the current feature modules into the new pages. It does not rewrite their logic.
4. Each wave ends with the inventory test, an audit of the wave's functions against the map, the screens registry, the screenshots, the guide and the changelog.
5. Last wave: remove the old shell and what is left of the old pages, the role views, the four languages check, the accessibility run at 960 by 600.

### Map from the current pages to the new places

| Today | New place |
| ----- | --------- |
| Home / Today, notifications, Activity, menu bar panel | Today (Needs you, News, Activity) |
| Home / Projects, first run, new project wizard | Projects page behind the project name |
| Work / Backlog, Board; Factory / Runs board and History; Specs / Changes | Flow (Flow, List, Done) |
| Run page, change detail, ticket detail, pull request page, unit chat | One feature page (Story, Brief, Design, Changes, Checks, Chat) |
| Code / Quality | Flow / Health |
| Code / Impacts | Checks of a feature |
| Work / Team, rights; Factory / Workflows, Agents map, Sessions, Usage | Crew (Crew, Recipes, Sessions, Spend, Rights) |
| Work / Plan, Estimates, Time | Plan (Timeline, People, Estimates, Time) |
| Design (all tabs); Specs / Capabilities, Questions, Test plans, Constitution; Knowledge (all tabs); reports | Library (four doors) |
| Code / Changes, History, Branches, Pull requests, Terminal, Files | Code (Now, History, Branches, Terminal) |
| Settings / Project, Extensions, automation | Setup / This project |
| Settings / Connections, Agents and rules, Health | Setup / This computer |
| Settings / Me | Setup / Me |
| Search, command palette, Ask, assistant panel | Ask bar and full assistant |

## Validation

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --no-fail-fast
pnpm typecheck
pnpm lint
pnpm test
CI=1 npx playwright test
pnpm test:personas
openspec validate update-app-redesign --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] `docs/designs/screens.json` and `docs/assets/screenshots/` hold each new screen.
- [ ] `docs/guide/` is updated in the four languages.
- [ ] `docs/delivery/test-plans/app-redesign.feature` matches the scenarios of the spec.
- [ ] The specs of the touched capabilities are updated, and each moved requirement ref is searched and fixed.
- [ ] `CHANGELOG.md` and `CHANGELOG.fr.md` have the same number of new lines.

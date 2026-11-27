# Plan: ux-declutter

Spec: [spec.md](spec.md)
Date: 2026-11-12

## Summary

Four build waves and one closing wave. Each build wave has two Sonnet (medium) writers on files that do not overlap, then one Opus (high) review in a fresh context, then one Sonnet fixer, then the lead's checks and one local commit. The progress file `.agents/progress/ux-declutter.md` gets one line per step.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | React, TanStack Router, Tailwind 4, `motion/react`, Vitest, Playwright (all in the tree) |
| Dependencies | None new |
| Data/storage | No new preference. `tourSeen` and `todaySeen` stay |
| APIs/contracts | No IPC command changes expected. A writer that needs one stops and reports |
| Risks | A removed control hides an action: the inventory test of REQ-016 is written first, in wave 1. Selector changes break e2e and persona probes: each wave runs them |

## Affected Surfaces

- Code: `src/features/{shell,onboarding,home,work,specs,code,design,knowledge,factory,settings,projects}/`, `src/ui/`, `src/app/`, `src/lib/i18n/`
- Tests: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `CI=1 npx playwright test`, `pnpm test:personas`
- Docs/specs: this change, `changes/add-onboarding-tour` (REQ-001, REQ-005, REQ-013), `docs/designs/screens.json`, `docs/assets/screenshots/`, `docs/guide/` (four languages), `docs/delivery/test-plans/ux-declutter.feature`, both changelogs

## Approach

| Wave | Writer A | Writer B |
| ---- | -------- | -------- |
| 1 First run | Inventory test; one checklist and its rules; tour timing; Continue; permissions loading; install confirmation (`onboarding/`, `home/get-started*`, `home/today*`, `app/views.tsx`, `projects/first-run*`, `settings/me.tsx`) | One no-project page; empty pages that name the missing step; glossary molecule and texts (`work/no-project*`, `specs/no-project*`, `code/project-gate*`, `design/tab.tsx`, `factory/runs*`, `work/backlog*`, `src/ui/molecules/term*`, a new i18n file) |
| 2 Top bar | Activity button, avatar menu, Ask split button, repository state (`shell/context-bar*`, `shell/active-sessions*`, `shell/status-bar*`, shell tests) | Twin tabs, tab icons, Home tiles (`shell/spaces.ts`, `shell/tabs-bar*`, `app/router.tsx`, `code/terminal*`, `knowledge/manual*`, `home/stats*`, `home/today*`, `home/role-panels*`) |
| 3 Patterns | Page header on every tab, loading and empty patterns, section list in Settings, inner tab pill (`ui/templates/list-detail*`, `ui/molecules/view-tabs*`, the pages without a header, `settings/{connections,extensions,agents-rules,health}*`) | Shared data table for `work/time*`, `work/team-rights*`, `knowledge/learn-paths*` |
| 4 Motion | One motion source and the six places; count-up, graph, section scroll (`ui/motion.ts`, `ui/atoms/count-up*`, `ui/molecules/section-nav*`, `factory/run-graph*`, `knowledge/graph-canvas*`, `ui/use-animation*`) | Toasts, removed rows, loading to content, springs on sidebar, inspector and drawers (`ui/organisms/toaster*`, `ui/atoms/loading*`, `ui/templates/shell*`, `shell/inspector*`, the drawers) |
| 5 Close | Docs: `screens.json`, screenshots (`scripts/screenshots.ts`), guide in four languages, test plan, changelogs | Final Opus review of the whole branch, then one fixer |

The paths in the table are the audit's best knowledge. Each writer first proves that a file is in use, and reports a file outside its list instead of editing it.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
CI=1 npx playwright test
pnpm test:personas
```

One heavy suite at a time. Stop any server on port 4174 before the e2e run. No Rust change is planned; if one happens, add `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings` and the tests of the changed crate.

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] `add-onboarding-tour` REQ-001, REQ-005 and REQ-013 match this spec.
- [ ] `docs/designs/screens.json` and the screenshots show the new top bar, Today and tab bars.
- [ ] The guide (four languages) names the Activity button, the avatar menu and the checklist.
- [ ] Both changelogs have the same number of bullets.

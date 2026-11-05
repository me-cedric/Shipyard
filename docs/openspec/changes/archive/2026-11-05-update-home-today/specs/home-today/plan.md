# Plan: home-today

Spec: [spec.md](./spec.md)
Date: 2026-11-05

## Summary

One page component composes the existing parts: the Inbox list, the ticket rows of My work, the run rows and the event sentence of Activity. Tabs and routes change in the shell. Pins move to Dashboards. This covers REQ-001 to REQ-009.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | React 19. No new runtime. No Rust change expected. |
| Dependencies | None new. |
| Data/storage | The last visit of Today is a per-person pref (`prefs.json`), like the pins. |
| APIs/contracts | Existing IPC only: inbox, work items, runs, run log, notifications, prefs. |
| Risks | Tests, e2e and personas that open `/home/inbox`, `/home/my-work` or `/home/activity` (about 35 files): the redirects keep links working; tests that check tab names change. |

## Affected Surfaces

- Code: `src/features/home/today.tsx` (new), `src/features/home/inbox/`, `my-work.tsx`, `activity.tsx`, `src/features/shell/spaces.ts`, `src/app/tab-view.tsx`, `src/app/router.tsx`, `src/features/knowledge/pinned.tsx`, `src/features/knowledge/dashboards.tsx`, `src/lib/prefs/`, `src/lib/i18n/`.
- Tests: `src/features/home/*.test.tsx`, `src/features/knowledge/dashboards.test.tsx`, `e2e/*.spec.ts`, `e2e/personas/*`.
- Docs/specs: `docs/guide/home.md` and `docs/guide/fr/home.md`, `docs/designs/screens.json` and the screenshots of Home, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Approach

1. Tests for Today (sections, hiding, grouping, my runs only, since last visit, empty state).
2. Build `today.tsx` from the existing parts; move the Inbox list into a section component.
3. Change the Home tabs and add the redirects.
4. Move `PinnedTiles` to the top of Knowledge / Dashboards.
5. Texts, guide, screens, changelog.

## Validation

```bash
pnpm typecheck
pnpm test src/features/home src/features/knowledge src/features/shell
CI=1 npx playwright test
cd docs && npx -y @fission-ai/openspec@1.15.0 validate update-home-today --strict
```

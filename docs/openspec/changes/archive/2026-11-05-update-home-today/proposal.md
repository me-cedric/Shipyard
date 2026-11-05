# Home Today

## Why

Home / My work and Home / Activity mostly repeat other pages: My work is Work / Backlog filtered to the person plus the runs on those items, and Activity is the Factory run log plus the notifications. Both show "Add tile", which pins Knowledge / Dashboards charts to Home with no context. The owner finds both tabs misleading (2026-11-05).

## What Changes

- Home gets one page, Today, that answers "what do I do now". It replaces Inbox, My work and Activity.
- Today shows, in this order: Needs you (the Inbox content, with its actions in place), my tickets grouped by state with quick actions, my agents (live runs on my tickets, with Stop), and "since you were away" (the events of my tickets and runs since my last visit).
- Home keeps Projects as the second tab.
- The pinned tiles leave Home and show at the top of Knowledge / Dashboards. The pins stay.
- The old addresses `/home/inbox`, `/home/my-work` and `/home/activity` open Today.

## Impact

- Affected capability: `home-today` (new). On archive it supersedes `shell` REQ-003 (Home views) and `knowledge` REQ-024 (Home widgets): edit both settled specs to point here.
- Affected code/docs: `src/features/home/` (inbox, my-work, activity), `src/features/shell/spaces.ts`, `src/app/tab-view.tsx`, `src/app/router.tsx`, `src/features/knowledge/pinned.tsx`, `src/features/knowledge/dashboards.tsx`, `src/lib/i18n/`, `e2e/*.spec.ts` and personas that open the old tabs, `docs/guide/home.md` (EN, FR), `docs/designs/screens.json` and its screenshots.

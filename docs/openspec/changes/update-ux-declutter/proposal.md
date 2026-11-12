# UX declutter: one checklist, a shorter top bar, shared patterns, quiet motion

## Why

The owner (2026-11-12): the app shows the same thing in several places, and a new person gets lost, most of all at the first launch. An audit of the same day found:

- Home / Today shows two checklists with the same items, and they disagree on what is done.
- The tour opens on top of the first-run page, and it opens again at the next launch after a setup action.
- The top bar holds about 21 controls. Runs, needs-you, sessions, spend and the repository state show in two or three places.
- Two tabs (Code / Terminal, Knowledge / Manual) draw what the top bar already opens.
- Pages use three header patterns, three loading patterns, two empty patterns and two table kinds.
- Toasts, removed rows and loaded content appear with no motion, and six places ignore the motion preference.

## What Changes

- One "Get started" checklist replaces Setup and Get started, with one rule for "done" per item. Today and Settings / Me show the same card.
- The tour opens once after the first project is open. The first launch shows only the first-run page.
- One no-project page offers Open a folder, Clone and New project in every space. An empty page names what is missing and gives its action.
- A glossary explains marked terms on hover and on focus, in the checklist, the tour and the empty pages.
- The top bar folds: one Activity button (Needs you, Runs, Sessions), one avatar menu (Settings / Me, Theme, Manual, Shortcuts, What's new, Replay the tour), one Ask split button. The repository state splits between Sync and the status bar.
- Code / Terminal and Knowledge / Manual leave the tab bars. Their addresses keep working.
- The Home tiles go. Their numbers move into the panel headings.
- Shared patterns: a visible page header on every tab, one loading pattern, one empty pattern, a section list on every Settings page, `DataTable` for the three raw tables, an icon on every tab, and the sliding pill on the inner tab rows.
- Motion: one source for the motion preference; toasts, removed rows and loaded content move; panels use the shared springs.

No feature is removed. Each action that a person reaches today stays reachable from a visible place and from the palette.

## Impact

- Affected capability: `ux-declutter` (new). It changes screens of `shell`, `onboarding`, `home-today`, `code`, `knowledge`, `work` and `design-system`.
- The open change `add-onboarding-tour` changes with it: REQ-001 (when the tour opens), REQ-005 (where the manual opens) and REQ-013 (the checklist).
- Affected code/docs: `src/features/shell/`, `src/features/onboarding/`, `src/features/home/`, `src/features/{work,specs,code,design,knowledge,factory,settings}/`, `src/ui/`, `src/lib/i18n/`, `docs/designs/screens.json`, `docs/assets/screenshots/`, `docs/guide/` (EN, FR, DE, ES), `docs/delivery/test-plans/ux-declutter.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.
- Questions: none open. The owner's twelve answers are in `.agents/progress/ux-declutter.md`.

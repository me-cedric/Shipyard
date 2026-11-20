# App redesign: one flow, six places

## Why

The owner (2026-11-16): the app feels too complex and too data-driven, and it is not visual or simple enough. An independent review of the same day found:

- The app is organised by the kind of file, not by what a person wants to do. Eight spaces hold about 45 tabs. One decision of a person can sit in Home, in Specs / Questions, on a run page or on a pull request.
- Four layers of controls stand before the content: the top bar, the sidebar, the tab bar and the page header with its filters.
- Each card shows ids, counts, costs and states with the same weight. No screen says what to do next.
- Controls for developers (branch, sync, commit, terminal) show for every role.
- Two pictures are data dumps: the agents map with its crossing lines, and the plan that opens with a block of warnings.

The owner also set a rule for the redesign: when a current feature is illogical or not good enough, improve it, do not copy it. No function may be lost.

## What Changes

- Six places replace the eight spaces: Today, Flow, Plan, Crew, Library and Code. Setup sits at the end of the menu.
- One feature moves through five stages: Idea, Spec, Build, Review, Ready. One feature page joins its ticket, spec, design, agent work, code changes and checks.
- Today shows one thing that needs the person at a time, with the answer on the card.
- One bar, "Ask or tell Shipyard", replaces the search, the command palette and the Ask button.
- An agent asks one question for one intent. The effects of the answer are named on the card.
- Crew shows people and agents together, with recipes (the workflows of today), sessions, spend and rights.
- Library opens on four doors by question. Each reader shows the picture or the plain form first.
- Look pass 2 rebuilds each page of Library from its design, adds the sub-pages What is tested, Map of the code, Flow matrix, Edit a dashboard and the report forms, each with its own address, and moves the controls that a page does not show to its More menu.
- Product health (the quality gates) becomes a view of Flow for every role. Impacts open from one feature.
- Setup has three scopes: this project, this computer, me.
- Three new agent actions: "Ask an agent to estimate" in Plan, "Fix all with an agent" in the health of the project, "Build a tile for me" in the dashboards. Each one proposes, and nothing changes before a person accepts.
- The visual language changes: a calm ground, one accent colour, one colour for "a person must act", large type and targets.
- The shell has a rail and one top row. The top bar and the status bar go, and each of their controls moves to the rail, the top row, the card of the sync mark, the account menu or the Ask bar.
- The fonts are Geist and Geist Mono, bundled with the app.

Each action and each view that a person reaches today stays reachable. The address of each current page keeps working.

## Impact

- Affected capability: `app-redesign` (new). It changes the screens of `shell`, `home-today`, `work`, `factory`, `specs`, `design`, `code`, `knowledge`, `assistant`, `connections`, `extensions`, `projects` and `design-system`.
- Rule check: the constitution names the loop "design, spec, work, factory, code, knowledge" (section 2). The new menu names differ. `adr:0023` (accepted on 2026-11-16) keeps the six areas for the loop, the refs and the rights, and makes each place a view on them. It replaces `adr:0004`.
- Design source: 101 screens. Pictures in `docs/assets/screenshots/redesign/`, sources and index in `docs/designs/redesign/`, and the private canvas <https://claude.ai/artifact/1uHi9aggUnnnUDchTWGYA2>. The plan holds the map from each current page to its new place.
- Affected code/docs: `src/features/`, `src/ui/`, `src/app/router.tsx`, `src/lib/i18n/`, `docs/designs/screens.json`, `docs/assets/screenshots/`, `docs/guide/` (EN, FR, DE, ES), `docs/delivery/test-plans/app-redesign.feature`, `docs/decisions/`, `CHANGELOG.md`, `CHANGELOG.fr.md`.
- Open questions: `q:Q-172` (the names in French, German and Spanish; a default exists). Answered: `q:Q-170`, the three new agent actions enter this change; `q:Q-168`, Light is the default theme; `q:Q-169`, the names of the canvas stay; `q:Q-171`, each wave replaces its pages on main.

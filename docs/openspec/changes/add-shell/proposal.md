# add-shell

## Why

Legacy has 40 routes, 12 sidebar groups and four stacked filters that hide pages. The same action (commit, pull) is in many places.
Shipyard needs one frame with seven spaces, one place for each action, and a home view per role, so that each person finds their work without a map.

## What Changes

- Add the shell: a sidebar with the seven spaces (Home, Design, Specs, Work, Factory, Code, Knowledge) and Settings, the main area, and the inspector panel.
- Add the Home space: Inbox ("Needs you"), My work and Activity. My work and Activity show the pinned tiles of `knowledge`. The Inbox shows the questions of `questions-loop` and the approvals of `factory` and `delivery`.
- Add the command palette: search over refs and every action, with shortcuts.
- Add the inspector: it shows the selected entity and its backlinks.
- Add the status bar: the one commit action, the one sync action, the project health and the active runs.
- Add the notification centre and the system notifications, with one source list for all events.
- Add the role home: each role gets a default home view and a sidebar order. No role loses a view.
- Add Settings / Me: theme, contrast, density, fonts, reduced motion, language, shortcuts, notifications and the detected agent CLIs. These values follow the person, not the project.
- Add French and English, the native menu, context menus, the update check, and the reopening of the last view for each project.

## Impact

- Affected capability: `shell`
- Consumes: `design-system` (Shell template, CommandPalette, Inspector), `refs` (search and backlinks), events of `sync`, `factory`, `questions-loop` and `delivery`, the commit operation of `code`, the sync operation of `sync`, the health of `projects`, the assistant panel of `assistant`.
- Produces: navigation, the palette action registry, the notification centre, Home, Settings / Me.
- Legacy parity: sidebar and routes, top bar, notifications centre, Préférences, i18n FR and EN, tours, context menus, native menu, update check, Nouveautés, Home widgets of Dashboards.
- Affected code/docs: `src/features/home/`, `src/features/shell/`, `src/ui/templates/`, `crates/shipyard-app`.

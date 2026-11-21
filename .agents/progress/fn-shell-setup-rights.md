# fn-shell-setup-rights

Capability `shell-setup-rights` of the change `add-redesign-functions`. Branch `fn/shell-setup-rights`, base `45288ede`.

## Built

All 12 requirements (F01, F20, F21, F22, F25, F40 to F46) have their backend, view, mock and tests. Tasks T001 to T028 are ticked in `specs/shell-setup-rights/tasks.md`.

| Control | Where |
| --- | --- |
| F01 Sign out | `src/features/shell/sign-out.ts`, `crates/shipyard-app/src/connections.rs` (needs a click; keeps AI tool sign-ins) |
| F20 Take control, live output | `src/features/crew/take-control.ts`, `crates/shipyard-app/src/machine.rs`, `crates/shipyard-agents/src/machine.rs` |
| F21 Processor, Memory, tool calls | `src/features/crew/spend-how.tsx`, `crates/shipyard-app/src/request_tree.rs` (reads the `tool_call` events of the run log) |
| F22 Plan right | `crates/shipyard-core/src/rights.rs`, gates in `crates/shipyard-app/src/work.rs` |
| F25 Fill from my work | `crates/shipyard-app/src/work/fill.rs`, `src/features/plan/time.tsx` |
| F40 Model for each role | `crates/shipyard-app/src/role_model.rs`, `src/features/crew/role-card.tsx`, `src/features/settings/agents-rules.tsx` |
| F41 Budget notice, Sound, Release channel | `src/features/shell/budget-notice.ts`, `crates/shipyard-app/src/shell/` |
| F42 Data folder, Portable mode | `crates/shipyard-app/src/window.rs`, `src/features/settings/look-rows.tsx` |
| F43 Attach a file | `src/features/projects/health-feedback.tsx`, `crates/shipyard-app/src/feedback.rs` |
| F44 Permissions card | `src/features/onboarding/permissions-moment.tsx` |
| F45 Hidden places | `crates/shipyard-core/src/rights.rs` (`hide` cell), `src/features/shell/places.ts` |
| F46 Ask before a project closes | `src/features/shell/project-close.tsx`, `crates/shipyard-app/src/close_guard.rs` |

## Fixed in the finish pass

- The permissions card blocked the first run and every e2e and persona run. It now waits for the first project, like the tour. A browser build made with `VITE_PERMISSIONS_LATER=1` starts with Later on: `playwright.config.ts` and `playwright.personas.config.ts` set it.
- The close question now lists the tickets of the runs and uses the wide dialog, so the three buttons fit on one row.
- `e2e/projects.spec.ts`: the two tests that close a project answer the new question; one also checks Cancel.
- The mock session ids have no `/`, so Take control shows for the sessions of the demo.
- Screens: titles of 12 screens in `docs/designs/screens.json`, the new screen SCR-185 (permissions card), the picture of SCR-096. `scripts/screenshots.ts` has the scenes `close-guard` and `permissions-moment`, and dismisses the card for the other scenes.

## Checks

See the final report of the session for the commands and results. The Rust lib test `a_link_to_a_connection_that_is_gone_is_replaced_by_the_only_tracker` is skipped: it reads the real keychain (older than this change).

## Open items

- The permissions card shows the label "Documents, Desktop and Downloads", the design says "Files of your projects". The label is shared with the tour and Setup and is used by e2e tests.
- The card offers no request for a permission that is off, only Open the system settings.
- The tool bars (Claude Code, Codex spend) stay on How agents do; the design shows only Processor, Memory and sessions.
- Moving the data folder copies the files while the app runs. The old folder stays (no delete).
- The guide text in French, German and Spanish is a translation by the build agent: have a native reader check it.

## Seams for the lead

- Budget notice: `warn_at()` in `crates/shipyard-app/src/shell/budget.rs` returns `DEFAULT_WARN_AT` (0.8) and takes `_s: &AppState`. After the join with `runs-recipes`, change only the body of `warn_at`. The UI reads `budgetStatus` in `src/features/shell/budget-notice.ts`. The Me row text is not tied to a Warn at setting yet.
- Shared files touched: `src/lib/ipc/mock*.ts`, `crates/shipyard-app/src/lib.rs`, `src/lib/ipc/bindings.ts` (generated), `src/lib/i18n/` (`shell-fn.ts` for en, de, es; keys in `en.ts`, `fr.ts`), `src/test/setup.ts`, `src/ui/organisms/dialog.tsx` (prop `closeLabel`), `src/features/shell/app-shell.tsx`, `CHANGELOG.md` and `CHANGELOG.fr.md` (3 bullets each), `docs/designs/screens.json`, `docs/guide/`, `scripts/screenshots.ts`, `playwright.config.ts`, `playwright.personas.config.ts`.
- Not touched: `crates/shipyard-app/src/work/join.rs`, `src/features/work/team-rights.tsx`.

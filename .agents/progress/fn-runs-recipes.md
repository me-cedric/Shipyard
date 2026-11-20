# fn-runs-recipes

Branch `fn/runs-recipes`, change `add-redesign-functions`, capability `runs-recipes`.

## Built

All nine controls work from the UI to the engine, with tests.

- F02 Pause: `Factory::pause`, event `Pause`, cause `Person`. The run pauses at the next turn end, or at once with no live agent. No stop report. State machine doc updated.
- F03 Take it over: `run_take_over` ends the run with the reason "Taken over by <name>", assigns the person, opens the worktree in the editor (best effort).
- F05 Chat attach: `run_attach`, limits of `assistant_attach`. The engine adds a fenced note to the open steps.
- F07 Add a document: `specs_change_input_add`, Markdown, PDF, Word, 20 MiB, into `inputs/` of the change.
- F08 Limit of a feature: field on New feature, written as `budgets.feature` by ticket key. The sum covers all runs of the key.
- F16 Warn at and Then: field `at_limit` (feature, day, member) with Stop and ask, Pause, Ask me, Go on (`adr:0024`).
- F17 Stage limits: `per_stage` Plan, Build, Review. The engine holds a run in its state when the stage is full.
- F18 Role of a human step: `Step.approver`, enforced in `approve_plan` and `reject_plan`, plans on Today filtered by role.
- F19 Rows of a step: Kind (derived), Runs beside other steps, Child steps side by side, Mode, May write. Alone calls `recipe_allow_pr_write`.

## Finish pass

- Clippy found `large_enum_variant` in `Work::Gate` (the new `approver` field grew `Step`). Fixed: `step` is boxed in `jobs.rs` and `review.rs`.
- New feature page: Add a document moved to the right end of the row (as the design). The Limit placeholder shows `3.00`.
- Pictures retaken for ten scenes: workflows, run, usage, new-feature, feature-chat, crew-recipe-step, crew-spend-budgets, setup-automation, feature-ticket, feature-stop. No new scene: no new screen.
- Spec tasks T020 and T022, checklist and acceptance criteria ticked.

## Checks

| Command | Result |
|---|---|
| `pnpm typecheck` | passed |
| `pnpm lint` | passed, 1112 files |
| `pnpm vitest run` | passed, 295 files, 2739 tests |
| `cargo fmt --check` | passed |
| `cargo clippy --workspace --all-targets -- -D warnings` | passed (after the box fix) |
| `cargo test --workspace --exclude shipyard-app --no-fail-fast` | passed, 1496 tests |
| `shipyard_app` lib test binary, one test skipped | passed, 537 tests |
| `shipyard-app` `tests/it` binary | passed, 61 tests |
| `pnpm ipc:check` | passed, bindings clean |
| Playwright e2e (temp config, port 4401, `CI=1`) | passed, 150 tests |
| Playwright personas (temp config, port 4402) | passed, 7 tests |
| `openspec validate add-redesign-functions --strict` | passed |

The skipped test is `commands::setup::tests::a_link_to_a_connection_that_is_gone_is_replaced_by_the_only_tracker`. It builds `AppState::new` with the real keychain and hangs in a headless session. It is outside this change. `cargo test -p shipyard-app --lib` therefore hangs on it.

## Open items

- Settled spec `docs/openspec/specs/factory/` waits for the archive of the lead.
- Then choices: Ask me is close to Stop and ask. The only difference is the ticket comment. The lead confirms the wanted behaviour.
- Spend / Budgets shows one Then choice for each budget (the spec). The design picture shows one Then row under Warn at.
- May write shows on the step that opens the pull request (`open_pr`), not on every step. The picture shows it on Build.
- The pictures are viewport crops at 1600x1000: rows below the fold (stage limits, Mode) are in the page, not in the picture.
- The Recipe field of New feature shows the first recipe of the mock (Bootstrap). The design shows Feature.

## Shared files touched

`src/lib/ipc/mock.ts`, `src/lib/ipc/mock-{factory,specs,sync}.ts`, `src/lib/ipc/bindings.ts` (generated), `crates/shipyard-app/src/lib.rs`, i18n `runs-recipes.ts` (EN, FR, DE, ES) and `factory.ts`, `doctor.ts` (four languages), `CHANGELOG.md` and `CHANGELOG.fr.md` (5 bullets each), `docs/designs/screens.json` (10 screens), `docs/guide/` (four languages), ten pictures in `docs/assets/screenshots/`, `crates/shipyard-engine/src/{jobs,review}.rs` (box fix).

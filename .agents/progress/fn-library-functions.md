# Progress: fn-library-functions

Branch `fn/library-functions`, base `45288ede`. Spec: `docs/openspec/changes/add-redesign-functions/specs/library-functions/`.

## Built

All 13 requirements (REQ-001 to REQ-013, controls F26 to F39) have code, tests and docs. T001 to T030 are ticked.
The final check read the diff of each part. One gap was fixed: the Costing card of REQ-007 was named "Estimates". It is now "Costing" (EN, FR, DE, ES).
One e2e test was changed on purpose: `e2e/library.spec.ts` assumed that the format switch of Reports hides cards. REQ-006 makes the switch the output format, so no card leaves. The unit test with the same old rule was replaced by the earlier agent with tests of the new rule.

## Checks

| Command | Result |
|---|---|
| `pnpm typecheck` | passed |
| `pnpm lint` | passed, 1129 files |
| `pnpm test` | passed, 304 files, 2755 tests |
| `cargo fmt --all --check` | passed |
| `cargo clippy --workspace --all-targets -- -D warnings` | passed |
| `cargo test --workspace --exclude shipyard-app` | passed, 1477 tests |
| `cargo test -p shipyard-app --lib` with `--skip a_link_to_a_connection_that_is_gone_is_replaced_by_the_only_tracker` | passed, 544 tests (the keychain test is skipped) |
| `cargo test -p shipyard-app --test it` | passed, 61 tests |
| `pnpm ipc:check` | passed, `bindings.ts` is current |
| `openspec validate add-redesign-functions --strict` | passed |
| Playwright e2e (temp config, port 4421) | passed, 150 of 150. The first full run failed 4 gallery tests of `design-system.spec.ts` on a time-out (the dev server was slow under load); they pass alone. |
| Playwright personas (temp config, port 4422) | passed, 7 of 7 |

## Pictures

Retaken on the frozen demo build (port 4423, stopped): reports, knowledge, knowledge-slides, library, library-api, library-code-map, library-dashboard-edit, library-dashboards, library-documents, library-flow-matrix, library-handbook, library-project-rules.
Compared with the design pictures 071, 045, 077, 036. The structure matches. Two states have no picture: the chip "Not in the code" and the alert show only after a check; the card Earlier versions of Project rules is below the first screen.

## Open items

- F36: joined. The release picker reads `work_releases` and the release of each ticket; `releases_list` is removed from the mock.
- F35: the pin is in localStorage (`shipyard.pinned-dashboards`), per person on this machine (Q-070). The card shows on Today, not on the role panels page of SCR-104.
- No picture for the dialogs History, Add a word, Experts and the pinned Today state.

## Shared files touched

`crates/shipyard-app/src/lib.rs` (`design_flows_check`, `design_flows_checked`), `src/lib/ipc/bindings.ts` (generated), `src/lib/ipc/mock*.ts`, `src/lib/i18n/{library-fn,reports}.ts` and the de, es copies, `CHANGELOG.md`, `CHANGELOG.fr.md` (4 bullets each), `docs/designs/screens.json`, `docs/guide/library.md` and the de, es, fr copies, `docs/assets/screenshots/`.

## Seams for the lead

- Cherry-pick by commit. Conflicts are likely in `mock.ts`, `lib.rs`, the i18n files and the changelogs.
- After the merge of `spec:code-host-tickets#REQ-004`: swap the release read (see F36).
- Hook trap: the compass hook blocks a command whose text looks like a read of a secrets file, also inside a Rust test string.

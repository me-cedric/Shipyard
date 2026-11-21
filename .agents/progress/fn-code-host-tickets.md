# fn-code-host-tickets: progress

Capability `code-host-tickets` of `add-redesign-functions`. Branch `fn/code-host-tickets`, base `45288ede`. All 26 tasks are ticked.

## Built

| Control | Function |
|---|---|
| F04 Run again | `code_pull_rerun` re-runs the failed checks only (GitHub, GitLab, Azure DevOps). Needs a click and the code write right. |
| F06 Keep | `assistant_file_keep` (one file or all) and `assistant_file_undo` (one file). |
| F09 Recipe row | The label `wf:<id>` of a ticket is swapped from the ticket page. |
| F10 Releases | One release per ticket. Fix version, milestone, iteration or project. `work_releases` lists them, `work_ticket_release_set` sets one. |
| F11 Add a kind | `extraKinds` in the tickets config. A kind needs a type that the issue tracker has (`work_issue_types`). |
| F12 Reviewers, Merge with | `code_pull_reviewers`, reviewers in `code_pull_open`. Merge with sets the default method of the Merge button. |
| F13 Close, Mark as ready | After the open, on the new pull request page. |
| F14 PR author | Avatar of the author on each row. |
| F15 Action plan | `code_impact_plan_save` writes `- [x] text (owner: name)` in the plan file. No ticket. |
| F23 Join requests | `work_team_join_requests`, `work_team_join_accept`, `work_team_join_refuse`. Accept needs the merge right. |
| F24 Calendar rows | Release, Estimate sheet, Go to Today (opens the timeline on the current day). |

IPC command that reads the releases (group C, F36): `work_releases` (`commands.workReleases()`, returns `string[]`). Hook: `useReleases()` in `src/lib/work`.

## Checks

| Command | Result |
|---|---|
| `pnpm typecheck` | passed |
| `pnpm lint` | passed |
| `pnpm test` | passed (295 files, 2735 tests) |
| `cargo fmt --check` | passed |
| `cargo clippy --workspace --all-targets -- -D warnings` | passed |
| `cargo test --workspace -- --skip a_link_to_a_connection_that_is_gone_is_replaced_by_the_only_tracker` | passed (2086 tests, 0 failed). The skipped test uses the real keychain and is older than this change. |
| `pnpm ipc:check` | passed |
| e2e specs (temp config, port 4411) | passed (150 of 150, after one fix, see below) |
| persona specs (temp config, port 4412) | passed. The developer persona failed once under load (step "Stage and commit my changes") and passed alone. |
| `openspec validate add-redesign-functions --strict` | passed |

## Fixes in this pass

- `e2e/code.spec.ts`: the plan line now has a check box that names the line, so the text locator matches the whole text (`exact: true`). The check is the same.
- `src/lib/ipc/mock-code-host.ts`: the demo has one join request (zed), so the join card shows in the demo build.
- `scripts/screenshots.ts`: the scene `feature-checks` opens the pull request with failed checks, so Run again shows.

## Pictures retaken

`assistant-composer`, `feature-checks`, `setup-tickets`, `crew-rights-team`, `plan-dates`, `feature-ticket`, `feature-impact-report`, `pull-requests`, `pull-new`. Compared with designs 022, 053, 074, 084, 089, 099.

## Open items

- `assistant-composer` shows the empty page: the changed files with Keep need a thread with a change. The mock thread has none by default.
- Design 084 also shows an "Ask to join" card that this group did not build (not in REQ-010).
- The release of the Calendar card is kept in this browser (`plan-release.ts`). Nothing else reads it yet.
- The release picker of Library (`spec:library-functions#REQ-009`) must use `useReleases()`.

## Shared files touched

`src/lib/ipc/mock.ts` (+ `mock-*.ts` seeds), `crates/shipyard-app/src/lib.rs`, `src/lib/ipc/bindings.ts` (generated), `src/lib/i18n/code-host.ts` (new) and the `en`, `fr`, `de`, `es` index files, `CHANGELOG.md`, `CHANGELOG.fr.md` (one bullet each), `docs/designs/screens.json`, `docs/guide/` (4 languages), `docs/flows/`, `docs/data-models/mirror.dbml`, `scripts/screenshots.ts`, `e2e/code.spec.ts`, pictures in `docs/assets/screenshots/`.

## Seams for the lead

- Cherry-pick the commits of `45288ede..HEAD`. Run `pnpm ipc:gen` after the pick: the bindings must match the joined `lib.rs`.
- The i18n files each add one import and one key line. Resolve by keeping both sides.

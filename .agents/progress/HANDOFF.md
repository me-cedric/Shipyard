# Handoff (2026-10-31, owner at 96% weekly usage)

Read this first, then `w15.md` (the plan), `w13.md` (findings and state) and `security.md`.

## Where the code is

- Worktree: `/Users/mecedric/Documents/Projects/Shipyard-paag/.claude/worktrees/handoff-file-continuation-a8251b`, branch `feature/handoff-file-continuation-a8251b`.
- `main` on GitHub (`me-cedric/Shipyard`, now public) holds every committed and checked change, plus this handoff and the plans.
- Uncommitted work at the stop is saved as one commit "wip: …" on the branch `wip/w14-and-owner-fixes` (pushed to origin). It is NOT checked as a whole. Continue from it: `git switch wip/w14-and-owner-fixes` in a worktree, or cherry-pick it on the feature branch.

## What the wip commit holds

1. Done by a worker and checked by it (fmt, clippy, `cargo test -p shipyard-app`, typecheck, biome, vitest 1112, e2e connections, code, sync, a11y), not yet re-checked by the lead:
   - Stale sync failure clears on a new secret or a passed test (`commands/sync.rs` `recover`, `shipyard-store/src/mirror.rs` `clear_failure`).
   - One GitHub or GitLab sign-in serves both roles (`connections.rs` `serve_twin`), and `auto_link` links the code host from `origin` (`commands/setup.rs`).
   - Pull requests empty state: error, "New pull request", or "Connect" (`src/features/code/no-pulls.tsx`, command `pulls_status_get`).
   - Copy on the browser sign-in code.
2. Done by a worker and checked by it (same checks, e2e code and a11y), not re-checked by the lead:
   - Login shell PATH for child processes (`crates/shipyard-agents/src/which.rs` `fix_path`, called first in `run()`), so a Dock launch finds pnpm.
   - A failed check shows the exit code and the last 12 lines (`delivery.rs` `run_gate_out`); a missing program is named, with an install action.
   - Checks in this order: `.shipyard/project.yaml` gates, then `agent-compass.commands.json`, then stack detection (`qa.rs`); "Set up checks" dialog (`quality-setup.tsx`) that proposes gates from CI `run:` steps.
   - No CHANGELOG entry yet for this part.
3. W14 (stopped mid-way at the owner's usage limit; writers A and B were in the Build phase; no review ran):
   - Writer A: agent reviews as Factory sessions and Home / Needs you drafts (`pr_agent.rs`, `factory.rs`, `src/features/factory/sessions/`, `src/features/home/inbox/`), inline review comments (`crates/shipyard-forges/src/code.rs`), settled archive format and folded status (`crates/shipyard-store/src/archive.rs`, `raid.rs`).
   - Writer B: draw.io preview (`src/ui/organisms/drawio*.ts(x)`, fixtures), actions pinned to SHAs (`.github/workflows/ci.yml`, `security.yml`), capacity warning opens the week (`src/features/work/week-focus.ts`, `plan.tsx`, `team.tsx`).
   - State unknown: run the full suite, then an Opus review in a fresh context, then fix.

## Next steps, in order

1. Check the wip commit: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --no-fail-fast` (about 30 min on this Mac), `pnpm typecheck`, `npx biome check .`, `pnpm test`, `CI=1 npx playwright test`, `pnpm test:personas`. Fix what fails, finish W14 (see `w15.md` top for scope), review in a fresh context, commit, push.
2. The web CI test `src/features/work/plan.test.tsx` "links a capacity warning…" timed out at 5 s on GitHub (lazy Team route). W14 writer B changed it; check it.
3. Run CI locally before each push: Linux jobs with `act` from a clean clone (`act push -W .github/workflows/ci.yml --matrix os:ubuntu-latest -P ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-24.04 --container-architecture linux/arm64 --env CARGO_BUILD_JOBS=1`; Docker has 7.7 GB), and the macOS steps on the Mac.
4. Rebuild and reinstall: `pnpm tauri:release`, move `/Applications/Shipyard.app` to the Trash, copy `target/release/bundle/macos/Shipyard.app` to `/Applications`.
5. W15: stage 0 first, then stages 1 to 4 (`w15.md`).
6. Guided run with the owner (postponed): browser sign-in to GitHub and GitLab, the GitLab tools switch, opening the Shipyard repository and StoryArc.

## Facts to keep

- GitHub CI runs again since the repository went public (unlimited Actions). Private vulnerability reporting is on.
- The OAuth client ids are in `crates/shipyard-app/resources/oauth.env` (public ids; no secret).
- `pgrep -f "cargo (test|build|clippy)"` always matches the waiting shell itself: wait on `pgrep -x cargo` instead.
- Each new test binary waits 10 to 20 s on macOS before it starts, so a full `cargo test` takes about 30 minutes here.
- Owner rules (also in memory): no trace of the older app's name anywhere; words "issue tracker" and "code host"; at most 4 agents at a time; push `main` when checks pass; agent-compass changes go to the personal fork only.

## Progress log

- 2026-10-31 (resume): the feature branch is rebased on `main` (`6d65d01`); the wip commit is now `b5dba1c` on `feature/handoff-file-continuation-a8251b` (local). Running the fast checks (fmt, clippy, typecheck, biome, vitest) on it.
- Fast checks on `b5dba1c` passed: fmt, clippy, typecheck, biome, vitest 1112 of 1112. Running `cargo test --workspace`, e2e and personas next.
- Fresh Opus review of `b5dba1c`: 2 P1, 12 P2. P1: the sign-in `DeviceCode` (Copy) is defined but not rendered (connection-form.tsx:322, gitlab-tools.tsx:69); `serve_twin` copies a single-use GitLab refresh token into a second entry (connections.rs:577) so one role breaks after a refresh. P2: a rotated secret never reaches the twin; `fix_path` uses `zsh -l` (no .zshrc), breaks on fish, blocks start for 3 s, wrong SAFETY comment; "Set up checks" proposes detected commands over saved gates; the run confirm shows "Run Lint?" not the command; forge review refused with line notes and an empty summary; GitLab partial post leads to a double post on retry; Stop during worktree set-up is lost (pr_agent.rs); Home reads up to 40 pull request pages per load (pr_agent.rs:362); a Test click writes project.yaml via auto_link and links an unrelated code host when there is no origin; no-pulls.tsx blank on a status error; CHANGELOG entries missing for the checks work and one wrong line; no tests for fix_path, the GitLab partial failure, the draw.io decompression size. Clean: pinned SHAs, draw.io preview safety, EN/FR strings, gates save gating. A fixer works on all of them next.
- Full run on `b5dba1c`: cargo test 1 failure (`connections::tests::one_secret_serves_both_roles…`, rewritten with the shared credential fix); personas tester and developer fail (the Quality card is now named "Tests", probes look for "Run pnpm test"). Both sent to the fixer.
- The fixer fixed all 14 review findings and the 2 extra failures (shared credential entry via `uses`, `-l -i -c` PATH with markers and a 1 s cap, saved gates first, command in the run confirm, review with notes only, GitLab partial post, stop flag, 60 s head cache, no silent auto-link on Test, error notice on Pull requests, changelogs, draw.io 8 MB inflate limit). Its checks passed: crates app, agents, forges, store 890 tests; vitest 1114; e2e 108; personas 7 of 7. The lead re-runs the full suite before the commit.
- `5d46931` on main: W14 and the owner fixes, one commit. The lead re-ran: fmt, clippy, typecheck, biome, vitest 1114, cargo test --workspace (0 failed), bindings unchanged, no old name. The wip branch `wip/w14-and-owner-fixes` is now obsolete. Next: GitHub CI on 5d46931, rebuild and reinstall the app, then W15 stage 0 (see w15.md).
- GitHub CI green on `2d43e00` (all 4 jobs). New build installed in /Applications (old app in the Trash). Next: W15 stage 0.
- W15 stage 0 started: writer A (Time with no team and the login on the connection, pull request sync without an issue tracker, model and effort pickers); writer B (empty states that never look like loading, document inspector, terminal without the window bar and with a side dock and a shared Splitter). Then a fresh review and a fixer.
- Writer B done (checks passed): EmptyState with icon, title and action and no ghost rows (32 callers, rule in visual-language-v2 and ADR 0014 note); shared Splitter and per-person panel sizes; terminal without the window bar, docked bottom, left or right; document inspector (path, preview, outline, last change via `git_last_change`, Open, Edit). Open: Edit on a non-handbook document opens the same page as Open; Open does not reselect when the page is already open; specs still say "ghost rows" (design-system REQ-010 and others); no shimmering Loading component yet; side dock not checked in a real window.
- Writer A done (its checks passed): Time saves the issue tracker login on a passed test, finds the person (login, git e-mail), "Add me to the team" empty state, errors `no_member` and `no_account`; pull request mirror for a project with only a code host; model and effort pickers (Codex and OpenCode list models, Claude and Copilot give levels from --help, tables for the rest; `crates/shipyard-agents/src/catalog.rs`). Open: the engine applies only low, medium, high, xhigh, max (Codex minimal or ultra saved but not applied); the model tables are a best guess; the pickers not checked in the real app. Next: full suite and a fresh review of stage 0.
- Fresh Opus review of stage 0: 2 P1, 7 P2. P1: `me_of` (work.rs:442) matches the part before @ and can pick another member; GitLab `me().id` is the numeric id, saved as the login (gitlab.rs:44). P2: Codex `minimal` effort silently dropped (run_engine.rs:80); Edit for documents and slides does nothing, and a pending edit leaks (ref-page.ts, pages.tsx:55); Splitter has no pointer cancel (splitter.tsx:76); a new token for another account keeps the old login (connections.rs:478); catalog runs tools in the app folder with the full environment and `wait()` has no limit (catalog.rs:121); a named member that does not exist maps to no_member (work.rs:1349); missing tests (login chain, same e-mail part, unknown effort, drag cancel). Clean: the empty issue tracker in the engine, prefs ranges, inspector paths, EN and FR, changelogs. A fixer works on them next.

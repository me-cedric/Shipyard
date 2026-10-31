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

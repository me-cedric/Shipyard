# Shipyard handoff

State on 2026-10-29: waves W0 to W9 are on local `main`. Nothing after a3f8b97 is pushed: `origin/main` waits for the owner's yes. The build plan of MASTER-PLAN section 10 is done except the owner-only items of section 6.

## 1. Read first

1. `AGENTS.md`: the compass contract and the Shipyard rules (specs first, waves, model tiers, UI rules, changelog).
2. `docs/openspec/constitution.md` and `docs/plan/MASTER-PLAN.md` (sections 4, 5, 8 and 10).
3. `.agents/progress/w7.md` to `w9.md`: the decisions and the open items of the last three waves. Read only the sections you need.
4. `docs/guide/dev.md` (setup, scripts, checks, sidecar) and one page per space in `docs/guide/`.

## 2. What exists

| Wave | Content |
|---|---|
| W0 to W6 | Plan, specs, skeleton, core, Work, Design and Specs, factory engine. See `.agents/progress/w1.md` to `w6.md`. |
| W7 | Factory views (Runs lanes, run view with the xyflow DAG, event tail, diff, cost; Workflows and Roles; Agents map; Sessions; Usage), budgets per day and per member, Home / Inbox (questions, approvals, plan review, messages), "needs you" notifications, the assistant panel. |
| W8 | Knowledge (graph, Explain, handbook, documents with `.docx` and `.xlsx` exports, slides with reveal.js, learn, dashboards), extensions (compass rules, catalog, plugins with review, child projects), Code remainder (pull requests, quality, impacts with Analyze, terminal on `portable-pty` and xterm, file viewer), My work, Activity, model tiers. |
| W9 | Project import, `shipyard` sidecar for release builds, design-system and shell tests, axe on every tab, lazy slides, forge repository create, notification sources, update notes, spec sync, guide pages. |

Checks on the W9 merge, all passed: `cargo fmt`, `cargo clippy -D warnings`, 1300 Rust tests, typecheck, lint, 761 vitest tests, `pnpm build`, the full Playwright suite (18 spec files), `ipc:check`, OpenSpec strict 16 of 16, `ac check --docs`.

Open tasks: only `add-connections` T012c (Windows named pipe of the MCP relay, Q-096). The compare tasks are ticked for the compare part; the RAID closing that they name waits for the owner.

## 3. Owner-only next steps

1. Push: `git push origin main` (SSH; see section 6). Delete remote `feat/app/skeleton` if you agree.
2. Decide the RAID questions in `docs/delivery/questions/` (87 files). The code follows the recommended option of each. Then close them in the compare tasks of each change.
3. Decide ADR 0011, 0012 and 0013 (status `proposed`).
4. First runs against a real tracker, forge and Claude Code: check the `type: http` entry, the MCP bridge, the gate commands and a push with a credential. Nothing has run against a real service.
5. Signed builds: certificates, signing and notarisation of the app and the `shipyard` sidecar (`pnpm tauri:release`, not run end to end).
6. Windows: build and test the named pipe of the MCP relay (T012c) on a Windows machine.

## 4. Known gaps (from the task notes)

- Day and member budgets are money only (Q-061). Their alert flags are not saved.
- Upgrade of compass rules cannot limit to a selection (Q-074). A deck does not export as one offline file (Q-071).
- Only the `secrets` scanner ships. Delivery does not read `assignee`, and Automation does not edit `reviewers`.
- Settings / Me has no fonts or shortcuts (Q-099). The assistant has no UI to discard a worktree or edit project defaults.
- The terminal is a tab, not a panel on every view (Q-088). The main chunk is 1.68 MB: per-tab lazy routes would cut it.
- Several "keyboard, focus ring, French" acceptance criteria have no test and stay unticked.

## 5. Checks

```bash
cargo fmt --all --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e && pnpm ipc:check
cd docs && npx -y @fission-ai/openspec@1.15.0 validate --all --strict
node docs/agent-compass/bin/ac.mjs check --docs
```

- Never run a filtered `cargo test` to regenerate bindings. Use `pnpm ipc:gen`.
- `ac` on this Mac is a system tool. Run agent-compass as `node docs/agent-compass/bin/ac.mjs`.
- If Playwright reports a missing Chromium, run `pnpm exec playwright install chromium`.
- Run one full suite at a time: two in parallel stall the runner tests on macOS and time out Playwright.

## 6. Known issues

- `git push` over HTTPS returns 403. Pushes use SSH: the push URL of `origin` is `git@github.com:me-cedric/Shipyard.git`.
- The compass guard blocks `git merge` and `git pull` without `--rebase`. Rebase instead.
- `shipyard-agents` test `an_installed_runner_shows_as_detected_with_its_version` failed once under load and passed on rerun.
- An axe check of the Agents map (`label-content-name-mismatch`) failed once in a parallel run and passed on rerun.
- Two writers in one stage must get separate RAID id ranges: Q-066 to Q-068 are unused after a collision.

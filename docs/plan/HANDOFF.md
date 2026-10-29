# Shipyard handoff

State on 2026-10-29: waves W0 to W6 are on `main` (4071a12). W7 to W9 are not started. The owner asked to stop after W6 and start W7 in a fresh session from this folder.

## 1. Read first

1. `AGENTS.md`: the compass contract and the Shipyard rules (specs first, waves, model tiers, UI rules, changelog).
2. `docs/openspec/constitution.md` and `docs/plan/MASTER-PLAN.md` (sections 4, 5, 8 and 10).
3. `.agents/progress/w1.md` (shared vocabulary), then `w3.md` to `w6.md` (the APIs and the open items of each wave). Read only the sections you need.
4. `docs/guide/dev.md`: setup, scripts and checks.

## 2. What exists

| Wave | Content | Spec changes done |
|---|---|---|
| W0 | Plan, constitution, ADRs 0001 to 0010, logo, agent-compass v1.0.2 submodule | — |
| W1 | 16 OpenSpec changes in `docs/openspec/changes/add-*` | all validated |
| W2 | Rust workspace, Tauri shell, tauri-specta IPC with typed mock, atomic design system, shell with 7 spaces, i18n EN and FR, CI | design-system, shell (partial) |
| W3 | Refs index, projects, connections (keychain, 6 trackers, 3 forges), MCP control, runners, git and the Code space basics, notifications, native menu | refs, projects, connections |
| W4 | Work space (backlog, board, team, estimates with seal and Excel, Gantt plan, time, apply) and the tracker sync engine (mirror, pickup, claims, hand-off) | work, sync |
| W5 | Design and Specs spaces (diagram editors, ADRs, API, data, flows, OpenSpec views, questions register, test plans, split to work items) | design, specs |
| W6 | Factory backend: run state machine, workflow DAG, default workflows and roles, runners, worktrees, MCP agent tools and bridge, question loop, review, pull request, CI feedback, merge close, persistence, app wiring, IPC and a demo dataset in the typed mock | factory, questions-loop, delivery (backend) |

Checks on 4071a12, all passed: 1109 Rust tests, 464 vitest tests, 35 Playwright tests, `ipc:check`, OpenSpec strict 16 of 16.

Open tasks per change (count of unticked `T` lines): assistant 26, knowledge 26, extensions 24, code 20, shell 18, design-system 15, factory 7, questions-loop 7, delivery 6, connections 4, design 2, projects 2, work 2.

## 3. Next waves

| Wave | Branch | Scope |
|---|---|---|
| W7 | `feat/factory/ui` | Factory views (Runs lanes, run view with the workflow DAG in xyflow, event tail, diff, cost; Workflows and Roles editors; Agents map; Sessions; Usage), Home / Inbox (questions with options, approvals, messages, plan review), delivery cards, notifications for "needs you", the assistant panel (add-assistant). Data: the W6 commands and the typed mock demo (14 runs) listed in `.agents/progress/w6.md`. |
| W8 | `feat/knowledge/roles` | Knowledge (graph, explain, handbook, documents, slides, learn, dashboards), extensions (compass rules, plugins, catalog, child projects), Code remainder (pull requests view, quality scanners, impacts, terminal), role homes, junior mode. |
| W9 | `chore/release/hardening` | Legacy import, a11y, performance, packaging (ship the `shipyard` binary as Tauri `externalBin` for the MCP bridge), first runs against a real tracker, forge and Claude Code, UI polish, docs, full e2e. |

## 4. How each wave runs

1. Create a worktree from `main`: `git worktree add -b <branch> ../shipyard-wN origin/main`, then `git submodule update --init`.
2. Start one session for the wave in that worktree. Inside it, use Sonnet workers (medium effort) with 2 parallel at most on disjoint files. Run one Opus reviewer in a fresh context on the diff, then one Sonnet fixer.
3. Keep `.agents/progress/wN.md` current.
4. Verify every check yourself, then rebase on `origin/main` and fast-forward `main`. Remove the worktree and the branch.
5. Every brief restates the style contract (`ponytail` full, `i-have-adhd`, `caveman`, `asd-ste100`) and asks for a report of 400 words or fewer.
6. Owner rule: when Legacy (`/Users/mecedric/Documents/Projects/legacy-app`) has working code for a piece, copy and improve it. Name the source file in the commit body. Never copy its cluttered UI or legacy CSS.

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

## 6. Known issues

- `git push` over HTTPS returns 403. Pushes use SSH: the push URL of `origin` is `git@github.com:me-cedric/Shipyard.git`.
- The compass guard blocks `git merge` and `git pull` without `--rebase`. Rebase instead.
- Remote branch `feat/app/skeleton` holds the pre-rebase W2 commits. Its content is on `main`. Delete it only with the owner's yes.
- Nothing has run against a real tracker, forge or agent CLI. The adapters are tested with fakes only.
- `Step.mode` defaults to `Auto`. The shipped workflows mark every read-only step `mode: plan`, and a test checks it.
- Gate commands still hold the pump thread for up to 15 minutes. Views, tools, sync and exit do not wait.
- Two concurrent full test suites can stall the runner tests on macOS (script launch limit). Run one suite at a time.

## 7. Open decisions for the owner

- 49 RAID questions are open in `docs/delivery/questions/`. The code follows the recommended option of each. The first three:
  - Q-001: Switzer font licence. Inter is used until it is clear.
  - Q-002: default of the automation writes. All are off.
  - Q-003: scope of the Legacy import.
- ADR 0011 (xlsx crates and seal primitives) has the status `proposed`.
- Design T016 and T017 (Figma tokens) are not built.
- The fold bullet format is `- Q-NNN <question>: <answer>` (W5 form), not Legacy's `Q: … → A: …`.

## 8. Start prompt for the fresh session

> Read `docs/plan/HANDOFF.md`. Run wave W7 as section 3 and section 4 describe. Stop after W7 is merged and report.

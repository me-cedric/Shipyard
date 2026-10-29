# Plan: code

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

Git operations live in `shipyard-git`. Forge calls live in `shipyard-forges`. Pure rules (message, branch name, links, digest rules) live in `shipyard-core`. The UI is `src/features/code/`. This covers REQ-001 to REQ-037.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). TanStack Table and Virtual for the tree, the log and the lists. |
| Dependencies | No new dependency by default. The terminal needs a PTY crate and a terminal emulator package. Reuse one that the workspace holds, else raise an ADR before adding it. |
| Data/storage | Quality reports in `docs/security/` and `docs/quality/`. Impact reports in `docs/delivery/impacts/` and `docs/delivery/digests/`, one dated file each. The watch interval is a per-machine value in the app data folder (Q-042). The mirror stays in the app data folder. |
| APIs/contracts | IPC commands `git_*`, `branch_*`, `pr_*`, `quality_*`, `impact_*`, `terminal_*`. Events `watch_notice` and `terminal_data`. Bindings are generated. Uses the `Forge` trait of `add-connections`. |
| Git | git2 in `shipyard-git`. One credentials path, shared with worktrees. Conflict blocks parse in a pure function. |
| Commit rules | A pure function in `shipyard-core` checks the summary, the branch name and the work item key. It lists the refs of a commit. |
| Remote watch | A timer task fetches the remote heads only. It compares the heads with the last stored heads and emits one event on a change. It never calls a checkout or a merge. |
| Sync action | The status bar action calls the sync tick, then a fetch and a fast-forward when clean (Q-041 option 1). |
| Pull requests | Views read the mirror of `add-sync`. Writes (open, comment, review, merge, mark ready) go through the `Forge` trait. Mark ready uses the draft flag of each forge. |
| Quality | Checks run the scripts that the project declares. Scanners run as child processes after a click (Q-043). Reports pass a redaction step before they reach a file. |
| Impacts | The diff comes from `shipyard-git`. Analyze starts the shared runner layer of `add-assistant` with two separate prompts, one for the plan and one for the digest. A pure check refuses a digest that holds a path or a secret pattern. |
| Terminal | A PTY session in `shipyard-app`. The environment is built from an allow list and holds no connection secret. |
| Shared components | `DiffView` goes to `src/ui/` as an organism. `add-factory` and `add-delivery` reuse it. A feature imports only `ui`, `lib` and its own folder. |
| Risks | A discard loses work: the confirmation and a test guard it. The watch must never write: a test compares the working copy before and after. Scanner output may hold a secret: redaction and a test cover it. |

## Affected Surfaces

- Code: `crates/shipyard-core` (rules), `crates/shipyard-git` (operations, watch fetch), `crates/shipyard-forges` (pull request calls), `crates/shipyard-store` (report codecs, commit link index), `crates/shipyard-agents` (Analyze through the runner), `crates/shipyard-app` (commands, watch task, terminal), `src/ui/` (DiffView), `src/features/code/`.
- Tests: `crates/*/tests`, `src/features/code/*.test.tsx`, `e2e/code.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-code/`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-041, Q-042, Q-043.

## Approach

1. Write the pure rules in `shipyard-core` with unit tests: message, branch name, links, digest check.
2. Add the git operations in `shipyard-git` with tests on temporary repositories: status, diffs, stage, discard, stash, conflicts, commit, log, branches, fetch.
3. Add the forge calls in `shipyard-forges` with contract tests on a fake forge.
4. Add the report codecs and the commit link index in `shipyard-store`.
5. Add Analyze in `shipyard-agents` with a fake runner.
6. Add the IPC commands, the watch task and the terminal in `shipyard-app`.
7. Add `DiffView` to `src/ui/`. Build Changes with the commit form, then History and Branches.
8. Build Pull requests, Quality and Impacts.
9. Build the terminal panel and the file viewer. Add French and English keys and the changelog entries.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-git
cargo test -p shipyard-forges
cargo test -p shipyard-store
cargo test -p shipyard-agents
cargo test -p shipyard-app
pnpm vitest run src/features/code
pnpm playwright test e2e/code.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-code --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

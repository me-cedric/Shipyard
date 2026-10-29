# Plan: delivery

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

The pull request flow, feedback loop and merge close live in `shipyard-engine`. Pure rules (branch name, body, lane data) live in `shipyard-core`. Forge calls go through `shipyard-forges` and git calls through `shipyard-git`. The UI adds card data to Factory / Runs. This covers REQ-001 to REQ-029.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). Steps run on the engine runtime of `add-factory`. |
| Dependencies | No new dependency. Reuse `git2` through `shipyard-git` and the `Forge` trait of `add-connections`. |
| Data/storage | The `pr:` rows come from the mirror of `sync` (`shipyard_store::pr::rows`), with no new table. The run records its pull request as a `pr` event of the run log (`pr::record`), and each side finds the other (`pr_of_run`, `runs_of`). A forge with no CI counts as pending for the lane. Reviewer list in `.shipyard/automation.yaml`. Gate commands in `.shipyard/project.yaml` (Q-030). |
| APIs/contracts | Uses the `Forge` and `Tracker` traits. IPC command `delivery_pr_state`. Approvals use `approval_decide` of `add-factory`. Events `pr_opened`, `review_round`. Bindings are generated. |
| Review | A workflow step with role `reviewer` and `fresh_context: true`, `max_rounds: 2`. A pure function opens each cited path and line. |
| Pull request | Pure functions in `shipyard-core::delivery` build the branch, title, labels and body from the run log. The branch slug folds accents and keeps 60 characters at most. A base whose name starts with `release` is refused. The type label is the first existing one of a fixed list (for `fix`: `fix`, `bug`, `bugfix`). An area label matches a folder of a changed path, as `ui`, `area:ui` or `area/ui`. Every line with `Co-Authored-By:` or `Generated with` is removed. The engine calls the forge only after the switch check. |
| Engine ports | `shipyard-engine` does not depend on `shipyard-git` or `shipyard-forges`. It talks to three ports in `ports.rs`: `Git` (join of child worktrees, changes, review input, cited line, rename, commit, rebase, gate, worktree removal), `Pulls` (branches, labels, find by branch, failed checks, open threads) and `Writer` (`Write::Push`, `Write::OpenPr`, `Write::ResolveThreads`, tracker writes). The app wraps the crates in them (T018). Fakes: `FakeGit`, `FakePulls`, `FakeWriter`. |
| Run steps | `review.rs` (reviewer brief, finding check, gate, fix rounds), `children.rs` (join at fan-in), `pull_request.rs` (rename, commit, rebase, push, find, open: each stage looks at the real state first), `feedback.rs` (events, rounds, limits, closed), `merge.rs` (summary, worktrees, `Done`). |
| Forge calls | The `PullApi` trait in `shipyard-forges/src/pull_request.rs` (`connect_pull_api`): find by branch, create draft or ready, mark ready, add existing labels, request reviewers, threads (list, reply, resolve) and `status` (draft, CI, change request, merge state). GitHub uses GraphQL for threads. Azure DevOps has no label list (labels in use on the last 100 pull requests) and takes reviewers as identity ids. |
| Git calls | `shipyard-git/src/delivery.rs`: `rename_branch`, `rebase_onto`, `commit_scope` (HEAD plus the given files only), `push_run_branch` (plain or force with lease; never the base, a default branch name or `release/*`). |
| Feedback | The engine takes the CI and review events of `sync`. It moves the run in the same worktree and passes the failed checks and threads as step input. |
| Merge close | On a merge event the engine moves the run, then the ticket, then posts the summary, then removes the worktree. Each step is a logged write. |
| Idempotence | Before a write, the engine looks for its trace in the run log and for the pull request of the branch on the forge. |
| Risks | A GitLab draft runs no pipeline, so CI feedback starts at ready. A crash between two writes. The log trace and the forge lookup cover it. |

## Affected Surfaces

- Code: `crates/shipyard-core` (pure rules), `crates/shipyard-engine` (steps, feedback, close), `crates/shipyard-forges` (pull request, threads, labels), `crates/shipyard-git` (branch, rebase, force with lease, worktree removal), `crates/shipyard-store` (`pr:` rows), `src/features/factory/` (lane cards, approvals).
- Tests: `crates/*/tests`, `src/features/factory/*.test.tsx`, `e2e/delivery.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-delivery/`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-029, Q-030, Q-031.

## Approach

1. Write the pure rules in `shipyard-core` with unit tests: branch name, base choice, labels, body, lane data.
2. Add the review step and the finding check (REQ-001 to REQ-006).
3. Add the branch, commit and rebase operations in `shipyard-git` (REQ-007, REQ-008).
4. Add the pull request calls in `shipyard-forges` with the switch check and approvals (REQ-009 to REQ-017).
5. Add the feedback loop for CI and review comments (REQ-018 to REQ-021).
6. Add the merge close: run state, ticket move, summary, worktree removal (REQ-022 to REQ-025).
7. Add the closed-without-merge path and the impacts digest (REQ-026, REQ-027).
8. Expose `pr:` entities and the lane card data (REQ-028).
9. Build the cards and the approvals in Factory / Runs. Add French and English keys (REQ-029).

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-git
cargo test -p shipyard-forges
cargo test -p shipyard-engine
pnpm vitest run src/features/factory
pnpm playwright test e2e/delivery.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-delivery --strict
```

## Open Items

- The `reviewers` key of `automation.yaml` (REQ-012): the engine takes `Project.reviewers`. Add the key to the codec of `add-factory` REQ-025.
- The assignee of the pull request (REQ-012) and the impacts digest (REQ-027): no port yet.
- `PullApi` has no log tail for a failed check: `Pulls::failed_checks` returns names and URLs, and the tail when the adapter has it.
- `shipyard-git` has no squash of a child branch into the run folder: the app adapter of `Git::merge_child` needs one (apply the diff from the merge base to the child tip to the working copy, uncommitted).
- A pull request that merges while the run works on a fix is refused by the state machine (`PrMerged` is valid from `PROpen` only).

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

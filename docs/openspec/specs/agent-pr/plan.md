# Plan: agent-pr

Spec: [spec.md](./spec.md)
Date: 2026-10-31

## Summary

One agent review runs on top of the existing reviewer in `shipyard-engine`. The app adds three actions and one setting. The sync tick starts the automatic review. This covers REQ-001 to REQ-010.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. Reuse `crates/shipyard-engine/src/review.rs` and `crates/shipyard-engine/src/pull_request.rs`. |
| Data/storage | `.shipyard/automation.yaml` gets `auto_review: off \| draft \| post` (default `off`). A draft review stays in the app data folder until a person posts it. |
| APIs/contracts | New IPC commands in `crates/shipyard-app/src/pr_agent.rs`. The post uses the existing `pull_verdict` and inline comments. Bindings are generated. |
| Risks | A review for each push can cost money. The head commit rule, the budget, the concurrency limit and the kill switch bound it. |

## Affected Surfaces

- Code: `crates/shipyard-app/src/code.rs`, `crates/shipyard-app/src/pr_agent.rs`, `crates/shipyard-engine/src/review.rs`, `crates/shipyard-core/src/pickup.rs`, `src/features/code/pull-requests.tsx`, `src/features/code/pr-ai.tsx`.
- Tests: `crates/*/tests`, `src/features/code/*.test.tsx`, `e2e/code.spec.ts`, `e2e/a11y.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-agent-pr-actions/`, `docs/guide/code.md`, `docs/guide/settings.md`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Approach

1. Write tests for the prompt, the draft shape and the one-review-per-head rule.
2. Add the one-off agent review: read-only worktree, draft result, session, budget and kill switch.
3. Post an edited draft through `pull_verdict`.
4. Add "Write with an agent" to the new pull request form.
5. Add `auto_review` to `pickup.rs` and the sync tick trigger.
6. Build the UI and the Settings / Project choice, in English and French.

## Validation

```bash
cargo test --workspace
pnpm test
pnpm playwright test e2e/code.spec.ts e2e/a11y.spec.ts
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-agent-pr-actions --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

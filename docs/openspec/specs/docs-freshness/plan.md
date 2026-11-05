# Plan: docs-freshness

Spec: [spec.md](./spec.md)
Date: 2026-11-04

## Summary

A pure function in `shipyard-core` turns the rules and the list of changed files into the stale docs. The existing chain code in `overview.rs` calls it instead of the fixed `CHAIN` table. The project file gets the optional `docs` list. Code / Quality gets one more check. One new default workflow runs the `docs` role after a click. This covers REQ-001 to REQ-012.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. A small matcher for `*` (one path segment) and `**` (any segments) in `shipyard-core`. A glob crate is not worth it for two wildcards. |
| Data/storage | Rules in `.shipyard/project.yaml` under `docs`. Acknowledgements stay in `docs/delivery/chain-acks.json`. The Docs check report is a repository text file like the other quality reports (`code` REQ-028). |
| APIs/contracts | `ProjectFile` gets `docs: Vec<DocRule>` with `#[serde(default, skip_serializing_if = "Vec::is_empty")]`. The struct has `deny_unknown_fields`, so a project file with `docs` fails in an older build: the field ships in the same release as the reader. The IPC bindings are generated, not edited. |
| Risks | A rule with a broad pattern warns on every change: the acknowledgement with a reason is the release valve. A doc target that is a path kind with an empty folder never counts as followed until a file exists. A rename is a change in two paths: both count. The agent can write a doc that parses but is wrong: the person reviews the pull request. |

## Affected Surfaces

- Code: `crates/shipyard-core/src/project.rs` (`DocRule`, `validate`), `crates/shipyard-core/src/docs_fresh.rs` (new, pure), `crates/shipyard-app/src/commands/overview.rs` (`stale`, `chain_gate`, `chain_watch`), `crates/shipyard-app/src/qa.rs` (Docs check), `crates/shipyard-store/src/factory_files.rs` (`docs-update` default workflow), `src/features/code/chain-watch.tsx`, `src/features/code/chain-ack.tsx`, `src/features/code/quality.tsx`, the French and English strings of `src/lib/i18n/`.
- Tests: `crates/shipyard-core/src/docs_fresh.rs`, `crates/shipyard-core/src/project.rs`, `crates/shipyard-app/src/commands/overview.rs`, `crates/shipyard-app/src/qa.rs`, `src/features/code/quality.test.tsx`, `src/features/code/chain-ack.test.tsx`, `e2e/code.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-docs-freshness/`, `docs/guide/code.md`, `docs/guide/settings.md`, `CHANGELOG.md`, `CHANGELOG.fr.md`, and the docs of `docs/models/`, `docs/data-models/` and `docs/flows/` when the implementation changes them.

## Approach

1. Write tests, then add `DocRule` and its validation in `project.rs`.
2. Write tests, then write `docs_fresh::stale(rules, changed)`: one warning for each rule and each doc target where a matched file changed and no file of the target changed. The default rules are the old chain.
3. Replace the `CHAIN` table in `overview.rs` with the rules of the project. The signature of `stale` and the type `ChainWarning` stay, so `chain_acks.rs` and the views keep working. `from` is the rule name, or its first pattern when it has no name.
4. Write tests, then add the Docs check to `qa.rs` and `quality.tsx`.
5. Add the `docs-update` workflow: one `update` step with the `docs` role in a worktree, then the `pr` step. Add the "Update with an agent" action on the warning and the Docs check. After the run, read each changed doc with the reader of its folder (`design::list` issues, `gherkin::parse`) and drop a doc that does not parse from the change.
6. Add the texts in French and English. Update the guide pages and the changelog.

## Validation

```bash
cargo test -p shipyard-core -p shipyard-app
pnpm typecheck
pnpm test src/features/code
pnpm playwright test e2e/code.spec.ts
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-docs-freshness --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

# Plan: specs

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

The codecs for OpenSpec changes, RAID files and Gherkin plans live in `shipyard-store`. Domain rules (artifact status, markers, coverage, split model) live in `shipyard-core` and do no I/O. The UI lives in `src/features/specs/`. This covers REQ-001 to REQ-023.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). |
| Dependencies | No new dependency. Run the OpenSpec CLI (`npx -y @fission-ai/openspec@latest`) for strict validation. Reuse the YAML codec. |
| Data/storage | Files only: `docs/openspec/**`, `docs/delivery/questions/Q-NNN.md`, the test plan files (Q-037). The draft split lives in the app data folder until apply. |
| APIs/contracts | IPC commands `specs_changes`, `specs_validate`, `specs_questions`, `specs_testplans`, `specs_fold`, `specs_split_draft`, `specs_split_apply`, `specs_archive`. Bindings are generated. |
| Artifact status | `shipyard-core` reads the five artifact files of a change and returns missing, draft or done. |
| Validation | `shipyard-store` runs the CLI with `--strict --json` and maps each finding to its artifact and line. |
| RAID codec | One reader and one writer in `shipyard-store`. The writer keeps the nine keys in order and rejects an unknown kind or status. |
| Gherkin | A parser in `shipyard-core` returns scenarios, steps and cited requirement refs. Coverage is a set difference. |
| Fold | A text edit under `### Clarifications` in `## Purpose`. It shows a preview and writes only after a click. |
| Split | The `spec-split` workflow writes a draft file. The reviewed split goes to the `add-work` apply (REQ-025, REQ-026) in `shipyard-trackers`. The apply holds the one match mark (Q-033). |
| Writes | Atomic write by temp file and rename. A check of the modified time before replace. |
| Risks | The CLI needs Node and network on first run. Show the finding "validator missing" and keep the editor usable. |

## Affected Surfaces

- Code: `crates/shipyard-core` (status, coverage, split model), `crates/shipyard-store` (codecs, validation runner), `crates/shipyard-app` (commands), `src/features/specs/`.
- Tests: `crates/shipyard-core/tests`, `crates/shipyard-store/tests`, `src/features/specs/*.test.tsx`, `e2e/specs.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-specs/`, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-035, Q-036, Q-037.

## Approach

1. Write the artifact status and marker counter in `shipyard-core`. Test with fixture changes.
2. Write the RAID codec and its validation (REQ-009, REQ-010).
3. Write the validation runner and its finding mapper.
4. Write the Gherkin parser and the coverage check.
5. Write the fold edit with its preview.
6. Write the split model and the draft file in `shipyard-core`. Hand the reviewed split to the `add-work` apply in `shipyard-trackers`. Use a fake tracker in tests.
7. Write the archive move and the safe write.
8. Add the IPC commands. Build the five views with EditorFrame. Add French and English keys.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-store
pnpm vitest run src/features/specs
pnpm playwright test e2e/specs.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-specs --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

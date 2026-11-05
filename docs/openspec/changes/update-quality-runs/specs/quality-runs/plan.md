# Plan: quality-runs

Spec: [spec.md](./spec.md)
Date: 2026-11-05

## Summary

The backend streams the output of a run and fixes the scope of the scanners and the YAML style. The view shows the running state, the info popovers and the terminal action. This covers REQ-001 to REQ-007.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. The YAML style is a pass over the text of `serde_norway`. |
| Data/storage | The reports stay in `.shipyard/quality/`. |
| APIs/contracts | A progress event for a running check or scanner (output lines). The terminal action reuses `runInTerminal`. |
| Risks | A YAML pass must keep block scalars and nested lists. A secret marker can hide a real secret: the marker is visible in the diff and the guide says when to use it. |

## Affected Surfaces

- Code: `crates/shipyard-app/src/qa.rs`, `scanners.rs`, `code.rs`, `crates/shipyard-store/src/` (YAML writers), `src/features/code/quality.tsx`, `src/lib/i18n/`.
- Tests: `qa.rs`, `scanners.rs`, `code.rs`, the YAML helper, `src/features/code/quality.test.tsx`.
- Docs/specs: `docs/guide/code.md` (EN, FR), `AGENTS.md`, `CHANGELOG.md`, `CHANGELOG.fr.md`, `docs/delivery/test-plans/quality-runs.feature`.

## Validation

```bash
cargo test -p shipyard-store -p shipyard-app
pnpm test src/features/code
cd docs && npx -y @fission-ai/openspec@1.15.0 validate update-quality-runs --strict
```

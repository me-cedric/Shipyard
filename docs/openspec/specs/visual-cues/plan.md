# Plan: visual-cues

Spec: [spec.md](./spec.md)
Date: 2026-11-05

## Summary

One logo atom and one section list molecule in `src/ui`. The connection card, the ref chip and the AI tool lists use the logo atom. The long Settings pages use the section list and pass an icon to each section heading. This covers REQ-001 to REQ-006.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing React 19 and Tailwind tokens. No new runtime. |
| Dependencies | None new. The logo paths are copied from Simple Icons 16.20.0 (CC0) into `src/ui/atoms/brands.ts`, with the licence in a comment. |
| Data/storage | None. |
| APIs/contracts | None. The product is matched from the ids and the names that the screens already have. |
| Risks | A brand can ask to change the use of its logo: the logos are monochrome by default and a product with no CC0 logo shows its first letter. A free AI tool id has no logo: it shows its first letter. |

## Affected Surfaces

- Code: `src/ui/atoms/brand-icon.tsx`, `src/ui/atoms/brands.ts`, `src/ui/molecules/connection-row.tsx`, `src/ui/molecules/ref-chip.tsx`, `src/ui/molecules/section-nav.tsx`, `src/features/settings/**`, `src/features/projects/settings-project.tsx`, `src/features/projects/project-overrides.tsx`, `src/features/assistant/model-menu.tsx`, `src/features/factory/usage/machine-usage.tsx`, `src/features/factory/sessions/*`, `src/features/shell/active-sessions.tsx`.
- Tests: `src/ui/atoms/brand-icon.test.tsx`, `src/ui/molecules/section-nav.test.tsx`, the tests of the touched screens.
- Docs/specs: `docs/designs/screens.json`, `docs/delivery/test-plans/visual-cues.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test src/ui src/features/settings src/features/assistant src/features/factory src/features/shell src/features/projects
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-visual-cues --strict
```

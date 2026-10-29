# Plan: design-system

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

Build the `src/ui/` atomic layers on the stack of MASTER-PLAN 7.3. Tokens come first. Each layer has a gallery page. Covers REQ-001 to REQ-015.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | React 19, Vite, TypeScript strict, Tailwind v4 |
| Dependencies | shadcn/ui on Base UI, `motion`, heroicons-animated, `cmdk`. No new dependency. |
| Data/storage | N/A. Theme, contrast and density live in per-machine preferences (shell). |
| APIs/contracts | N/A. Components take props only. |
| Fonts | Switzer, Departure Mono, Inter fallback. Files bundled with the app (Q-001). |
| Tokens | CSS variables in OKLCH. Themes switch a root attribute. |
| Risks | Switzer licence (Q-001): fallback Inter. Contrast target (Q-005): check with a contrast test. |

## Affected Surfaces

- Code: `src/ui/tokens/`, `src/ui/atoms/`, `src/ui/molecules/`, `src/ui/organisms/`, `src/ui/templates/`, `src/ui/gallery/`, `src/lib/i18n/` (label catalogues).
- Tests: `src/ui/**/*.test.tsx`, `e2e/design-system.spec.ts`.
- Docs/specs: `docs/plan/MASTER-PLAN.md` section 8, `docs/decisions/0009-design-system-base-ui-switzer.md`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Approach

1. Write the tokens and the two themes, the high-contrast option and the two densities.
2. Build the atoms, then the molecules, organisms and templates. Each imports only the lower layer.
3. Add the gallery route. A build flag removes it from the release build.
4. Add a lint rule: no value outside the tokens, no fixed text in a component.
5. Add axe checks and a keyboard test to the gallery e2e.

## Validation

```bash
cargo test -p shipyard-core
pnpm tsc --noEmit
pnpm vitest run src/ui
pnpm playwright test e2e/design-system.spec.ts
cd /Users/mecedric/Documents/Projects/shipyard/docs && npx -y @fission-ai/openspec@latest validate add-design-system --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

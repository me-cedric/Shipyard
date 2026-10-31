# Tasks: design-system

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write token tests (no value outside tokens, themes, densities) in `src/ui/tokens/tokens.test.ts`. REQ-001, REQ-002, REQ-011, REQ-012, REQ-013.
- [x] T002 Implement tokens, themes, high contrast, densities and motion in `src/ui/tokens/`. REQ-001, REQ-002, REQ-011, REQ-012, REQ-013.
- [x] T003 [P] Bundle the fonts and the fallback in `src/ui/tokens/fonts.css`. REQ-003.
- [x] T004 Write atom tests (states, keyboard, focus ring, assistive label) in `src/ui/atoms/atoms.test.tsx`. REQ-004, REQ-014.
- [x] T005 Implement the twelve atoms in `src/ui/atoms/`. REQ-004, REQ-008, REQ-014.
- [x] T006 Write molecule and organism tests (ref chip, question card, empty state) in `src/ui/molecules/molecules.test.tsx` and `src/ui/organisms/organisms.test.tsx`. REQ-005, REQ-009, REQ-010.
- [x] T007 Implement the molecules and organisms in `src/ui/molecules/` and `src/ui/organisms/`. REQ-005, REQ-008, REQ-009, REQ-010.
- [x] T008 Write template tests in `src/ui/templates/templates.test.tsx`. REQ-006.
- [x] T009 Implement the five templates in `src/ui/templates/`. REQ-006, REQ-013. The Editor is `EditorFrame` (Q-094).
- [x] T010 [P] Add the French and English label catalogues in `src/lib/i18n/fr.ts` and `src/lib/i18n/en.ts`. REQ-015. Kept as typed TS files in `src/lib/i18n/` (Q-093).
- [x] T011 Write the gallery e2e (layers, axe, keyboard, release build) in `e2e/design-system.spec.ts`. REQ-007, REQ-014, REQ-015.
- [x] T012 Implement the gallery route in `src/ui/gallery/`. REQ-007.
- [x] T013 Add one entry each to `CHANGELOG.md` and `CHANGELOG.fr.md`. All REQ. Entries exist in both files: "Design system with tokens, components and a gallery in the dev build" and the accessibility pass (`CHANGELOG.md` and `CHANGELOG.fr.md`, 40 bullets each).
- [x] T014 Run the validation commands from `plan.md`. Run 2026-10-29: `cargo test -p` core, trackers, forges, agents, engine, store, app, git and mcp passed; `pnpm tsc --noEmit` passed; `pnpm vitest run` passed (101 files, 761 tests); `pnpm playwright test` passed 95, failed 1: `e2e/a11y.spec.ts` factory light theme, axe `label-content-name-mismatch` on the Agents map run nodes, and the test passed on a second run (flaky, open); `cd docs && npx -y @fission-ai/openspec@1.15.0 validate --all --strict` passed (16 of 16).
- [x] T015 Compare the code with `spec.md` and update stale artifacts. Compared 2026-10-29 with `.agents/progress/w9.md`. The spec matches the code. Fixed: the validation path in `plan.md` is `cd docs`. Gaps: Inter is the text font until ITF gives consent for Switzer (REQ-003, Q-001; the spec states this); the second acceptance criterion (no tagline, helper text or secondary label) has no test, so it stays unticked; the design token view reads `tokens.css`, so `src/ui/tokens/tokens.test.ts` exempts it (Q-099 to Q-101).

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

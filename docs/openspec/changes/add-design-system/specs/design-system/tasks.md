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
- [x] T010 [P] Add the French and English label catalogues in `src/lib/i18n/ui.fr.json` and `src/lib/i18n/ui.en.json`. REQ-015. Kept as typed TS files in `src/lib/i18n/` (Q-093).
- [x] T011 Write the gallery e2e (layers, axe, keyboard, release build) in `e2e/design-system.spec.ts`. REQ-007, REQ-014, REQ-015.
- [x] T012 Implement the gallery route in `src/ui/gallery/`. REQ-007.
- [ ] T013 Add one entry each to `CHANGELOG.md` and `CHANGELOG.fr.md`. All REQ.
- [ ] T014 Run the validation commands from `plan.md`.
- [ ] T015 Compare the code with `spec.md` and update stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

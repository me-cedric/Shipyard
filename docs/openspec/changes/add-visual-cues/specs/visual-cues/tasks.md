# Tasks: visual-cues

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Logo atom `src/ui/atoms/brand-icon.tsx` and data `src/ui/atoms/brands.ts`, with tests (known product, unknown product, label, aria-hidden). Covers REQ-001, REQ-002.
- [x] T002 The connection card `src/ui/molecules/connection-row.tsx` shows the logo. Covers REQ-003.
- [x] T003 The ref chip `src/ui/molecules/ref-chip.tsx` shows the code host logo of a pull request ref. Covers REQ-005.
- [x] T004 [P] The AI tool lists show the logo and the name: assistant model menu, Settings / Me, project overrides, model tiers, Factory / Usage, Factory / Sessions, active sessions. Covers REQ-004.
- [x] T005 [P] Section list `src/ui/molecules/section-nav.tsx` with a test; Settings / Project, Connections and Me use it, and each section heading has an icon. Covers REQ-006.
- [x] T006 Screens registry, screenshots, test plan, changelog lines.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

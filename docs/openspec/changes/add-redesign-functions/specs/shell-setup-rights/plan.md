# Plan: shell-setup-rights

Spec: [spec.md](spec.md)
Date: 2026-11-20

## Summary

Build the 12 requirements of the spec on the commands and stores of today. Each requirement adds a field or a command to a store that exists, and a control on a page that exists. The writer group D owns the files below. No other group edits them.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | The existing stack: Rust crates and the React frontend. |
| Dependencies | None new. A crate for process metrics enters only if the standard library cannot read them (`spec:shell-setup-rights#REQ-003`). |
| Data/storage | A field on an existing file or record. A new table or column goes in `docs/data-models/*.dbml`. |
| APIs/contracts | A new IPC command for a control with no command today. The IPC bindings are generated. The IPC mocks follow each command change. |
| Risks | A write to the code host or the issue tracker needs the permission of other writes. The shared files make a merge conflict: see the order rules in `tasks.md`. |

## Affected Surfaces

- Code: `crates/shipyard-app/src/connections.rs`, `crates/shipyard-app/src/lib.rs`, `crates/shipyard-app/src/machine.rs`, `crates/shipyard-app/src/permissions.rs`, `crates/shipyard-app/src/rights.rs`, `crates/shipyard-app/src/role_model.rs`, `crates/shipyard-app/src/shell/`, `crates/shipyard-app/src/window.rs`, `crates/shipyard-app/src/work.rs`, `crates/shipyard-core/src/rights.rs`, `crates/shipyard-secrets/`, `src/features/crew/rights.tsx`, `src/features/crew/sessions-side.tsx`, `src/features/crew/sessions.tsx`, `src/features/crew/spend-how.tsx`, `src/features/onboarding/permissions.tsx`, `src/features/plan/time.tsx`, `src/features/projects/health-feedback.tsx`, `src/features/settings/agents-rules.tsx`, `src/features/settings/look-rows.tsx`, `src/features/settings/me.tsx`, `src/features/shell/account-menu.tsx`, `src/features/shell/close-guard.tsx`, `src/lib/ipc/mock-extras.ts`, `src/lib/ipc/mock-machine.ts`, `src/lib/ipc/mock-setup.ts`, `src/lib/ipc/mock-work.ts`, `src/lib/ipc/mock.ts`, `src/lib/projects/index.ts`, `src/lib/rights/`, `src/lib/updates/index.ts`
- Tests: a test beside each file, and the Rust tests of each crate.
- Docs/specs: `docs/designs/screens.json` and the pictures for Rights, Sessions, Look and layout and the permissions card; `docs/api/shipyard-mcp.yaml` only if a tool changes; the test plan `docs/delivery/test-plans/shell-setup-rights.feature`; `CHANGELOG.md` and `CHANGELOG.fr.md`; `docs/guide/` (four languages).

## Approach

- REQ-001 (F01): `src/features/shell/account-menu.tsx`, `src/features/settings/me.tsx`, `crates/shipyard-app/src/connections.rs`, `crates/shipyard-secrets/`, `src/lib/ipc/mock-setup.ts`.
- REQ-002 (F20): `src/features/crew/sessions.tsx`, `src/features/crew/sessions-side.tsx`, `crates/shipyard-app/src/machine.rs`, `src/lib/ipc/mock-machine.ts`.
- REQ-003 (F21): `src/features/crew/spend-how.tsx`, `crates/shipyard-app/src/machine.rs`, `src/lib/ipc/mock-machine.ts`.
- REQ-004 (F22): `crates/shipyard-core/src/rights.rs`, `crates/shipyard-app/src/rights.rs`, `src/features/crew/rights.tsx`, `src/lib/rights/`, `src/lib/ipc/mock.ts`.
- REQ-005 (F25): `src/features/plan/time.tsx`, `crates/shipyard-app/src/work.rs`, `src/lib/ipc/mock-work.ts`.
- REQ-006 (F40): `src/features/settings/agents-rules.tsx`, `crates/shipyard-app/src/role_model.rs`, `crates/shipyard-app/src/lib.rs`, `src/lib/ipc/mock-setup.ts`.
- REQ-007 (F41): `src/features/settings/me.tsx`, `crates/shipyard-app/src/shell/`, `src/lib/updates/index.ts`, `src/lib/ipc/mock.ts`.
- REQ-008 (F42): `crates/shipyard-app/src/window.rs`, `src/features/settings/look-rows.tsx`, `src/lib/ipc/mock-extras.ts`.
- REQ-009 (F43): `src/features/projects/health-feedback.tsx`.
- REQ-010 (F44): `src/features/onboarding/permissions.tsx`, `crates/shipyard-app/src/permissions.rs`, `src/lib/ipc/mock.ts`.
- REQ-011 (F45): `crates/shipyard-core/src/rights.rs`, `src/features/crew/rights.tsx`, `src/lib/ipc/mock.ts`.
- REQ-012 (F46): `src/lib/projects/index.ts`, `src/features/shell/close-guard.tsx`.
- Decision for REQ-001: Sign out removes tokens for the code host and the issue tracker only (`q:Q-175`).
- Decision for REQ-004: a Plan right is a security control. Each gated command checks the right in the command, not in the page.
- Decision for REQ-010: a keychain permission kind needs a probe. This change leaves it out. Open item for the owner.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
cargo test --workspace
pnpm ipc:check
cd docs && pnpm dlx @fission-ai/openspec@2.0.0 validate add-redesign-functions --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Docs of the table in `CLAUDE.md` are updated for each requirement that alters them.
- [ ] API contracts updated if a command changed.
- [ ] Env examples updated if config changed.

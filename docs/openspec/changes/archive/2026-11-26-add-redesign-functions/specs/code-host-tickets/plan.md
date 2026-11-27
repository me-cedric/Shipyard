# Plan: code-host-tickets

Spec: [spec.md](spec.md)
Date: 2026-11-20

## Summary

Build the 11 requirements of the spec on the commands and stores of today. Each requirement adds a field or a command to a store that exists, and a control on a page that exists. The writer group B owns the files below. No other group edits them.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | The existing stack: Rust crates and the React frontend. |
| Dependencies | None new. A crate for process metrics enters only if the standard library cannot read them (`spec:shell-setup-rights#REQ-003`). |
| Data/storage | A field on an existing file or record. A new table or column goes in `docs/data-models/*.dbml`. |
| APIs/contracts | A new IPC command for a control with no command today. The IPC bindings are generated. The IPC mocks follow each command change. |
| Risks | A write to the code host or the issue tracker needs the permission of other writes. The shared files make a merge conflict: see the order rules in `tasks.md`. |

## Affected Surfaces

- Code: `crates/shipyard-app/src/assistant.rs`, `crates/shipyard-app/src/code.rs`, `crates/shipyard-app/src/commands/delivery_docs.rs`, `crates/shipyard-app/src/delivery.rs`, `crates/shipyard-app/src/work/`, `crates/shipyard-app/src/work/join.rs`, `crates/shipyard-core/src/work.rs`, `crates/shipyard-core/src/work_item.rs`, `crates/shipyard-forges/src/`, `docs/data-models/`, `docs/flows/bricks.json`, `docs/flows/network-flows.json`, `src/features/assistant/messages.tsx`, `src/features/assistant/use-assistant.ts`, `src/features/code/impact-report.tsx`, `src/features/code/open-pull.tsx`, `src/features/code/pull-requests.tsx`, `src/features/code/pulls-page.tsx`, `src/features/crew/team-page.tsx`, `src/features/flow/feature/checks.tsx`, `src/features/plan/dates-page.tsx`, `src/features/projects/tickets-config.tsx`, `src/features/work/team-rights.tsx`, `src/features/work/ticket-detail.tsx`, `src/lib/ipc/mock-assistant.ts`, `src/lib/ipc/mock-code-prs.ts`, `src/lib/ipc/mock-code.ts`, `src/lib/ipc/mock-work.ts`
- Tests: a test beside each file, and the Rust tests of each crate.
- Docs/specs: `docs/flows/network-flows.json` and `docs/flows/bricks.json` (re-run, reviewers, releases), `docs/data-models/*.dbml` (release in the mirror), `docs/models/architecture.c4` if a crate dependency changes; the test plan `docs/delivery/test-plans/code-host-tickets.feature`; `CHANGELOG.md` and `CHANGELOG.fr.md`; `docs/guide/` (four languages).

## Approach

- REQ-001 (F04): `crates/shipyard-forges/src/`, `crates/shipyard-app/src/code.rs`, `src/features/flow/feature/checks.tsx`, `src/lib/ipc/mock-code-prs.ts`, `docs/flows/network-flows.json`, `docs/flows/bricks.json`.
- REQ-002 (F06): `src/features/assistant/messages.tsx`, `src/features/assistant/use-assistant.ts`, `crates/shipyard-app/src/assistant.rs`, `src/lib/ipc/mock-assistant.ts`.
- REQ-003 (F09): `src/features/work/ticket-detail.tsx`, `src/lib/ipc/mock-work.ts`.
- REQ-004 (F10): `crates/shipyard-core/src/work.rs`, `crates/shipyard-app/src/work/`, `crates/shipyard-forges/src/`, `src/features/work/ticket-detail.tsx`, `src/lib/ipc/mock-work.ts`, `docs/flows/network-flows.json`, `docs/flows/bricks.json`, `docs/data-models/`.
- REQ-005 (F11): `crates/shipyard-app/src/commands/delivery_docs.rs`, `crates/shipyard-core/src/work_item.rs`, `src/features/projects/tickets-config.tsx`, `src/lib/ipc/mock-work.ts`.
- REQ-006 (F12): `crates/shipyard-forges/src/`, `crates/shipyard-app/src/code.rs`, `src/features/code/open-pull.tsx`, `src/lib/ipc/mock-code-prs.ts`, `docs/flows/network-flows.json`, `docs/flows/bricks.json`.
- REQ-007 (F13): `src/features/code/open-pull.tsx`.
- REQ-008 (F14): `crates/shipyard-app/src/delivery.rs`, `src/features/code/pull-requests.tsx`, `src/features/code/pulls-page.tsx`, `src/lib/ipc/mock-code-prs.ts`.
- REQ-009 (F15): `src/features/code/impact-report.tsx`, `crates/shipyard-app/src/code.rs`, `src/lib/ipc/mock-code.ts`.
- REQ-010 (F23): `crates/shipyard-app/src/work/join.rs`, `src/features/work/team-rights.tsx`, `src/features/crew/team-page.tsx`, `src/lib/ipc/mock-work.ts`.
- REQ-011 (F24): `src/features/plan/dates-page.tsx`.
- Decision for REQ-004: a release is the version of the issue tracker (`q:Q-176`). Linear uses its project and Azure DevOps uses its iteration: these two are a lead default. A ticket has one release: a lead default, since Jira allows several fix versions. Shipyard shows and sets the first.

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

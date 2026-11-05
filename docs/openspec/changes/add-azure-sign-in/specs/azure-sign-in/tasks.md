# Tasks: azure-sign-in

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [ ] T001 Register a Microsoft Entra public client app and put its client id in `crates/shipyard-app/resources/oauth.env` (owner, Q-132).
- [ ] T002 Write tests in `crates/shipyard-app/src/device_login.rs` for the Azure device code with a fake tenant: code shown, polling, token in the keychain, missing role. Covers REQ-001, REQ-002, REQ-003.
- [ ] T003 Implement the Azure device code in `crates/shipyard-app/src/device_login.rs`. Covers REQ-001, REQ-002, REQ-003.
- [ ] T004 Add the Sign in action on the Azure row in `src/features/settings/provider-rows.tsx`, with English and French labels and tests. Covers REQ-001, REQ-002.
- [ ] T005 Update `docs/guide/settings.md`, flow-16 in `docs/flows/network-flows.json`, the `microsoft-login` brick, and one EN and one FR changelog line.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

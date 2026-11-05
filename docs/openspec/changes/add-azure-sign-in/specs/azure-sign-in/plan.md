# Plan: azure-sign-in

Spec: [spec.md](./spec.md)
Date: 2026-11-05

## Summary

Reuse the device code loop of `device_login.rs` (GitHub and GitLab) with the Entra ID endpoints. This covers REQ-001 to REQ-003.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. |
| Data/storage | Tokens in the OS keychain only. |
| APIs/contracts | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/devicecode` and `/token`, scope `https://ai.azure.com/.default`. The client id goes to `crates/shipyard-app/resources/oauth.env` (a public id). |
| Risks | Needs a Microsoft Entra public client app registration by the owner (Q-132). Some tenants block device code sign-in. |

## Affected Surfaces

- Code: `crates/shipyard-app/src/device_login.rs`, `crates/shipyard-app/resources/oauth.env`, `src/features/settings/provider-rows.tsx`.
- Tests: `crates/shipyard-app/src/device_login.rs`, `src/features/settings/*.test.tsx`.
- Docs/specs: `docs/guide/settings.md`, `docs/flows/network-flows.json`, `docs/flows/bricks.json`, `docs/delivery/test-plans/azure-sign-in.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Approach

1. Get the app registration and its client id (owner).
2. Write tests with a fake tenant, then implement the flow.
3. Add the row action, the labels and the docs.

## Validation

```bash
cargo test -p shipyard-app --lib device_login
pnpm test src/features/settings
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-azure-sign-in --strict
```

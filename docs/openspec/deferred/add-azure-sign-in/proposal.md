# Azure sign-in

## Why

The change `add-provider-sign-in` gave every AI provider a sign-in, except Azure OpenAI. The owner deferred the Azure device sign-in (Q-132): it needs a Microsoft Entra app registration. Until then, Azure uses a pasted key.

## What Changes

- The Azure OpenAI row signs in with the Entra ID device code flow.
- The tokens go to the keychain.
- A person without the role Cognitive Services OpenAI User sees the role name and one action.

## Impact

- Affected capability: `azure-sign-in`
- Affected code/docs: `crates/shipyard-app/src/device_login.rs`, `crates/shipyard-app/resources/oauth.env`, `src/features/settings/provider-rows.tsx`, `docs/guide/settings.md`, `docs/flows/network-flows.json` (flow-16), `docs/flows/bricks.json` (`microsoft-login`)

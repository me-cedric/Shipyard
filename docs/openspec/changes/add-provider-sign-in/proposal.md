# AI sign-in

## Why

A person with little technical knowledge cannot tell which AI tool or provider works. Each tool signs in its own way, and some providers need a key from a web page. Settings / Agents and rules shows no sign-in state. The person must find a terminal, a command and a key page alone.

## What Changes

- Settings / Agents and rules gets one view of every AI tool and provider. Each row shows its state and one action.
- Each detected coding tool gets a "Sign in" action. Shipyard runs the login command of the tool. Shipyard reads only the status command of the tool.
- OpenRouter and Azure get a direct sign-in in the browser.
- Local runtimes (Ollama, LM Studio, vLLM, LiteLLM) are found on localhost with no action.
- Other providers get a key paste with a "Get a key" link and a test on save.
- Shipyard never reads or reuses the tokens of a tool. A key that Shipyard holds goes to the keychain only.
- The Antigravity CLI `agy` is detected as well as `gemini`.

## Impact

- Affected capability: `provider-sign-in` (extends `extensions` REQ-001, the Agents and rules view)
- Affected code/docs: `crates/shipyard-agents/src/runners.rs`, `crates/shipyard-app/src/device_login.rs`, `crates/shipyard-app/resources/oauth.env`, `src/features/settings/agents-rules.tsx`, `docs/decisions/0017-ai-sign-in-boundary.md`, `docs/flows/`, `docs/delivery/test-plans/provider-sign-in.feature`, `docs/guide/settings.md`

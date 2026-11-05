# Plan: provider-sign-in

Spec: [spec.md](./spec.md)
Date: 2026-11-05

## Summary

One list joins the runners, the HTTP providers and the local runtimes. A tool signs in with its own login. A provider signs in with OAuth or a pasted key. This covers REQ-001 to REQ-010. ADR 0017 sets the boundary.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. Reuse `runners.rs`, `device_login.rs`, `shipyard-http` and the keychain. |
| Data/storage | Keys and tokens that Shipyard obtains go to the OS keychain. No project file holds them. |
| APIs/contracts | See the sources below. New IPC commands are generated, never edited by hand. |
| Risks | Gemini and Copilot have no status command. `opencode auth list` output is unconfirmed. vLLM and LiteLLM ports and `/v1/models` are unconfirmed. Azure needs an app registration (Q-132). |

### Sources (checked 2026-11-05)

- Codex: `codex login`, `--device-auth` (beta), `--with-api-key` on stdin. `codex login status` exits 0 ("Logged in using ChatGPT" or "API key configured") or 1 ("Not logged in", stderr). https://learn.chatgpt.com/docs/auth
- Claude Code: `claude auth login` (`--console`, `--sso`), `claude setup-token`. `claude auth status` gives JSON (`--text`), exit 0 or 1, field `authMethod`. Credentials sit in the macOS Keychain. The terms forbid a third party to offer Claude.ai login or to route requests through subscription credentials, so Shipyard runs the unmodified `claude` binary only. https://code.claude.com/docs/en/authentication , https://code.claude.com/docs/en/legal-and-compliance
- Antigravity CLI `agy` replaces Gemini CLI for personal accounts. Browser sign-in, macOS Keychain, no documented status command. API key through `GEMINI_API_KEY` with `modelProvider: "gemini"`. https://antigravity.google/docs/install?tab=cli
- OpenCode: `opencode auth login`, `opencode auth list` (output unconfirmed). https://opencode.ai/docs/cli/
- GitHub Copilot CLI: `copilot login` (`--device-code`). No status command. Environment tokens override the stored login. https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli
- OpenRouter: open `https://openrouter.ai/auth?callback_url=...&code_challenge=...&code_challenge_method=S256`, then `POST https://openrouter.ai/api/v1/auth/keys` with `code` and `code_verifier`. The reply holds `key`. Localhost callback on any port. A code lasts 10 minutes. https://openrouter.ai/docs/guides/overview/auth/oauth
- GitHub Models is retired (2026-07-30). Not offered. https://github.blog/changelog/2026-07-30-github-models-is-now-retired/
- Azure: Entra ID device code at `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/devicecode` and `/token`. Scope `https://ai.azure.com/.default`. Role Cognitive Services OpenAI User. A public client app registration is needed. https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code
- OpenAI, Anthropic, Mistral, Google AI Studio: no OAuth for a third party to get a key. "Sign in with ChatGPT" for partners is a preview and gives no key: out of scope.
- Local: Ollama 11434 `GET /api/tags`. LM Studio 1234 `GET /v1/models`. vLLM 8000 `GET /v1/models` (port unconfirmed). LiteLLM 4000 (`/v1/models` unconfirmed).

## Affected Surfaces

- Code: `crates/shipyard-agents/src/runners.rs`, `crates/shipyard-app/src/device_login.rs`, `crates/shipyard-app/resources/oauth.env`, `crates/shipyard-app/src/errors.rs`, `src/features/settings/agents-rules.tsx`.
- Tests: the same Rust files, `src/features/settings/*.test.tsx`, `e2e/settings.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-provider-sign-in/`, `docs/decisions/0017-ai-sign-in-boundary.md`, `docs/delivery/questions/Q-132.md` to `Q-135.md`, `docs/delivery/test-plans/provider-sign-in.feature`, `docs/flows/network-flows.json`, `docs/flows/bricks.json`, `docs/guide/settings.md`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Approach

1. Add `agy` to detection. Add the status commands and the sign-in launch for tools (Q-133 decides the place).
2. Add OpenRouter PKCE with a localhost callback.
3. Add the Azure device code (after Q-132).
4. Probe the local runtimes on localhost.
5. Add the key paste with a test on save.
6. Build the one view on top of steps 1 to 5, in English and French.

## Validation

```bash
cargo test --workspace
pnpm test
pnpm playwright test e2e/settings.spec.ts
node docs/agent-compass/bin/ac.mjs check
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-provider-sign-in --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.
- [x] Risks and constraints are captured in `plan.md`.

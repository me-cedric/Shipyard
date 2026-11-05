---
status: proposed
date: 2026-11-05
decision-makers: [Cédric Meyer]
---
# AI sign-in boundary: each tool signs in itself, Shipyard keeps only its own keys
## Context and problem statement
Settings / Agents and rules must give one sign-in action for each AI tool and provider. Some tools keep a subscription login (Claude Code, Codex, Copilot, Antigravity). The terms of Anthropic forbid a third party to offer Claude.ai login or to route requests through subscription credentials. A token that Shipyard reads from another tool also breaks the rule that a secret has one place (constitution 6.3).
## Decision drivers
- A person with little technical knowledge signs in with one click.
- No term of a vendor is broken.
- A secret lives in the keychain only.
- Shipyard reads as little as it can.
## Considered options
- Shipyard runs the own login of each tool and reads only its status command. Shipyard holds only keys that it obtained itself.
- Shipyard reads the token store of each tool and calls the vendor API with it.
- Shipyard offers its own sign-in for each vendor.
## Decision outcome
Chosen option: the first. Shipyard runs the unmodified login command of a tool (`codex login`, `claude auth login`, `agy`, `opencode auth login`, `copilot login`). Shipyard reads the state from the status command only (`codex login status`, `claude auth status`), with its exit code and the `authMethod` field. A tool with no status command shows "Unknown".

Shipyard holds a secret only when it obtained the secret itself: the OpenRouter key from OAuth PKCE, the Azure tokens from the Entra ID device code, and a key that the person pastes. Each goes to the OS keychain. A key never goes in an argument (stdin for `codex login --with-api-key`), a URL, a log or a repository file.

Shipyard never reads or copies the credential store of a tool, and never uses a subscription token for its own call. The tool makes its own calls to its vendor, as in flow `agent-cli-start`.
### Consequences
- The state of Gemini, `agy` and Copilot is "Unknown" until Q-134 gives a better signal.
- The sign-in of a tool happens in the tool: its browser page, its prompts. Q-133 decides where the person sees them.
- OpenAI, Anthropic, Mistral and Google AI Studio have no OAuth for a third party: the person pastes a key.
- Azure needs an application registration (Q-132).
- Two flows are new: OpenRouter and Microsoft login. Local runtimes are probed on localhost only.

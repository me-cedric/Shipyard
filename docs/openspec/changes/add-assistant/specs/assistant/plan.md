# Plan: assistant

Spec: [spec.md](spec.md)
Date: 2026-10-29

## Summary

One assistant panel in the shell. It sends each turn through the runner layer of `shipyard-agents`, the same layer as the factory. The engine counts the budgets. Threads live in the app data folder. Agent mode uses a worktree from `shipyard-git`.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). |
| Runner layer | `shipyard-agents` runs the CLI and HTTP runners. The panel and the factory call the same trait. |
| Budgets | `shipyard-engine` counts tokens and money per run, day and member. An assistant turn books to the same counters. |
| Worktrees | `shipyard-git` creates the worktree of an agent-mode thread. Q-047 decides its life. |
| Data/storage | Threads, transcripts and drafts in SQLite in the app data folder (`shipyard-store`). Nothing in the repository. |
| Context and citations | `shipyard-core` ref parser and the ref index of `add-refs`. The panel adds only refs that resolve. |
| Secrets | The keychain through `connections`. A runner gets a connection id, never a value. A log filter drops any value that matches a stored secret. |
| Send to factory | A tracker write through `connections` after a confirm. A run starts through the engine. Q-048 decides the no-ticket case. |
| Frontend | `src/features/assistant/` for the panel. It imports only `ui`, `lib` and its own folder. |
| APIs/contracts | Tauri commands in `shipyard-app`, grouped in an `assistant` module. `tauri-specta` generates the types and the mock. |
| Dependencies | No new dependency. |
| Risks | A runner may leak a secret in output. Mitigation: the log filter and a test with a planted value. A retry may replay edits. Mitigation: resume the session, never resend the first request. |

## Affected Surfaces

- Code: `crates/shipyard-agents`, `crates/shipyard-engine` (budget booking), `crates/shipyard-store` (threads), `crates/shipyard-app` (commands), `src/features/assistant/`.
- Tests: `cargo test -p shipyard-agents`, `cargo test -p shipyard-engine`, `cargo test -p shipyard-store`, `cargo test -p shipyard-app`, `pnpm vitest run src/features/assistant`, `e2e/assistant.spec.ts`.
- Docs/specs: this change, `CHANGELOG.md` and `CHANGELOG.fr.md`, Q-047, Q-048, Q-049.

## Approach

1. Model the thread, the turn, the context and the mode in `shipyard-core`. Keep it free of I/O.
2. Store threads in `shipyard-store`. Add the commands in `shipyard-app`.
3. Add the turn path in `shipyard-agents`: build the prompt from the context, quote untrusted text, send to the runner, stream the reply, book the budget.
4. Enforce the modes: ask and plan run read only. Agent runs in a worktree.
5. Build the panel with `ui` components: thread list, context chips, input, reply actions.
6. Add Send to factory and the Explain entry point.
7. Add the project defaults to the override of `projects`.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-agents
cargo test -p shipyard-engine
cargo test -p shipyard-store
cargo test -p shipyard-app
pnpm vitest run src/features/assistant
pnpm playwright test e2e/assistant.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-assistant --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

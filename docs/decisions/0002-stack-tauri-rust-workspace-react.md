---
status: proposed
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# Stack: Tauri v2, Rust workspace, React 19
## Context and problem statement
Shipyard is a desktop app that runs local CLIs, git and worktrees, and keeps secrets in the OS keychain.
## Decision drivers
- Local process control and keychain access.
- Small binary. Legacy team knows the stack.
## Considered options
- Tauri v2 with a Rust workspace and React 19.
- Electron with Node (Orca model).
## Decision outcome
Chosen option: "Tauri v2 with a Rust workspace and React 19", because it keeps Legacy's proven adapters and gives a small, safe binary.
### Consequences
- The backend splits into crates: core, store, trackers, forges, git, agents, engine, mcp, app, cli.
- A headless `shipyard-cli` binary shares the engine.
## Pros and cons of the options
- Electron: one language. But larger binary, and Legacy's Rust adapters are lost.

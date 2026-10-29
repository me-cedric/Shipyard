---
status: proposed
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# IPC generated with tauri-specta
## Context and problem statement
Legacy generates types with ts-rs but keeps about 250 hand-written invoke wrappers.
## Decision drivers
- No hand-written contract code.
- The UI must run in a browser for tests.
## Considered options
- ts-rs plus hand-written wrappers (Legacy).
- tauri-specta for types, commands and events.
## Decision outcome
Chosen option: "tauri-specta", because it generates the command functions and events too. A generated mock layer serves the same contract to Vitest and Playwright.
### Consequences
- CI fails when the bindings are stale.
- Risk: tauri-specta v2 is a release candidate. Pin the version. Fallback: ts-rs with a generated wrapper script.

# Windows relay pipe

## Why

The change `add-connections` built the MCP relay: an agent turn reuses the stdio MCP server that the app keeps open. On macOS and Linux the relay reaches the app through a Unix socket. On Windows it has no channel yet, so each turn starts the server again. A Mac cannot build and test Windows code (Q-096).

## What Changes

- On Windows, the relay reaches the open server of the app through a named pipe.
- The behaviour on macOS and Linux stays the same.

## Impact

- Affected capability: `windows-relay`
- Affected code/docs: `crates/shipyard-mcp/src/relay.rs`, `crates/shipyard-app/src/lib.rs`, `.github/workflows/ci.yml` (a Windows job for the relay tests)

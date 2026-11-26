# Outside ref read

## Why

An agent that a person runs outside Shipyard (through the server of Setup / This computer / Share) cannot read an item by its ref. A run agent can, with `read_ref` (`spec:refs#REQ-014`). The outside agent must read the same answer, with the same permission rules as its other read tools.

## What Changes

- One new read-only tool for outside agents: `ref_read`. It is in the Read files switch group and in the read-only preset. It is off by default, as each group is.
- It gives the title, the state, the location and the backlinks of a ref, as `read_ref` does. It gives no file text.
- A ref of an area that is hidden for the person is refused with the text of the other read tools of that area. A backlink of a hidden area is left out.
- The resource template `shipyard://ref/{ref}` shows to an outside agent when `ref_read` is on.

## Impact

- Affected capability: `refs` (one new requirement, REQ-015).
- Affected code/docs: `crates/shipyard-mcp/src/outside.rs`, `crates/shipyard-mcp/src/server.rs`, `crates/shipyard-app/src/outside.rs`, `docs/api/shipyard-mcp.yaml`, `src/lib/ipc/mock-doctor.ts`, `docs/delivery/test-plans/refs.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.
- Questions: Q-177 (a question tool for outside agents) stays open and is not in this change.

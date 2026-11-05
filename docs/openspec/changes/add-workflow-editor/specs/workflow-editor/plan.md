# Plan: workflow-editor

Spec: [spec.md](./spec.md)
Date: 2026-11-05

## Summary

The store renders a workflow to YAML through the shared writer and keeps the top comment. The app adds commands to render, create, rename and delete a workflow, the options of the pickers, and the proposals of agents. The MCP server adds the group `workflows`. The view adds a form beside the text editor of Factory / Workflows. This covers REQ-001 to REQ-010.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing Rust workspace and React 19. No new runtime. |
| Dependencies | None new. The YAML goes through `crates/shipyard-store/src/yaml.rs`. |
| Data/storage | Workflows stay in `.shipyard/workflows/<id>.yaml`. A proposal is machine state in the app data folder (`workflow-proposals/<project>/<id>.yaml`), never in the repository (constitution 1.3). |
| APIs/contracts | IPC: `workflowCheck` returns the parsed workflow and the issue; new `workflowRender`, `workflowOptions`, `workflowCreate`, `workflowRename`, `workflowDelete`, `workflowProposals`, `workflowProposalApply`, `workflowProposalDiscard`. MCP: four tools in the group `workflows` (`docs/api/shipyard-mcp.yaml`). |
| Risks | A form save rewrites the file: comments inside the steps and flow lists go (Q-143). An agent could raise its own budget: a proposal needs the click of a person (Q-141). A rename breaks the `wf:<id>` labels of tickets: the default workflow and a workflow in use are refused (Q-142). |

## Affected Surfaces

- Code: `crates/shipyard-store/src/factory_files.rs`, `crates/shipyard-app/src/factory.rs`, `crates/shipyard-app/src/outside.rs`, `crates/shipyard-mcp/src/outside.rs`, `src/features/factory/workflows/`, `src/features/settings/`, `src/lib/factory/`, `src/lib/i18n/`.
- Tests: `factory_files.rs` (round trip of the six presets), `crates/shipyard-app/src/factory/tests.rs`, `crates/shipyard-mcp/src/outside.rs`, `src/features/factory/workflows/*.test.tsx`, `e2e/factory.spec.ts`.
- Docs/specs: `docs/guide/factory.md`, `docs/guide/fr/factory.md`, `docs/api/shipyard-mcp.yaml`, `docs/designs/screens.json`, `docs/delivery/test-plans/workflow-editor.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.

## Validation

```bash
cargo test -p shipyard-store -p shipyard-mcp -p shipyard-app
pnpm test src/features/factory src/lib/ipc
pnpm test:e2e e2e/factory.spec.ts
cd docs && npx -y @fission-ai/openspec@1.15.0 validate add-workflow-editor --strict
```

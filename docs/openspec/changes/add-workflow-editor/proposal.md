# Workflow editor

## Why

The owner looked for the options of a run in Shipyard (2026-11-05): the turn limit, the model, the effort and the budget. These options live in the workflow files, and Factory / Workflows edits them as YAML text only. A person who does not know YAML cannot change them. An agent cannot change a workflow either: the `.shipyard` folder is closed to the tools of an outside agent.

## What Changes

- Factory / Workflows opens a workflow in a form, with the text view as the other choice, as the proposals editor of Specs does. The form edits each field of each step and the limits of the run, with pickers for the roles, the model tiers, the efforts, the tools, the skills and the needs.
- The form checks the workflow at each change with the existing workflow check, and saves the file through the shared YAML writer.
- A person creates a workflow from a preset (the bundled workflows), and duplicates, renames and deletes a workflow. A delete asks for a confirmation.
- The Shipyard MCP server gets a `workflows` group of tools for an outside agent: list, read, validate and propose a workflow. A proposal does not change the file: a person applies or discards it in Factory / Workflows.

## Impact

- Affected capability: `workflow-editor` (new). It extends `factory` (REQ-010, REQ-012, REQ-035) and the outside tools of `connections`.
- Loop: the workflow is the plan of each run of the Factory; its ref `wf:<id>` stays the same.
- Affected code/docs: `crates/shipyard-store/src/factory_files.rs`, `crates/shipyard-app/src/factory.rs`, `crates/shipyard-app/src/outside.rs`, `crates/shipyard-mcp/src/outside.rs`, `src/features/factory/workflows/`, `src/features/settings/` (the switch), `src/lib/factory/`, `src/lib/ipc/mock*.ts`, `src/lib/i18n/`, `docs/api/shipyard-mcp.yaml`, `docs/guide/factory.md` (EN, FR), `docs/designs/screens.json`, `docs/delivery/test-plans/workflow-editor.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.
- Open questions: Q-141, Q-142, Q-143.

# Docs freshness

## Why

A project keeps its architecture, API, data and flow docs as files in the repository. The code changes faster than these docs. Today Shipyard knows one fixed link: a change in the specs folder warns that the design, model, API, data and test plan folders did not follow. It knows nothing about the code. A diagram of the crates, a table list or a list of network calls goes out of date without any warning.

The owner wants Shipyard to follow its own rules. The rule is: a change that alters the architecture, a command, a data table, a network call or a screen updates the matching doc in the same change. Shipyard must enforce this rule for any project, and a person with little technical knowledge must be able to fix a stale doc with one click.

## What Changes

- Add an optional list `docs` in `.shipyard/project.yaml`. Each rule maps code paths to the docs that they feed.
- Keep the fixed chain of today as the default rules, so the current warnings stay.
- Flag a doc as stale when a file of a rule changed and no doc that the rule feeds changed in the same range.
- Show each stale doc in the existing docs chain warnings: before a commit, before a push and in the branch watch of Code / Changes. The acknowledgement with a reason stays.
- Add a Docs check to Code / Quality that lists the stale docs and keeps its report like the other checks.
- Add one action "Update with an agent" on a stale doc. After a click, an agent with the `docs` role edits the fed docs in a worktree and opens a pull request through the usual approvals. Shipyard reads each edited doc again with its own reader and reports a doc that does not parse.

## Impact

- Affected capability: `docs-freshness`
- Consumes: `projects` (project file, REQ-007), `code` (docs chain, Quality, REQ-026 and REQ-028), `factory` (runs and the `docs` role), `design` and `specs` (the readers of the doc folders).
- Produces: the `docs` rules of the project file, the stale doc warnings, the Docs quality check and the `docs-update` workflow.
- Affected code/docs: `crates/shipyard-core/src/project.rs`, `crates/shipyard-app/src/commands/overview.rs`, `crates/shipyard-app/src/qa.rs`, `src/features/code/`, `crates/shipyard-store/src/factory_files.rs`, `docs/guide/code.md`, `docs/guide/settings.md`, `AGENTS.md`.

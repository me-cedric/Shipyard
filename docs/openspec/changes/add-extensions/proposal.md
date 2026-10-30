# add-extensions

## Why

Agents follow the rules of agent-compass, and teams reuse accelerators across repositories. The earlier tool has Compass, Catalog, Plugins and Child projects on four pages.
Shipyard needs one place to manage the agent rules and the add-ons of a project, and to push them to child repositories.

## What Changes

- Add Settings / Agents and rules: browse and apply compass skills, packs, guides and the contract; show the pinned compass version and the sync state.
- Add the roles and skills that `factory` and `assistant` load.
- Add Settings / Extensions: the catalog (devcontainers, agents, DevOps and security components), plugin import from a `.zip`, and child projects.
- Add child projects: deploy catalog components and the OpenSpec guidance to child repositories, and propagate health fixes.
- Add the review of each file and setting that a plugin writes before it applies.

## Impact

- Affected capability: `extensions`
- Consumes: `projects` (the active project), `connections` (MCP servers that a plugin declares).
- Produces: compass rules, roles and skills for `factory` and `assistant`, the compass check for `projects` (health), catalog components for child projects.
- Feature list: Compass (skills, packs, guides, contract), Catalog, Plugins, Child projects, OpenSpec guidance for child repos, Doctor propagation to linked projects.
- Affected code/docs: `src/features/settings/extensions/`, `docs/agent-compass` (submodule, read only), ADR 0010.

# add-projects

## Why

A team works on several repositories. The earlier tool keeps a project registry, but setup, health (Doctor) and preferences sit on separate pages.
Shipyard needs one way to open, create and switch projects, one health view, and an import path for teams that move an existing project.

## What Changes

- Add the first run: open a local folder, clone a remote repository, or create a new project.
- Add the project switcher in the shell, with the state of each working copy.
- Add `.shipyard/project.yaml`: the name, the key, the paths of each artifact kind, the default workflow and the gate commands.
- Add the project registry in the app data folder. It holds the machine values and the project overrides of a person's preference (Q-016, option 1, working assumption).
- Add Settings / Project: paths, default workflow, and the per-project overrides.
- Add Settings / Health and a health dot in the status bar: compliance checks, tool checks, broken refs, stale generated files, the compass Node helpers on the working copy, and one fix action for each finding.
- Add the per-project accent colour override in the registry.
- Add the project import: project config, team, costing sheets, tickets config, RAID, ADRs, specs (Q-003, option 1, working assumption).
- Add the OS ignore rules on a repository that Shipyard creates. A repository that exists is not changed.

## Impact

- Affected capability: `projects`
- Consumes: `connections` (remote credentials for a clone), `refs` (broken-ref report), `extensions` (compass check for health).
- Produces: `project:` entities, the active project for every other capability, Settings / Project, Settings / Health.
- Feature list: Welcome, Home (project list), project registry, Doctor (compliance, tooling), Dossier local git init (not kept), Settings, per-project overrides of Préférences.
- Affected code/docs: `crates/shipyard-store`, `crates/shipyard-git`, `src/features/projects/`, Q-003.

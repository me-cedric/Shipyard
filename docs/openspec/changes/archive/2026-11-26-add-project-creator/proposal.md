# Project creator

## Why

The owner wants to start a new project from Shipyard with all its settings in one guided flow (2026-11-06). Today "Create a project" asks for a name and a folder only. The person then sets the gates, the team, the remote and the connections on four other pages, and writes the first issues or the first brief by hand. The specs and the docs of a team are often in French or another language, while the code stays in English, and no setting says so to the agents.

## What Changes

- Home / Projects and the first run open a creator in five steps: project, brief, team, remote, start. Each step has defaults, so a person can go from the first step to Create.
- The creator offers stack presets (Node, Rust, Python, Java, Go, Other) that set the gates and the ignore rules, and a brief (vision, users, scope) as editable text, pre-filled in the docs language.
- The project file gets `languages`: the docs language and the pull request language. Each agent brief of a run says them. The pull request text of a run uses the pull request language. The code, the comments and the commit messages stay in English.
- The remote is local only, an existing remote address, or a new private repository on a code host connection (GitHub, GitLab). The creator links the issue tracker and the code host connections of the project.
- The creator starts the project in one of two ways: a Factory run of the new bundled workflow `bootstrap` (the default), or starter issues on the issue tracker from the brief. The person sees the issues before they are created, and only the click creates them.

## Impact

- Affected capability: `project-creator` (new). It changes `projects` REQ-004 and REQ-007, and `factory` REQ-011.
- Loop: the project is the root of the loop. The brief feeds the first specs, and the starter issues or the bootstrap run feed the Factory.
- Affected code/docs: `crates/shipyard-core/src/project.rs`, `crates/shipyard-core/src/delivery.rs`, `crates/shipyard-engine/src/run_engine.rs`, `crates/shipyard-engine/src/pull_request.rs`, `crates/shipyard-store/src/factory_files.rs`, `crates/shipyard-store/templates/factory/workflows/bootstrap.yaml`, `crates/shipyard-app/src/creator.rs`, `crates/shipyard-app/src/factory.rs`, `src/features/projects/new-project/`, `src/lib/ipc/mock*.ts`, `src/lib/i18n/`, `docs/guide/start.md` (EN, FR), `docs/designs/screens.json`, `docs/delivery/test-plans/project-creator.feature`, `docs/data-models/`, `CHANGELOG.md`, `CHANGELOG.fr.md`.
- Decision: `docs/decisions/0020-project-languages.md`.
- Open questions: Q-152, Q-153, Q-154, Q-155, Q-156, Q-157.

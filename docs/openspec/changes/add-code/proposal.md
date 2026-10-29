# add-code

## Why

Developers and QA testers need the working copy, the history, the pull requests and the quality reports next to the tickets and runs that caused them. Legacy has these features, but commit is in 11 pages and pull in three places.
Shipyard needs one Code space with one commit action and one sync action, and links from each commit and pull request to its work item and run.

## What Changes

- Add Code / Changes: the working copy as a folder tree, staged and unstaged diffs, stage, unstage and discard per file, folder or selection, conflict resolution, stash.
- Add the one commit action in the status bar, with a conventional commit message in two fields.
- Add Code / History and Code / Branches: the log, the working branch selector, create (named `<type>/<area>/<kebab>`), switch, delete.
- Add the remote watch: Shipyard fetches the remote heads in the background and notifies when a colleague pushed. It never writes the working copy.
- Add Code / Pull requests: list, description, files, commits, CI checks, conversation, verdicts; open, comment, approve, request changes, merge.
- Add Code / Quality: QA and security scanner results.
- Add Code / Impacts: the diff since a ref, a developer action plan, and a digest for the PM.
- Add Code / Terminal as a panel, and a file viewer.

## Impact

- Affected capability: `code`
- Consumes: `connections` (Forge adapter, git credentials), `delivery` (pull requests opened by runs), `refs` (links from commits to `wi:` and `run:`), `sync` (the `pr:` mirror).
- Produces: `commit:` entities, the commit and branch operations used by `delivery` and `shell`, quality and impact reports for `knowledge` and `specs`.
- Legacy parity: Git (changes, conflicts, history, stash, branches), Pull requests (GitHub, GitLab), QA, Security scanners, Impacts, Embedded terminal, La branche de travail, Surveillance des dépôts distants, Les fichiers.
- Affected code/docs: `crates/shipyard-git`, `crates/shipyard-forges`, `src/features/code/`.

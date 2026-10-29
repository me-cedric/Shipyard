# Code

Code works on the git repository of the project.

| Tab | Content |
|---|---|
| Changes | The changed files as a tree. Staged and unstaged diffs. |
| History | The commits, with their files and diffs. |
| Branches | Local and remote branches. |
| Pull requests | The pull requests of the forge mirror. |
| Quality | The checks that the project declares, and scanner reports. |
| Impacts | Analyze: an action plan and a digest. |
| Terminal | A shell at the project root. |

## Commit

1. Stage files. The commit control sits in the status bar.
2. Write a summary with an allowed type, such as `feat` or `fix`.
3. Commit. The commit takes staged files only.

A branch name follows `<type>/<area>/<kebab>`. The app refuses `patch-3`, and never deletes the working branch.

## Sync

The sync action fetches. When the working copy is clean, it then brings the working branch up to date. Publishing is a separate click. The app never uses a force push.

## Forge writes

Each write needs your click: open, comment, approve, request changes, mark ready and merge. Merge stays off for a draft. Quality and Analyze run only after a click.

## Terminal

The terminal opens at the project root. Its environment holds no connection secret.

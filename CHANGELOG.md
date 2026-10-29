# Changelog

## [0.1.0]

### Added

- Desktop app skeleton on Tauri v2 with a Rust workspace of 10 crates.
- Sidebar with the seven spaces and Settings, each space with its tabs.
- Command palette, inspector panel and status bar with sync and commit.
- Light, dark and system themes, English and French, and a home per role.
- Design system with tokens, components and a gallery in the dev build.
- First run to open a local folder, clone a repository or create a project, and a project switcher in the sidebar that shows the state of each working copy.
- Settings / Project for paths and the default workflow, with per-project overrides of the theme, the density, the contrast and the accent colour.
- Settings / Health with one fix for each finding, and a health dot in the status bar.
- Reference index: backlinks grouped by kind in the inspector, and search by ref or title in the command palette.
- Preferences, language and the last view of each project now live in the app data folder.
- Settings / Connections to add, edit, test and remove tracker and forge connections (Jira, GitHub, GitLab, Azure DevOps, Linear), with the capability flags of each tracker, write-only secrets kept in the system keychain, and the repository list of a forge with a mark on each repository you cannot push to.
- Code space with Changes (folder tree, staged and unstaged diffs, stage, unstage, discard after a confirmation, stash, conflict blocks), History and Branches, a working branch selector in the header, one commit action in the status bar, a sync action that updates the working branch, and a notice when a colleague pushes. A clone uses the saved token of the forge connection with the same host.
- Settings / Connections now also lists MCP servers (catalogue and custom, start, stop, Start all, live state, missing dependencies with an install action), the agent runners detected on this machine, and model providers with a test and a model list. Keys and secret fields stay write-only. The app keeps started servers open for agents through a relay and stops them when it quits.
- Notification centre with a bell in the status bar and toasts, a system notification for events that need you while the window is in the background, a native menu in your language that runs the same actions as the palette, and an update check that only tells you when a newer version exists. The release address is set in Settings / Me.
- Context menus on files, commits, refs and connections, with the actions of the row, from the secondary click or the keyboard.
- Settings / Project can record the tracker and forge connection of a project in `.shipyard/project.yaml`, by id only.
- Removing a connection now lists every registered project that uses it, and waits for the list. Changing the host of a connection clears its saved secret. A health fix writes only the content you previewed.

## [0.0.1]

### Added

- Project plan, constitution and first architecture decisions.

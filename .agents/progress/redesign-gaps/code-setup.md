# Gaps: Code and Setup screens

Design pictures: `docs/assets/screenshots/redesign/`. Captures: this folder (900 px high) and `tall/` (2000 px high, made with `shot-tall.cjs`; `tall/project-bottom.jpg` made with `shot-auto.cjs`).
Result: 0 match, 18 with gaps, 1 not found. The shared shell is not judged.

## Repeated in this group

1. `look` Page title. Design: one large bold title (about 44 px) at the left, with the section switch on the same row at the right. App: the section switch is on its own row above, then a small title (about 20 px) with a gradient icon tile and a count pill. Source: `src/ui/molecules/page-header.tsx`, `src/ui/molecules/view-tabs.tsx`, `src/features/shell/` (place layout).
2. `look` Setup title. Design: the title stays "Setup" on every Setup section and sub-page. App: the title changes to "This project", "This computer", "Me", "Extensions", "Agents and rules". Source: `src/features/settings/setup-scope.tsx`.
3. `look` Page width and columns. Design: two columns of cards that fill the content width (1170 px). App: one column of 735 px, the right half of the page is empty. All Setup pages. Source: `SETTINGS_PAGE` class and `src/features/settings/setup-scope.tsx`, `src/ui/molecules/group-section.tsx`.
4. `look` Cards. Design: white cards, radius about 20 px, soft shadow, small grey caption as the group label, rows 60 px high with a bold label. App: dense bordered tables, radius 8 px, a header bar with icon + title + count box, rows 44 px high with a small icon tile before each label. Source: `src/ui/molecules/group-section.tsx` and the row components of `src/features/settings/`.
5. `extra` Section anchor bar. Design: none. App: a white bar of anchor links with icons (for example "Paths, Connections, Languages, Default workflow ...") under the header of each Setup page. Source: `src/ui/molecules/section-nav.tsx`, used in `setup-project.tsx`, `setup-computer.tsx`, `setup-me.tsx`, `extensions.tsx`, `agents-rules.tsx`, `settings-health.tsx`.
6. `look` Sub-navigation of a Setup section. Design: a row of pills under the title (This project: Details, Agents may do alone, Automation, Extensions; This computer: AI tools and connections, Models and rules, Health), the active pill is blue. App: a row of large door cards (icon tile + label, 183 px wide) that replace the page, with a back link. Source: `src/features/settings/setup-scope.tsx`, `src/ui/molecules/door.tsx`.
7. `look` Controls. Design: value buttons (white, bordered, 44 px), segmented controls for 2 to 4 choices, steppers (− n +) for numbers, large green toggles. App: native-looking selects, text inputs, small blue toggles. Source: the field atoms in `src/ui/atoms/` and each settings group.
8. `look` Primary button. Design: black fill, white text. App: blue-to-violet gradient fill (Commit, Merge, Stage, + Branch, + Connection, Allow, Upgrade). Source: the button atom in `src/ui/atoms/` and the theme tokens.
9. `look` Status pills. Design: round soft pills (Ready, Not connected, 1 to fix). App: square tags with a dot or a dash (Detected, − Missing, Current, Absent). Source: the badge/status atoms in `src/ui/atoms/`.
10. `extra` Count pills and count boxes next to titles and group names (History 3, Branches 3, Paths 15, Permissions 3). Design has none. Source: `page-header.tsx`, `group-section.tsx`.

## 7 Code

Picture: `007-code.jpg`. Route: `/code/now`. Captures: `code-now.jpg`, `tall/code-now.jpg`.

- `look` Design: two cards side by side, "5 files to commit" (3 flat file rows with +/− counts, link "2 more files", one-line commit message, Write it for me, Commit) and "Pull requests". App: the full staging tool (Staged and Unstaged trees, checkboxes, Discard, Stage, diff viewer, two-field commit form, Stashes) fills the page; the pull requests come below it at full width. The design puts that tool on screen 52. Source: `src/features/code/now.tsx`, `src/features/code/changes.tsx`.
- `look` Pull request rows. Design: avatar, title, one state pill (Checks pass, 2 checks fail, Changes asked), Merge on the ready row, link "Merged and closed". App: number, title, two or three tags (Draft, CI, Review), a date, a search field, an All / Needs review filter, an "Open 9" group header, an "Open pull request" button. Source: `src/features/code/pull-lists.tsx`, `src/features/code/pull-requests.tsx`.
- `look` Product health. Design: one full-width row card with a shield icon, the label and an "Open" button. App: two door cards, "Product health" and "Files". Source: `src/features/code/now.tsx`.
- `extra` "Files" door, Stashes block, diff viewer on this screen. Source: `src/features/code/now.tsx`.

## 48 Code, History

Picture: `048-history.jpg`. Route: `/code/history`. Capture: `code-history.jpg`.

- `missing` Toolbar under the title: branch button, Commits / Tags switch, "Search the commits" field. App has only an "Export" button. Source: `src/features/code/history.tsx`.
- `look` Commit list. Design: card with tall rows, avatar, bold message, "author, time" line, pill "Shown" on the open commit, link "Older commits". App: dense one-line rows with a graph rail, hash, branch tags, author and date in columns. Source: `src/features/code/history.tsx`.
- `missing` Detail side: link to the feature ("Feature: ..."), buttons "Open in the editor", "Who changed each line", "Undo this commit". App shows the header, the file list and an inline diff only. Source: `src/features/code/history.tsx`.
- `extra` Inline diff under the file list, hash chip, "Export" button (not in the design).

## 49 Code, Branches

Picture: `049-branches.jpg`. Route: `/code/branches`. Capture: `code-branches.jpg`.

- `look` Design: a grid of branch cards (3 per row). Each card: name, pill (You are here, Merged) or agent badge, link to the feature, Ahead and Behind bars with numbers, buttons Switch / Merge / Rename / Delete. App: two tables, "Local" and "Remote", one line per branch. Source: `src/features/code/branches.tsx`.
- `missing` Ahead / Behind bars, link to the feature, "Rename", "Merged" pill. Source: `src/features/code/branches.tsx`.
- `look` Toolbar. Design: Fetch, Push with pill "N to send", black Sync with pill "N to get", and at the right "Clone a repository", "New branch". App: text buttons Fetch, Publish, Force publish; at the right an inline form (type select, Area, Subject, + Branch). Source: `src/features/code/branches.tsx`.
- `missing` "Clone a repository". Source: `src/features/code/branches.tsx`.
- `look` Code host address. Design: a full-width card at the bottom, field + Save. App: "Origin" field + "Save remote" at the top, plus the line "main is the default branch of origin". Source: `src/features/code/branches.tsx`, `src/features/code/push-target.tsx`.
- `extra` "Rebase", "Force publish", the Remote table.

## 51 Code, Terminal

Picture: `051-terminal.jpg`. Route: `/code/terminal`. Capture: `code-terminal.jpg`.

- `missing` Files card at the left: "Find a file" field, file tree with "Changed" pills, buttons Open in the editor, Show in the folder, New, Rename, Delete. App has no file panel. Source: `src/features/code/terminal.tsx` (file parts exist in `src/features/code/tree.ts`, `file-actions.tsx`).
- `missing` Terminal tabs (alpha, Tests, +), "Clear", "Close the tab". Source: `src/features/code/terminal.tsx`, `src/features/code/use-terminal.ts`.
- `missing` Command bar at the bottom: Command field, Run, "Ask an agent to run it". Source: `src/features/code/terminal.tsx`.
- `look` Design: the terminal is a dark rounded card (radius 20 px) at the right of the file card. App: a black rectangle, edge to edge, no radius. Source: `src/features/code/terminal.tsx`.

## 52 Code, local changes

Picture: `052-localchanges.jpg`. Route: `/code/now` (the app has no separate page; `/code/changes` goes to `/code/now`). Capture: `tall/code-now.jpg`.

- `look` Design: a sub-page with a back link "Code" and the title "5 files to commit". App: the same tool sits inside Code Now under the title "Code". Source: `src/features/code/now.tsx`, `src/app/router.tsx`.
- `missing` Conflict banner: "1 file has a conflict", file name, "Solve it myself", "Solve with an agent". Not seen in the mock state; the part exists in `src/features/code/conflict-agent.tsx`. Check that it shows at the top in this form.
- `look` File list. Design: one flat list, a blue checkbox per file, path in mono, +/− counts or a "Conflict" pill, buttons "Choose all" and "Discard". App: two trees (Staged, Unstaged) with folders, M/U letters, "Unstage (1)", "Discard (4)", "Stage (4)". Source: `src/features/code/changes.tsx`, `src/features/code/tree.ts`.
- `look` Commit card. Design: one "Commit message" field, "Write it for me", black "Commit 4 files". App: Summary field + description area, "Commit" with no count. Source: `src/features/code/changes.tsx`.
- `missing` Toggles "Auto-commit" and "Auto-review" in the commit card. App has them only in Setup (`src/features/settings/project/auto-commit.tsx`, `auto-review.tsx`).
- `look` Put aside. Design: card "Put aside", a row per saved set with Restore / Delete, button "Put my changes aside". App: "Stashes 0" with a Name field and "Stash". Source: `src/features/code/changes.tsx`.
- `missing` Diff side: "Open in the editor" button in the diff header, and the auto-review comment block (Reviewer line, Reply field, "Apply the fix", "Solved"). Source: `src/features/code/viewer.tsx`, `src/features/code/inline-comment.tsx`, `src/features/code/agent-review.tsx`.
- `look` Diff. Design: plain numbered lines, one line number column, added line in green. App: two number columns, hunk header `@@`, one block per staged and unstaged copy. Source: `src/features/code/viewer.tsx`.

## 8 Setup

Picture: `008-setup.jpg`. Route: `/setup/start`. Capture: `setup-start.jpg`.

- `look` Step panel. Design: step list at the left with a vertical divider, the question as a large title at the right, then large choice tiles (Jira, GitHub, GitLab, Azure DevOps, Linear), then "Skip" and a black "Connect" at the right under the tiles. App: no divider; the question is small; the controls (Skip, "To do" mark, a "Default" select, "Install GitHub Copilot", "Open AI tools") sit in one row at the far right. Source: `src/features/onboarding/start.tsx`.
- `missing` Choice tiles for the step. Source: `src/features/onboarding/start.tsx`.
- `look` Scope cards. Design: three cards of 280 px at the left, each with an outline icon, the title and a state pill ("2 connections to make" amber, "2 AI tools ready" green, "Developer, Light, English" grey); the Me card shows the avatar. App: three cards stretched to the full width, icon in a blue tile, state as plain grey text. Source: `src/features/onboarding/start.tsx`, `src/ui/molecules/door.tsx`.
- `look` Step labels: design "First ticket for a person", "First work by an agent"; app "First assigned ticket", "First run". Source: the `en` strings of the i18n files.

## 54 Setup, this project

Picture: `054-sproject.jpg`. Route: `/setup/project`. Captures: `tall/setup-project.jpg`, `tall/project-bottom.jpg`.

- `missing` Three connection cards at the top: Issue tracker, Code host, Figma, each with a "Not connected" pill and a "Connect" button, amber border when it must be made. App has a "Connections" door and three selects in a "Connections" group. Source: `src/features/projects/settings-project.tsx`, `src/features/settings/setup-project.tsx`.
- `look` Project card. Design: 6 rows (Name, Folder, Specs and docs folders, Screens folder, Languages of the project, Default recipe), each with one value button. App: "Paths 15" with 15 text fields (one per docs folder), plus the groups Languages, Default workflow, Overrides, Project. Source: `src/features/projects/settings-project.tsx`.
- `missing` Card "What agents may do alone": 4 rows with a segmented "Asks first / Alone". App has "Write switches" with 4 toggles at the very bottom of the page. Source: `src/features/sync/automation.tsx`.
- `look` Automation card. Design: Auto-commit toggle, Auto-review toggle, "Limit for each feature" value. App: Auto-commit and "Agent review of each pull request" (a select) are rows of the "Project" group; no limit row. Source: `src/features/projects/settings-project.tsx`, `src/features/settings/project/auto-review.tsx`, `src/features/sync/ticket-budget.tsx`.
- `look` Tickets card. Design: rows "Tickets setup" (chevron), "Fields from the issue tracker" (Choose), "Statuses to Idea, Spec, Build, Review, Ready" (Map). App: a "Tickets" door only. Source: `src/features/settings/setup-project.tsx`.
- `look` More card. Design: 4 rows with a button (Personas Edit, Profiles Edit, Overrides for this project Edit, Import a project Import). App: Personas, Project overrides, Profile are open inline with all fields. Source: `src/features/projects/settings-project.tsx`.
- `look` "Health of this project": design a row card with a chevron at the right column; app a door card at the top.
- `extra` Rows Logo, Remote + Copy address, Look at the remote every, Public holidays, the Overrides group (Theme, Density, High contrast, Accent), Read only: not in the design picture. Keep the functions, move them behind "More".

## 55 Setup, this computer

Picture: `055-sconnections.jpg`. Route: `/setup/computer`. Capture: `tall/setup-computer.jpg`.

- `missing` "Repair" button at the right of the section switch. The part exists: `src/features/settings/connections/repair.tsx`.
- `look` AI tools. Design: one card, 5 rows, pill "Ready" or button "Install". App: one bordered card per tool with a logo tile, tag "Detected" / "− Missing", button "Install <name>", a refresh icon, an "Advanced" disclosure. Source: `src/features/settings/connections/runners-group.tsx`.
- `missing` Card "Model providers" (provider row with Edit, link "Add a provider") visible on the page. App shows a "+ Connection" button; the provider group does not show with the mock data. Source: `src/features/settings/connections/providers-group.tsx`, `connections.tsx`.
- `missing` Card "MCP servers" (server row with pill "On", "Allowed tools N of N", link "Add a server"). App shows only the anchor "MCP servers", no card with the mock data. Source: `src/features/settings/connections/mcp-group.tsx`.
- `missing` Card "Outside agents": row "Agents that use the Shipyard MCP server" with a state pill, the address with "Copy", row "Share Shipyard with other tools" with a chevron. App has a door "Outside agents". Source: `src/features/settings/setup-computer.tsx`, `mcp-outside-group.tsx`.
- `missing` Card "Security": Certificates (Add), Device sign-in (Sign in). App shows only the anchor "Certificates". Source: `src/features/settings/connections/certs-group.tsx`, `device-signin.ts`.
- `extra` Group "Permissions" (Notifications, Documents..., Tour) on this page. The design puts the system permissions on screen 100. Source: `src/features/settings/setup-computer.tsx`.
- `look` Door labels. Design pills: "AI tools and connections", "Models and rules", "Health". App doors: "Agents and rules", "Outside agents", "Health of this computer", "Logs and feedback".

## 56 Setup, models and rules

Picture: `056-sagents.jpg`. Route: `/setup/computer?page=models`. Capture: `tall/p-models.jpg`.

- `missing` Card "Sign-in of the AI tools": 5 tools with pill Signed in / Signed out / Not installed and a "Sign in" button. Not visible in the app page. Source: `src/features/settings/agents-rules.tsx`, `src/features/settings/provider-rows.tsx`.
- `missing` Card "Models": rows Strong, Standard, Fast, Prompt language, each a value button. App has an anchor "Model tiers" but the first screen shows no such card. Source: `src/features/settings/agents-rules.tsx`.
- `look` Card "Agent roles". Design: 3 rows (Scout, Worker, Reviewer) with a letter badge and a tier button. App: "Roles and skills" table at the bottom with tags "Role", "Loaded by factory". Source: `src/features/settings/agents-rules.tsx`.
- `look` Card "Working rules of agents". Design: a list of rules, one toggle each, buttons "Edit as text" and "Project rules". App: 9 dense tables (Objectives, External skills, Skills, Packs, Guides, Patterns, Contract, Policy packs, Roles and skills) with Apply / Remove / Install / Reinstall, risk tags, checkboxes, a "Rules file path" import, "Search skills", "Install the contract", "Upgrade (2)", version links "Compass 1.0.1", "Stack react-web". Source: `src/features/settings/agents-rules.tsx`, `src/features/settings/extensions/compass.tsx`.
- `extra` The 9 tables as the first view. Keep the functions, put them behind "Edit as text" / an advanced view.

## 57 Setup, extensions

Picture: `057-sextensions.jpg`. Route: `/setup/project?page=extensions`. Capture: `tall/p-extensions.jpg`.

- `missing` "Add a plugin" row: 3 plugin tiles with "Add" and one tile "From a folder" with "Choose". App: a "Plugin" group with a "Plugin archive path" field, Review, "Choose a zip", "New plugin", "Try in this project", "Package". Source: `src/features/settings/extensions/extensions.tsx`.
- `look` Installed plugins. Design: rows with a toggle. App: an empty group "Installed plugins 0", and three category columns (Dev containers, Agents, DevOps and security) of small cards with state and version. Source: `src/features/settings/extensions/extensions.tsx`.
- `missing` Card "Skills" (rows with toggles, link "All skills"). Source: `src/features/settings/extensions/extensions.tsx`.
- `look` Child projects. Design: row with "Open", link "Add a child project". App: name + address fields, "+ Add", checkbox row with "4 of 5" and "Remove", "Deploy to 0". Source: `src/features/settings/extensions/extensions.tsx`.
- `missing` Card "Rules setup for a new project": "Agent rules in this project" (pill Set up), "Copy the rules to a new project" (Set up), "Update the rules" (Check). The app has the bootstrap form in Health of this project. Source: `src/features/settings/extensions/compass-setup.tsx`, `src/features/projects/settings-health.tsx`.
- `missing` Row card "Plugins and rule packs" with a chevron (door to screen 88). Source: `src/features/settings/extensions/extensions.tsx`.

## 58 Setup, me

Picture: `058-sme.jpg`. Route: `/setup/me`. Capture: `tall/setup-me.jpg`.

- `missing` Theme card at the top: 5 preview tiles (Light, Dark, OLED, System, System with OLED) and "Import a theme". App: a "Theme" select and a row "Theme files" (Import, Export). Source: `src/features/settings/me/personal.tsx`, `src/features/settings/themes.tsx`.
- `missing` Row with the avatar, the name and "Sign out". Source: `src/features/settings/me/personal.tsx`.
- `look` Language. Design: segmented English / French / German / Spanish + "Import a language"; rows Prompt language, Diagram format. App: selects, a row "Language files" (Import language, Export English). Source: `src/features/settings/languages.tsx`, `personal.tsx`.
- `look` Look card. Design: Density segmented (Comfortable / Compact), High contrast toggle, Text size stepper (100 %), My picture + Change. App: Compact toggle and High contrast toggle here; Text size and picture are on the Look and layout page. Source: `src/features/settings/me/personal.tsx`, `src/features/settings/look-rows.tsx`.
- `look` Notifications. Design: 4 rows (An agent needs me, A review waits for me, A budget reaches 80 %, Sound). App: 10 rows (Question, Approval, Run, Failed sync, Update, Remote branch, Run ended, Pull request checks, Failed scan, Review draft); no Sound row. Source: `src/features/settings/me/personal.tsx`.
- `look` Updates card. Design: Auto-update toggle, Release channel segmented (Stable / Preview). App: "Check for updates automatically" toggle and a raw "Release address" URL field. Source: `src/features/settings/me/personal.tsx`.
- `look` Tools card. Design: Default agent, Terminal app, then chevron rows "Look and layout" and "Change the shortcuts". App: groups "Terminal 4" (Shell, Terminal app, Terminal font, Terminal font size) and "Agent 2"; "Look and layout" is a door card at the top; no "Change the shortcuts" row. Source: `src/features/settings/setup-me.tsx`, `personal.tsx`.

## 59 Setup, health of this computer

Picture: `059-shealth.jpg`. Route: `/setup/computer?page=health`. Capture: `tall/c-health.jpg`.

- `look` Title. Design: the count of problems as the page title ("1 problem"). App: "Health of this computer" with a count pill 0 and "Nothing to fix", while 8 tools show "Missing". Source: `src/features/projects/settings-health.tsx`.
- `missing` Problem banner: amber border, warning icon, "[tool] is missing on this machine", buttons "Details" and black "Fix it". Source: `src/features/projects/settings-health.tsx`.
- `look` Summary tiles. Design: 5 area tiles (Tools, Skills, First setup, Ledger, Console) with an icon tile and a state pill; the area with a problem has an amber border. App: 4 number tiles (Clean groups ring 1/1, To fix, Advice, Notes). Source: `src/features/projects/settings-health.tsx`.
- `missing` Card with rows "Version" (+ Check for an update), "What is new" (Open), "Logs and feedback" (chevron); card with buttons "Send feedback", "Shortcuts", "Manual". Source: `src/features/projects/settings-health.tsx`, `src/features/settings/setup-computer.tsx`.
- `extra` The "Toolchain 8" table (Base, Code hosts, Agents, Scanners with versions and Install buttons) as the first view, the empty "Tools 0" group, the link "Health of this project (2)" in the header. The design shows this behind the "Tools" tile / "Details".

## 76 Setup, automation

Picture: `076-automation.jpg`. Route: `/setup/project`, bottom of the page (no page or pill of its own). Capture: `tall/project-bottom.jpg`.

- `missing` An "Automation" entry (pill) in This project. App: the groups are at the end of a page 4,500 px long. Source: `src/features/settings/setup-project.tsx`, `src/features/sync/automation.tsx`.
- `missing` Main switch "Agents pick up tickets alone" and the toggle "Only tickets marked for agents". Source: `src/features/sync/automation.tsx`.
- `look` Pickup card. Design: rows "Status of the ticket", "Label of the ticket", "Owner of the ticket", Component, Priority as value buttons; "Look for new tickets: Each 60 seconds". App: group "Pickup 5" with text fields (Assignee, Label, Statuses, Component, Priority); "Interval (s)" is a number field in another group. Source: `src/features/sync/automation.tsx`.
- `look` "How many at once". Design: 5 steppers (On this computer, In this project, Plan, Build, Review). App: text fields "Global", "Per project", "Per status". Source: `src/features/sync/automation.tsx`.
- `look` Status mapping. Design: 8 steps (Waits, Plan, Build, Review, Needs a person, Blocked, Done, Stopped), title "What the issue tracker shows for each step". App: 16 internal states (Queued, Claimed, Planning, Plan review, Working, Self review, ...), title "Status mapping 16". Source: `src/features/sync/automation.tsx`.
- `look` "Agents may write". Design: right column card, 4 plain-word toggles (Push the branch, Open the pull request, Move the ticket, Comment in the issue tracker). App: "Write switches 4" (Push, Pull request, Ticket transition, Ticket comment). Source: `src/features/sync/automation.tsx`.
- `missing` Note pill "Off means: the agent asks in Today" with link "Open Today"; rows "Mark one ticket for agents" and "Limits of spend" with chevrons. Source: `src/features/sync/automation.tsx`, `src/features/sync/ticket-budget.tsx`.

## 82 Setup, look and layout

Picture: `082-appearance.jpg`. Route: `/setup/me?page=look`. Capture: `tall/p-look.jpg`.

- `look` Colour. Design: card "Colour" with 5 round swatches. App: select "Accent colour". Source: `src/features/settings/look-rows.tsx`.
- `look` Layout. Design: "Menu of places" and "Side panel" as segmented Left / Right; toggles "Narrow top bar", "Icon in the menu bar of the computer". App: selects "Navigation side", "Drawer side"; toggle label "Menu bar item". Source: `src/features/settings/look-rows.tsx`.
- `look` Motion and focus. Design: Motion toggle, "Ring around the active control" toggle, "Width of the ring" stepper. App: three selects (As the system, With the keyboard, 2 px). Source: `src/features/settings/look-rows.tsx`.
- `look` Text card. Design: Font of the app, Font of code, Font of the terminal, Text size of the terminal (stepper), Dates. App: group "Fonts 2" (Interface font, Code font); terminal font and size are on Me; "Date format" is in the main group. Source: `src/features/settings/look-rows.tsx`, `src/features/settings/me/personal.tsx`.
- `look` "More, this computer". Design: Shell, Data folder + "Change", Portable mode toggle, "Push when I close the app". App: Data folder is a read-only path; Shell is on Me. Source: `src/features/settings/look-rows.tsx`.
- `missing` "Portable mode" toggle, "Change" button of the data folder. Source: `src/features/settings/look-rows.tsx`.
- `extra` Rows "Your picture", "Text size", "Preview", "Show all pages" on this page (design has picture and text size on Me, no Preview row).

## 87 Setup, share Shipyard with other tools

Picture: `087-mcpwiring.jpg`. Route: `/setup/computer?page=share`. Capture: `tall/p-share.jpg`.

- `look` Title and back link. Design: back link "AI tools and connections". App: title "Outside agents", back link "This computer". Source: `src/features/settings/setup-computer.tsx`.
- `look` Tool list. Design: first card "AI tools that can use Shipyard", 5 tools (Claude Code, Codex, GitHub Copilot, Gemini CLI, OpenCode), pill "Connected" + "Remove", or "Connect". App: card "Agent tools" in third place, 3 tools (Claude Code, Codex, VS Code), a config file path, tag "Not wired", button "Wire <tool>". Source: `src/features/settings/connections/mcp-wiring.tsx`.
- `look` "What they may use". Design: one card with tool chips. App: 11 toggle rows (Server on, Read files, Write files, Git, ...), "Port", "Allow list" select, a grid of 26 checkboxes with raw tool names (`project_list_files` ...), "Apply", "Copy token". Source: `src/features/settings/connections/mcp-outside-group.tsx`, `mcp-allow.tsx`, `mcp-tools.tsx`.
- `missing` Card "Address of Shipyard" with the address and "Copy". App has "Port" and "Copy token" only. Source: `src/features/settings/connections/mcp-outside-group.tsx`.
- `look` "Bring servers from another tool". Design: card with a tool picker and a black "Import". App: "Servers in other tools", one row with the command and a download icon. Source: `src/features/settings/connections/mcp-outside-group.tsx`.

## 88 Setup, plugins and rule packs

Picture: `088-plugins.jpg`. `not found`.

Tried: `/setup/project?page=extensions` (no door or row "Plugins and rule packs"); the pages of `setup-project.tsx` are connections, tickets, extensions, health only; `?page=plugins` is not a page id. Parts exist inside other pages: "Plugin" group with Review and Package (`src/features/settings/extensions/extensions.tsx`, `plugin-settings.tsx`), "Policy packs" and "Packs" tables in `/setup/computer?page=models` (`src/features/settings/agents-rules.tsx`), "Deploy to 0" for child projects.

- `missing` The page itself, with: the review card "Check before it applies" (Adds / Changes lines, Refuse, Apply), "Rule packs" with toggles, "Make a plugin from this project" (Package), "Send to the child projects" (checkbox per child, Send). Source: add a page to `src/features/settings/setup-project.tsx`.

## 89 Setup, tickets

Picture: `089-ticketssetup.jpg`. Route: `/setup/project?page=tickets`. Capture: `tall/p-tickets.jpg`.

- `look` Kinds of ticket. Design: chips (Epic, Story, Task, Bug) + "Add". App: 4 text fields (Epic type, Story type, Task type, Sub-task type). Source: `src/features/projects/tickets-config.tsx`.
- `missing` "What holds what": nested boxes (Epic > Story > Task, Bug) and "Change the order". App: select "Hierarchy: Epic per feature". Source: `src/features/projects/tickets-config.tsx`.
- `look` Size. Design: Unit segmented (Days / Points), "Hours in a day" stepper. App: "Estimate" select (Time tracking) + "Estimate field" text field, "Hours per day" number field. Source: `src/features/projects/tickets-config.tsx`.
- `missing` Card "Status in the issue tracker, stage in Shipyard": one row per status with a stage button (Idea, Spec, Build, Review, Ready). Source: `src/features/projects/tickets-config.tsx`.
- `missing` Card "More": "Address of the specs" + Change, "Look for changes every 60 seconds", "Fields of the issue tracker" + "Map the fields". App: "Spec base URL" field and "Labels" field only. Source: `src/features/projects/tickets-config.tsx`.
- `look` Title "Tickets" is printed twice (page title and group header). Source: `src/features/settings/setup-scope.tsx` (`bare`), `tickets-config.tsx`.

## 91 Setup, health of this project

Picture: `091-projecthealth.jpg`. Route: `/setup/project?page=health`. Capture: `tall/p-health.jpg`.

- `look` Heading. Design: sentence heading "3 things to fix in this project" with "Check again" and black "Fix all with an agent" at the right of it. App: title "Health of this project" + count pill; the two buttons sit in the middle of the page, under "Generated files". Source: `src/features/projects/settings-health.tsx`.
- `look` Findings. Design: 3 cards in a row with an amber border, pill "1 to fix", plain title (Broken links between specs and docs, Files that tools generate, Ignore rules of the system), one finding line, "Show all" and black "Fix". App: 4 number tiles (Clean groups ring, To fix, Advice, Notes), then stacked tables "Compliance", "Broken refs", "Generated files" with "Write" / "Open". Source: `src/features/projects/settings-health.tsx`.
- `missing` Card "Also" with chevron rows "Health of the product" and "Health of this computer". Source: `src/features/projects/settings-health.tsx`.
- `extra` Groups "Skills 3" (Upgrade / Apply), "Linked projects" (Inspect, Propagate), "Bootstrap" form (Name, Key, Rust, Claude Code, Create files), "Findings over time" on this page. The design puts findings over time on screen 100 and the rules setup on screen 57.
- `look` Words: "Broken refs", "Compliance", "Bootstrap", "Propagate" are not the plain words of the design.

## 100 Setup, logs and feedback

Picture: `100-healthpanels.jpg`. Route: `/setup/computer?page=logs`. Capture: `tall/p-logs.jpg`.

- `look` Console. Design: card with "Console", segmented All / Info / Warning / Error, "Copy the log", and a dark log block. App: "Debug console 3", a select "All", "Copy log", light rows with time and level tags. Source: `src/features/projects/debug-console.tsx`.
- `missing` Card "Findings over time" (day, "+N new", "−N fixed"). In the app it is on Health of this project. Source: `src/features/projects/settings-health.tsx`, `src/features/settings/setup-computer.tsx`.
- `missing` Card "Personas for prices" (persona, sale rate, cost, toggle, "Add a persona"). In the app it is in This project. Source: `src/features/projects/settings-project.tsx`.
- `missing` Card "What the system allows": Notifications (pill On, "Send a test notification"), Documents, Desktop and Downloads (pill, Allow), "Open the system settings". In the app the "Permissions" group is on This computer, with no test notification and no system settings button. Source: `src/features/settings/setup-computer.tsx`.
- `look` Feedback. Design: right column card, segmented Bug / Idea, Title, Details, "Attach a file", black "Send". App: select "Bug", Title, text area, "Open on GitHub", "Open in mail". Source: `src/features/projects/health-feedback.tsx`.
- `missing` "Attach a file". Source: `src/features/projects/health-feedback.tsx`.
- `look` Sub-navigation: design keeps the pills (AI tools and connections, Models and rules, Health) and the back link "Health"; app shows the back link "This computer" only.

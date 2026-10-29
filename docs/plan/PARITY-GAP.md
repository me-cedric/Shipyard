# Legacy to Shipyard gap audit

Date: 2026-10-29. Source: a read-only audit of every Legacy page, integration and project file format against Shipyard `main` f5e40d3 (three readers). 162 Legacy features checked: 56 present, 63 partial, 43 missing.

Status: `missing` (no UI and no backend), `partial` (part of it, or backend only). P0 = a core flow is broken; P1 = a Legacy user relies on it; P2 = minor.

## P0 (16)

| Area | Feature | State | Gap | Legacy source | Shipyard |
|---|---|---|---|---|---|
| Design | Drawings: Excalidraw edit, draw.io, BPMN, Mermaid, convert | partial | Excalidraw and Mermaid edit; draw.io and BPMN read-only with open-outside. Reads docs/diagrams, not Legacy docs/drawings. | Drawings.tsx, components/diagrams/* | src/features/design/diagrams.tsx |
| Design | Models (LikeC4) editor with live render | partial | Reads docs/models; Legacy .c4 lives in docs/diagrams. | Models.tsx | src/features/design/architecture.tsx |
| Diagrams (LikeC4) | Edit/render LikeC4 .c4/.likec4 in docs/diagrams (StoryArc: 3 .c4 in context, ios-format-components, android-containers) | partial | Shipyard reads .c4 from docs/models, not docs/diagrams. Diagrams tab (docs/diagrams) filters to excalidraw/drawio/mmd/bpmn and skips .c4. StoryArc c4 files invisible in both tabs. This is the 'diagrams list is empty' bug. | repo.rs:99 ext_is c4/likec4; paths.diagrams=docs/diagrams | src/features/design/architecture.tsx (kind=model); design.rs list(): models=docs/models |
| Drawings | Excalidraw/Mermaid/draw.io/BPMN boards in docs/drawings (StoryArc: 7 .mmd + .md siblings) | partial | Shipyard supports the four formats but only under docs/diagrams. docs/drawings never scanned, so StoryArc mmd not listed. Legacy format conversion between the four (diagramconv) unverified in Shipyard. | paths.drawings=docs/drawings; diagramconv.rs FORMATS mermaid/drawio/excalidraw/bpmn | src/features/design/diagrams.tsx; design.rs diagram_format() |
| Git | Merge a chosen branch into current; abort merge | missing | No merge-branch command or dialog. Only pull merges. | git_merge_branch, git_merge_abort, merge-dialog.tsx | none |
| Import | Import a Legacy repo into a Shipyard project | partial | Copies project file, team, costing, and (same path) decisions, questions, openspec. Skips .c4, drawings, api, data-models, flows, designs, slides, personas, calendar, plan, delivery notes, tickets state. Easy fix for the empty lists: copy or map these paths. | n/a | crates/shipyard-store/src/project_import.rs; features/projects/project-import.tsx |
| Project open | Open a Legacy repo (no .shipyard/project.yaml) and see its artifacts | partial | No project.yaml (StoryArc has none) gives NeedsProjectFile, not defaults. Legacy import copies only decisions, questions, openspec, team, costing. User picks a folder and sees empty lists. Core flow broken. | src-tauri/src/infrastructure/config.rs (RepoPaths), projects.rs | crates/shipyard-app/src/commands/projects.rs:123-139 (NeedsProjectFile) |
| Project registry | Legacy project list (~/Library/Application Support/legacy/projects.json: id, name, path, paths) appears in Shipyard | missing | Shipyard registry is its own (crates/shipyard-store/src/project.rs Entry). Legacy registry never read: user must re-add each project by folder. Real registry has entries (e.g. test-repo). | src-tauri/src/infrastructure/projects.rs | none (rg projects.json/Application Support: only shipyard-mcp relay.rs, unrelated) |
| Projects | Close the open project / go back to no project | missing | No close command. Only projects_list/active/open/create/clone/switch/set_view in crates/shipyard-app/src/commands/projects.rs. Once a project is active, FirstRun never shows again. | src/components/project-switcher.tsx, src/pages/Home.tsx | none |
| Projects | Remove (forget) a project from the list, 2-click confirm | missing | No remove/forget command or button. Dead or moved projects stay in the list forever (state 'missing' only). | project-switcher.tsx (project.forget), Home.tsx | none |
| Projects | Existing Legacy folder: auto-detect Legacy paths and write them to project.yaml | missing | Root of empty Diagrams/ADRs/Specs lists. Legacy: Excalidraw in docs/drawings, LikeC4 .c4 in docs/diagrams, flows in docs/network/flows.json. Shipyard: diagrams=docs/diagrams (excalidraw/mermaid/drawio/bpmn), models=docs/models (.c4), flows=docs/flows. Open-folder writes only 3 default paths; nothing scans. | src/lib/surfaces.ts, src-tauri/src/infrastructure/config.rs (docs/drawings, docs/diagrams=.c4, docs/network/flows.json) | crates/shipyard-core/src/project.rs DEFAULT_PATHS/MORE_PATHS |
| Projects | Switch project from top bar, always visible | partial | Plain Select, only when sidebar is expanded AND a project is active. Collapsed sidebar: no switcher. Palette lists projects as a second path. | topbar.tsx ProjectSwitcher | src/features/shell/sidebar.tsx, src/ui/molecules/project-switcher.tsx |
| Projects | Add project from the switcher (add local folder / add remote repo) | partial | Open folder is a palette/menu action. Clone and Create exist only on FirstRun, which is unreachable once a project is open. No add-remote from switcher. | project-switcher.tsx addLocal/addRemote | src/features/shell/actions.ts (project-open), src/features/projects/first-run.tsx |
| Projects | Edit all artifact paths (diagrams, models, api, data, flows, designs, test-plans, handbook, documents, slides, dashboards) | partial | Only keys already in project.yaml are editable. New file holds 3 (decisions, questions, specs). MORE_PATHS cannot be added from UI, so the fix for empty lists is unreachable. i18n labels exist for 3 kinds only. | src/pages/Settings.tsx paths per tab | src/features/projects/settings-project.tsx (rows = Object.keys(draft.paths)) |
| Projects | Legacy import covers all artifacts | partial | Imports only decisions, RAID questions, openspec, team, costing sheets, personas, tickets config. Skips drawings, diagrams/.c4, flows, openapi, data-models, designs, slides, test-plans, documents, planning plan.json, assignments, tickets, qa, security, dashboards, worklog, .agents/legacy.json. Button lives only in Settings/Project and needs a project already open. | whole docs/ tree | crates/shipyard-store/src/project_import.rs, src/features/projects/project-import.tsx |
| Trackers | Set the tracker project key / repo scope (Jira project, GitHub or GitLab repo) from the UI | partial | Backend reads tracker_scope but no field edits it. Jira user cannot point a project at a Jira project key without hand-editing the project file. Without it the backlog stays empty. | pages/tickets/setup-view.tsx, TrackerCard.tsx | crates/shipyard-core project file tracker_scope; src/features/projects/settings-project.tsx (only connection pickers) |

## P1 (48)

| Area | Feature | State | Gap | Legacy source | Shipyard |
|---|---|---|---|---|---|
| Agents | Composer: / prompts of current screen, @ file picker, attachments | missing | No slash menu, no @ file list, no attachments. | assistant composer, pick_files, save_attachment | composer.tsx (refs only via assistantRefAdd) |
| Agents | Selection toolbar: explain, improve, shorten, rephrase, fix | missing | No selected-text actions, no per-screen Ask assistant buttons. | ask-assistant.tsx | assistantExplain is per entity only |
| Agents | AI sessions bar: every agent CLI running on this machine (any terminal), with state and folder | missing | No machine-wide process and transcript scan. | infrastructure/ai_sessions.rs, ai-sessions.tsx | factory/sessions/sessions.tsx shows only Shipyard runs |
| Agents | FinOps: consumption by day and session across assistants (ccusage), request tree flame graph, iterations, prices reveal | partial | Own run spend and budgets. No local history of Claude Code, Codex, Copilot, no trace view. | pages/Finops.tsx, infrastructure/finops.rs | src/features/factory/usage/usage.tsx (runs only), budget_set |
| Assistant | / prompts and @ file mentions in composer | missing | Composer is plain text (composer.tsx). | composer-menu.tsx, assistant-menu.tsx | none |
| Assistant | Bypass-permission warning, Codex trust, install CLI button, no-CLI overlay, blocked panel | missing | No onboarding when no CLI is installed. | bypass-warning-dialog.tsx, codex-trust-button.tsx, install-cli-button.tsx, no-cli-overlay.tsx | none |
| Assistant | Selection toolbar: explain / improve / shorten / rewrite / fix selected text | partial | Explain a ref only. No text-selection toolbar. | selection-actions.tsx | src/features/shell/actions.ts explain, inspector |
| Code | Merge a branch; branch create/delete/switch | partial | Create, switch, delete, fetch, push. No merge-branch action found. | merge-dialog.tsx, branch-panel.tsx | src/features/code/branches.tsx |
| Costing | Costing sheets docs/costing/*.json (lots, features, tasks, margin, monthly spread, portfolio, Excel import/export) | partial | Shipyard reads .yaml only; .json sheets appear only after the one-shot import converts them. Direct open of a Legacy repo shows no sheets. Synthesis/spread/portfolio views not verified. | paths.costing=docs/costing (folder of .json) | work.rs sheet_path docs/costing/<slug>.yaml; project_import.rs sheet(); features/work/estimates.tsx; store/excel.rs |
| Delivery: assignments | Split work per profile: assignments.json, seams, gates, shareable brief (Repartition) | missing | assignments.json not read. No per-profile split screen. | paths.delivery=docs/delivery/assignments.json | none (split.rs is spec split into tracker items, not per-persona assignments) |
| Delivery: impacts and digests | Impact plan (dev) and PO/PM digest from docs/delivery/impacts and digests | partial | Feature exists but reads .shipyard/impacts, not docs/delivery/impacts or digests. Existing Legacy notes not shown. | delivery.rs list_notes; paths.delivery/impacts, digests | store/code.rs IMPACTS_DIR=.shipyard/impacts; features/code/impacts |
| Designs | List/preview design artifacts (HTML, images, .fig open in Figma) in docs/designs | partial | Shipyard lists only screens.json entries. StoryArc screens.json is empty so zero screens; screenshots/, desktop/, brand/, store/ files not listed or previewed. Folder-scan preview missing. | paths.designs=docs/designs; repo.rs list_dir | design.rs read_screens (docs/designs/screens.json); features/design/screens.tsx |
| Doctor | Custom CA certificates (import, enable, remove) for corporate proxies | missing | Corporate users behind TLS inspection cannot reach forges or trackers. | certs_status, certs_import, certs_set_enabled | none |
| Doctor | Compliance, tooling, propagation to linked projects, bootstrap | partial | Findings with fix buttons. No tooling install, no bootstrap flow, no 'what's new since equipped' upgrade view. | src/pages/Doctor.tsx, doctor/* | src/features/projects/settings-health.tsx |
| Doctor | Compliance registry: absent / stale / current per skill, contract, template, policy; upgrade N | partial | Health checks project file, ignore, refs, tools. No ledger of delivered items, no stack detection, no new-since-last list. | pages/Doctor.tsx, provision_ledger, provision_apply, upgrade_report | settings-health.tsx (health_run, health_fix); compassUpgrade |
| Extensions | Catalog deploy, Plugins import .zip, Child projects deploy, Compass skills/packs/contract, MCP servers | partial | Present in two Settings tabs. Compass browse (221 skills, goals, knowledge, docs panels) reduced to rules/tiers. | Catalog.tsx, Plugins.tsx, ChildProjects.tsx, Compass.tsx, MCPServers.tsx | src/features/settings/extensions/*, settings/connections/mcp-group.tsx, settings/agents-rules.tsx |
| Forges | AI actions on a PR: write description, review, reply (pr-workflow, pr-review-governance skills) | missing | No ask-assistant buttons on PR screens. Only run engine self-review. | pull-detail.tsx, ask-assistant.tsx | none |
| Forges | Add forge account: detect gh/glab logins, git credential helper, device login, token verified before save | partial | Manual host+token form only. No gh/glab/git-credential detection, no device login, no credentials check per source. | list_forge_accounts, verify_forge_account, device_login_*, probe_credentials, credential-sources.tsx | settings/connections/connection-form.tsx; crates/shipyard-forges |
| Git | Rebase, continue, abort | missing | No UI nor command. | git_rebase, git_rebase_continue, git_rebase_abort | crates/shipyard-git/src/code/remote.rs (pull_rebase only) |
| Git | History: branch graph from parents, branch and tag labels, commit detail with Changes tree and Info | partial | List with files diff. No graph, no tag/branch chips seen. | history-panel.tsx, commit-graph.tsx, git_log, git_commit_detail | src/features/code/history.tsx |
| MCP | MCP gates and settings: enable, writes, forge, exec, git, delivery switches, port, allowed tools, agent access wiring | missing | No toggles, no port, no write of .mcp.json or codex config for the user's own agents. | set_legacy_mcp_*, set_agent_access, set_mcp_allowed_tools, mcpwiring.rs | none in UI |
| MCP | Legacy MCP server for outside agents: reads, git, tickets, forge, QA, ADR decide, delivery diff; HTTP and stdio | partial | Server is per run for Shipyard agents. No project read, git, forge, QA or write tools for an outside Claude or Codex. | application/mcp, mcptools, legacy_server.rs | crates/shipyard-mcp (tools/agent.rs: ask_question, post_progress, handoff, message, spawn_subtask, report, read_ticket, read_ref) |
| Network flows | IPAM flow table (VLAN, protocol, allow/deny, filters) from docs/network/flows.json | partial | Shipyard reads yaml/yml in docs/flows. Legacy flows.json not read nor imported. Different path and format. | paths.flows=docs/network/flows.json (single file) | design.rs read_flows/write_flows; features/design/flows.tsx; project.rs flows=docs/flows |
| Personas | Project personas/roles with TJM in docs/personas/personas.json | missing | No personas screen or file read. Import only maps persona id to role name and drops TJM/description. Roles live in .shipyard/ roles. | paths.personas=docs/personas/personas.json | project_import.rs roles() only (used to name team roles); role_rates in work.rs |
| Planning (calendar, plan) | Working week, holidays (calendar.json) and Gantt arbitrations (plan.json) | partial | Shipyard Plan tab exists, but reads yaml. Legacy calendar.json and plan.json are neither read nor imported. Holidays and human date decisions lost. | docs/planning/calendar.json, plan.json | work.rs CALENDAR_PATH=docs/planning/calendar.yaml, DECISIONS_PATH=docs/planning/plan.yaml; features/work/plan.tsx |
| Planning (team) | Team members, windows, absences docs/planning/team.json | partial | Imported once into .shipyard/team.yaml. Not read in place. Windows collapse to one from/until pair, skills lost. | paths.planning=docs/planning/team.json | work.rs TEAM_PATH=.shipyard/team.yaml; project_import.rs team() |
| Project paths | Per-project path override (Settings paths per tab, stored in Legacy registry) | partial | Shipyard supports paths in project.yaml but import never copies registry overrides, and kind names differ (adr/openapi/data_models/flows/drawings/personas/planning/delivery not in map; MORE_PATHS has models/handbook/documents/dashboards instead). Legacy custom paths silently lost. | config.rs RepoPaths + Connection.paths | crates/shipyard-core/src/project.rs (paths map in project.yaml); crates/shipyard-store/src/project_import.rs:5 (Q-091 not read) |
| Projects | Projects page: cards with branch, last commit, behind/changes, source (local/host), grouped by host | missing | No project list page. Home space is Inbox/My work/Activity. Switcher shows a status dot only. | src/pages/Home.tsx ProjectCard | none |
| Projects | Repo picker: choose account, list forge repos with search, push-impossible marker, new remote repo, new local repo | partial | Create-repo on forge exists in Connections. No repo browser/search when cloning, no push-target check, no new local repo from picker. | src/components/repo-picker.tsx, new-repo-forms.tsx, origin-detect.tsx | src/features/settings/connections/connections.tsx (create repository) |
| Scanners | Security: dependency (osv-scanner), code SAST (semgrep), skills scan (SkillSpector), SBOM, score, saved scans | missing | Three scanners always show not installed. No download, no SBOM, no score. | security_scan, security_sast, security_skills, security_sbom, security_download | code.rs SCANNERS: dependencies, code, skills hard-coded unavailable |
| Scanners | QA: run project test scripts, BDD view, checks, passes | partial | Checks run with last report. No BDD view. | pages/Qa.tsx, qa_scripts, qa_run | src/features/code/quality.tsx (checks from declared commands, click guard) |
| Settings | Settings / Team tab | missing | Tab is reachable and shows the empty state with a no-op button. | n/a | src/features/shell/spaces.ts lists 'settings/team'; src/app/tab-view.tsx has no view |
| Settings | Preferences page: 7 groups (general, appearance, layout, a11y, assistant, terminal, notifications) | partial | Has theme, language, role, compact, contrast, notification sources, release URL. Missing: fonts, reduced motion, density levels, accent personal, drawer sides, terminal mode/font, default CLI/model, detected assistants, model providers, shortcut editor, update toggle. | src/pages/Preferences.tsx, src/pages/preferences/* | src/features/settings/me.tsx |
| Settings | Settings: repo connection, branch, token, verify credentials, tracker card, auto-commit, costing seal | partial | Connections (tracker/forge/MCP/providers) and seal exist. No credential-source check, no auto-commit. | src/pages/Settings.tsx, src/pages/settings/* | src/features/settings/connections/*, src/features/projects/settings-project.tsx, src/features/work/seal.tsx |
| Shell | File browser drawer: lazy tree, new file/folder, rename (F2), delete, reveal in Finder, open in editor, terminal here, copy path | missing | No working-copy file tree. Only per-feature file editors and the Changes tree. | src/components/file-browser.tsx, file-browser-button.tsx | none |
| Shell | Page tours (417 keys) and tour button per page | missing | No tour code in src/features or src/lib. Master plan row 'tours kept' is false. | src/lib/tour, page-tour-button.tsx | none (plan says tours kept) |
| Shell | Command: Welcome / Get started 6-step checklist (network, prereqs, connect, equip, skills, specs) with auto-detected done | missing | No guided setup, no prereq check page. Health tab covers tools partially. | src/pages/Welcome.tsx, prereq-list.tsx | src/features/projects/first-run.tsx (3 buttons only) |
| Shell | Branch switcher in top bar on every page + repo status + pull button | partial | Branch selector shows only in Code space. Sync button in status bar covers pull. | topbar.tsx BranchSwitcher, RepoStatus, PullButton | src/app/router.tsx (trailing in Code space), status-bar.tsx |
| Shell | Keyboard shortcuts: help overlay, rebindable, sync/commit/theme/assistant/settings/preferences | partial | Fixed Mod+1..8, J, K, B, I. No help overlay, no remap, no sync/commit/theme shortcuts. Shift chords ignored. | src/components/shortcut-help.tsx, src/lib/shortcuts.ts | src/features/shell/actions.ts useShortcuts |
| Shell | Notification centre drawer (bell): detail, Open, dismiss, clear all, quick actions | partial | Toasts plus Home/Activity list. No bell in the shell, no unread accent. | src/components/notifications-menu.tsx, toast.tsx | src/lib/notifications/index.tsx, src/features/home/activity.tsx, ui/organisms/toaster |
| Shell | Terminal drawer (panel or external app, keeps running when hidden, Nerd font) | partial | Code/Terminal tab only. No drawer from any page, no external-terminal mode, no font setting. | src/components/terminal-panel.tsx | src/features/code/terminal.tsx, use-terminal.ts |
| Shell | Context menu on any row/tile/node (copy path, open in editor, ask assistant) | partial | Ref actions and inspector exist. No generic right-click menu with open-in-editor/copy-path. | src/components/item-menu.tsx, topbar-context-menu.tsx | src/lib/menus, src/features/shell/ref-detail.tsx |
| Slides | reveal.js decks in docs/slides + present mode + CGI HTML template | partial | Same path, Markdown split on ---. Legacy CGI-branded HTML template/theme and its HTML decks not matched (Shipyard has DeckTheme). Not imported. | paths.slides=docs/slides (.md) | crates/shipyard-store/src/knowledge.rs parse_deck; features/knowledge/slides.tsx |
| Specs | Chain watch: 'to check' documents downstream of a change | missing |  | chain-watch.tsx, patterns/chain-*.tsx | none |
| Tickets | Jira epics/stories projected from costing + assignments; sync; tickets.config/json/plan/sync/apply.log in docs/delivery | partial | Only projectKey read, once. tickets.json, plan, sync, apply log never read, so Legacy ticket links and adopt state lost. Tracker apply exists separately. | docs/delivery/tickets.*.json; features.md Tickets | project_import.rs project_file() (projectKey to key + tracker scope); crates/shipyard-trackers; features/work/apply.tsx |
| Trackers | Ticket setup form: issue types (epic, story, task, subtask), hierarchy mode, estimate field and mode, hours per day, spec base URL, labels | missing | No per-project tracker config for issue types, estimate field, hours/day or spec URL. Plan/apply has no mapping to set. | pages/tickets/setup-view.tsx | none (only hierarchy flag in connections.tsx) |
| Trackers | Edit a ticket: summary, description, type, priority, due date, estimate, labels | partial | Tracker update exists in the crate. Detail pane only changes status, assignee and the pickup label. No edit form. | pages/tickets/ticket-edit.tsx | crates/shipyard-trackers/src/work.rs (update); src/features/work/ticket-detail.tsx |
| Trackers | Read and add comments on a ticket; recent comments feed; mentions | partial | Trait supports comments. No comment thread or comment box in ticket detail, no mentions feed in Home. | tickets_recent_comments, tickets_mentions, tickets_issue | crates/shipyard-trackers work.rs (comments_page, add_comment); no UI |

## P2 (42)

| Area | Feature | State | Gap | Legacy source | Shipyard |
|---|---|---|---|---|---|
| Agents | Orca sessions in top bar and open in Orca | missing | No Orca reader. | infrastructure/orca.rs, orca_open | none |
| Agents | AI CLIs: Claude Code, Codex, Copilot detected with version; install CLI | partial | Detects Claude, Codex, Copilot, Gemini, OpenCode. No install button. | list_clis, install_cli | connections/runners-group.tsx; crates/shipyard-agents/src/runners.rs |
| Agents | Assistant worktree discard and default settings UI | partial | Spec gap in W9 notes. | n/a (new in Shipyard) | assistantWorktreeDiscard, assistantDefaultsGet/Set (no UI) |
| Assistant | Follow-up suggestion buttons, answer-in-one-click options | partial | 'Options' exists in i18n; confirm UI wiring not verified. | assistant-followups.ts | src/features/assistant/reply.ts |
| Catalog | Undeploy a component; custom catalog repo | missing | No remove, no remote catalog. | undeploy_component, catalog repo setting | none |
| Child projects | Remove a child; inspect child (n/m of parent items, deployed marks) | partial | No remove button, no compliance count. | delete_child_project, inspect_child_project | childRemove command, no UI |
| Code | QA (checks, BDD, passes), Security scanners, Impacts | partial | Check/scanner rows with last result. No BDD view, no coverage graph, no QA report form. | Qa.tsx, Security.tsx, Impacts.tsx | src/features/code/quality.tsx, impacts.tsx |
| Compass | Import own skills, remove user skills/instincts, custom packages, check and refresh external skills | missing | Only apply and upgrade. | compass_import_skills, compass_save_package, compass_check_external_skills | none |
| Compass | Apply guardrail policy packs; install contract (AGENTS.md pointers, command registry, templates) | partial | Contract kind applies through ac. No policy pack choice. | compass_apply_policy, compass_install_contract | crates/shipyard-app/src/extensions/compass.rs |
| Compass | Goals panel, knowledge panel (patterns/instincts deploy) | partial | No goals panel. | compass/GoalsPanel.tsx, KnowledgePanel.tsx | pattern kind in compass.tsx |
| Design | Designs (.fig viewer, Figma import) and Design doc (design.md validate) | partial | Screens + open in Figma + design doc text. No .fig preview, no Figma token import, no design.md validate. | Designs.tsx, DesignDoc.tsx, designs/fig-viewer.tsx, figma-import.tsx | src/features/design/screens.tsx |
| Doctor | Tooling: run Compass helper tools (doctor, secrets, gates, snapshot, dashboard...), install prereqs, Node check | missing | No tool list or run buttons. | list_tools, run_tool, install_prereq, check_prereqs | none (run_compass internal) |
| Doctor | Bootstrap new project form from generator schema, writes prompt and answers, sends to assistant | missing | Create project only. | bootstrap_answers_schema, bootstrap_project | none |
| Doctor | Propagate parent items to linked projects with n/m | missing | Depends on ledger. | Doctor propagation | none |
| Forges | Repo picker: list repos by recent activity, search, push-impossible marker, push-target check, create repo, new local repo | partial | List and create present. No push-target protected-branch warning, no new local repo. | list_forge_repos, check_push_target, create_forge_repo, repo-picker.tsx | connections.tsx (connectionsRepos, connectionsCreateRepo) |
| Git | Force push (with lease) from UI | missing | Absent. | git_force_push | none |
| Git | Blame | missing | Absent. | git_blame_paths | none |
| Git | Docs-chain gate: warn before commit or push when linked docs are stale | missing | No pre-commit staleness dialog. | chain-gate.tsx, chain-watch.tsx | none (refs_check exists, not wired to commit) |
| Git | Conflict resolver: per block ours/theirs/both/none, whole side, agent, editor; refuse leftover marker | partial | Blocks and sides present. No hand a conflict to an agent, no open in editor. | conflict-dialog.tsx, conflict-panel.tsx, git_resolve | changes.tsx (resolve, takeOurs, takeTheirs, markResolved) |
| Git | Remote watch: background fetch, notify on moved heads, per-project interval and opt-out | partial | Notice shows. codeWatchIntervalSet has no UI. | remote-watch.tsx, check_remote_updates | crates/shipyard-app/src/commands/code.rs (watch), status-bar.tsx |
| MCP | Import custom MCP servers from another config; list servers active elsewhere | missing | Absent. | import_custom_mcp_servers, list_mcp_servers_elsewhere | none |
| MCP | MCP resources and prompts (legacy://file, skill) | partial | Ref resource only. | mcpresources.rs, mcpprompts.rs | crates/shipyard-mcp server.rs (shipyard://ref resource) |
| Plugins | Plugin list, delete, track in project, set config, export sample | missing | No installed list or later config. | list_plugins, delete_plugin, set_plugin_config, export_sample_plugin | none |
| Projects | Project details (path, URL, folder, status) and open remote in browser | missing | No project details panel, no open-remote link. | project-switcher.tsx details/openRemote | none |
| Projects | Screens/surfaces toggle per project (.agents/legacy.json), locked-route message | missing | No way to hide spaces/tabs per project. Sidebar has fixed 8 spaces ordered by role. | src/pages/settings/SurfacesCard.tsx, src/lib/surfaces.ts | none |
| Projects | Recent projects list on first run / welcome | partial | Palette group 'Recent projects' lists all registered projects. FirstRun shows only open/clone/create. | Home.tsx, Welcome.tsx | src/features/shell/palette-host.tsx |
| Projects | Per-project overrides: accent, assistant CLI/model/effort/permission, remote-watch interval/branches, notifications | partial | Theme, density, contrast, accent only. No assistant, remote-watch or notification overrides. | src/components/project-overrides.tsx | src/features/projects/settings-project.tsx |
| Projects | Role/profile: choose role and tabs, project-assigned profile, switcher, read-only per profile | partial | Role select only reorders spaces. No per-project profile, no tab access/read-only, no profile switcher. | src/components/onboarding/role-onboarding.tsx, profile-switcher.tsx, project-profiles.tsx, src/lib/profiles.ts | src/features/projects/first-run.tsx, src/features/settings/me.tsx, src/features/shell/spaces.ts |
| Scanners | Security: secrets leaks scan (gitleaks) | partial | Own pattern scan, not gitleaks. Works. | security_leaks | code.rs scan_run (built-in regex) |
| Settings | Auto-commit setting and close guard for pending changes | missing | No pending-change guard on close. | set_auto_commit, close_anyway, close-guard.tsx | none |
| Shell | OS notifications when window unfocused, asked once at first launch | missing | No notification plugin in src or crates. | src/lib/system-notify.ts | none |
| Shell | Feedback button / bug report | missing |  | src/components/feedback-button.tsx, feedback.tsx | none |
| Shell | Debug console (log, durable history) | missing |  | src/components/debug-console.tsx | none |
| Shell | Close guard (unsaved/running warning on quit) | missing |  | src/components/close-guard.tsx | none |
| Shell | Sidebar groups with change/PR/impact counts, collapse to rail, peek | partial | 8 spaces, collapse works. No counts/badges, no new-surface badge. | src/components/shell/sidebar.tsx | src/features/shell/sidebar.tsx |
| Shell | What's new / release notes after update; update check with badge | partial | Check works, notes via notification. No version badge in the bar, no What's new dialog. | src/components/onboarding/whats-new.tsx, version-status.tsx | src/lib/updates/index.ts, palette action update-check |
| Test plans | Gherkin .feature plans in docs/delivery/test-plans with .json verdict sibling | partial | Same default path and .feature. Verdict .json sibling format compatibility not verified; not in import SAME list. | paths.test_plans=docs/delivery/test-plans | project.rs test-plans path; features/specs/test-plans.tsx; design.rs ext=feature |
| Trackers | Budget bar on tickets vs costing | missing | No ticket vs estimate budget bar. | components/tickets/budget-bar.tsx | none |
| Trackers | Add and edit labels on a ticket | partial | Only the pickup label toggles. No free label add or remove. | tickets_issue_labels | ticket-detail.tsx (workMark = pickup label only); crates/shipyard-trackers add_label |
| Trackers | Workflow guide page (ADE stages, blocked label, loop) | partial | Run states map to tracker statuses and labels. No explainer page. | pages/tickets/workflow-view.tsx, tickets_ade_stage | src/features/factory/workflows/workflows.tsx; sync/automation.tsx state-to-status map |
| UX design doc | View/edit design.md (Google-style UX/UI spec) | partial | Shipyard looks in docs/designs/design.md. StoryArc has docs/design.md (root of docs): not found. | docs/design.md or designs dir | design.rs design_doc_path = docs/designs/design.md |
| Workflows / architecture folders | docs/workflows and docs/architecture markdown (StoryArc has both) | partial | Not Legacy features per code, but StoryArc docs/architecture, docs/workflows, docs/delivery/*.md, docs/decisions README are in no Shipyard list. Architecture tab means LikeC4 models, not docs/architecture. Handbook default paths do not match. | no dedicated reader (rg: none); plain docs | Handbook/Documents (docs/handbook, docs/documents only); factory_files.rs workflows=.shipyard/workflows |

## Present (56)

| Area | Feature |
|---|---|
| ADRs | List/read/decide MADR records in docs/decisions |
| Agents | API model providers (Ollama, OpenRouter, vendor), models fetch, key in keychain |
| Agents | Assistant drawer: tabs, per-tab session, streaming steps, file cards, copy and quote reply, follow-up buttons |
| Agents | Model and effort pick per CLI, context ring, account quota windows |
| Agents | Permission levels (ask, edit, auto) and grant-and-resume when the CLI refuses a tool |
| Agents | Factory runs, workflows, agents map, plan approve, kill switch |
| Agents | Notification centre with quick actions and OS notifications per category |
| Assistant | Drawer with CLI runner (Claude/Codex/Copilot), model + effort lists, mode, permission |
| Assistant | Multiple conversation tabs, rename, delete, per-thread session |
| Assistant | Tool trace, changed-file cards with diff, copy/insert code, retry, grant permission |
| Assistant | Context ring + quota windows, new conversation when full |
| Assistant | Resize drawer, move left/right |
| Assistant | Send to factory (work item from chat) |
| Catalog | Catalog: devcontainers, agents instructions, DevOps (GitLab, GitHub, Ansible, Terraform), security (Sonar, grype, syft, Renovate); preview and deploy |
| Child projects | Linked child repos: add, clone, deploy catalog or compass items, commit and push |
| Code | Git changes tree, stage/unstage/discard, commit, stash, conflict resolver, history graph |
| Code | Pull requests: list, detail, create, comment, approve, merge, AI actions |
| Compass | Browse skills, packs, guides, patterns, contract; search; preview SKILL.md; apply selected |
| Data models | DBML models in docs/data-models |
| Design | ADRs: list, create from template, edit, accept/refuse with comment |
| Design | OpenAPI Redoc/Swagger toggle; DBML; IPAM flows with filters |
| Forges | Pull requests list, detail, files diff, commits, CI checks, conversation, verdicts |
| Forges | Open PR, comment, approve, request changes, merge/squash/rebase, ready |
| Git | Working copy as folder tree: stage, unstage, discard per file/folder/selection, staged vs working diff |
| Git | Commit with summary counter (50 chars advisory) and description; commit all |
| Git | Pull, push, fetch, fast-forward |
| Git | Stash: save (with untracked), apply, pop, drop, diff |
| Git | Branches: list local/remote, create, switch, delete, ahead/behind |
| Impacts | Impacts: diff vs ref, dev analysis (7 axes), PO digest, saved files |
| Knowledge | Graph, Handbook, Documents (+docx dossiers), Slides, Learn, Dashboards |
| MCP | MCP catalogue, enable, start, stop, secrets, deps install, custom server add/remove |
| MCP | Relay for stdio servers and proxy of third-party servers |
| OpenAPI | View OpenAPI in docs/api (Redoc read / Swagger try) |
| OpenSpec | Changes, capabilities, constitution, schema shipyard-delivery in docs/openspec |
| Plugins | Import .zip plugin: review files, accept, apply, MCP and config |
| Projects | Clone a repo (URL + folder) |
| Projects | Open the page the project was on when switching/reopening |
| Projects | Remote watch: poll remote per project, notify moved branch with Sync button |
| RAID / questions | RAID register: one md file per question/risk/assumption in docs/delivery/questions |
| Sessions | AI sessions bar: running/idle sessions on machine, open terminal |
| Shell | Command palette (nav, actions, projects, refs) |
| Shell | Native menu |
| Shell | Theme toggle, language switch in top bar |
| Specs | OpenSpec: tree, change stages (propose/apply/archive), journey greenfield/brownfield, delegate |
| Specs | Questions RAID, Test plans (Gherkin), constitution |
| Trackers | Test the tracker connection and show the reason |
| Trackers | Tracker kinds: Jira Cloud, GitHub Issues, GitLab Issues, Azure DevOps |
| Trackers | Ticket list / registry with key, status, assignee, updated, time spent, Jira-only state |
| Trackers | Change status (transition) from the UI |
| Trackers | Assign a ticket, ranked suggestions from team |
| Trackers | Sync: adopt provable tickets, propose link for the rest, import backlog into a costing sheet |
| Trackers | Plan and apply: project epics and stories from costing, review, apply, apply log, dup warning |
| Trackers | Worklog: log work on a ticket, pull worklogs, push to tracker, month stats |
| Trackers | Delegate a ticket or change to an agent run |
| Update | App update check and release notes |
| Work | Backlog/Board, Tickets plan+apply+sync, Estimates (sheets, Excel), Plan (Gantt), Team, Time/worklog |

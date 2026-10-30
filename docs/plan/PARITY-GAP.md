# Legacy to Shipyard gap audit

Date: 2026-10-30. Source: re-audit of the 2026-10-29 gap list against Shipyard `main` bbec969, after wave W10. 162 Legacy features checked: 117 present, 36 partial, 9 missing.

Status: `missing` (no UI and no backend), `partial` (part of it, or backend only). P0 = a core flow is broken; P1 = a Legacy user relies on it; P2 = minor.

## P0 (0)

None open. W10 closed all core flows (open in place, registry, close, remove, paths, merge, tracker scope).

## P1 (23)

| Area | Feature | State | Gap | Legacy source | Shipyard |
|---|---|---|---|---|---|
| Agents | Composer attachments | partial | / prompts and @ files done. No attachments. | pick_files, save_attachment | src/features/assistant/composer.tsx |
| Agents | FinOps: ccusage history, request tree, prices | partial | Own runs plus machine usage. No request tree, no flame graph. | pages/Finops.tsx | src/features/factory/usage/machine-usage.tsx |
| Assistant | Bypass-permission warning, Codex trust | partial | No-CLI panel with install done. No bypass warning, no Codex trust button. | bypass-warning-dialog.tsx, codex-trust-button.tsx | src/features/assistant/no-cli.tsx |
| Designs | List and preview docs/designs files (HTML, images, .fig) | partial | Only screens.json entries. No folder scan. | paths.designs | crates/shipyard-store/src/design.rs read_screens |
| Doctor | Custom CA certificates (import, enable, remove) | partial | Env bundle and OS roots only. No UI. | certs_import, certs_set_enabled | crates/shipyard-http/src/client.rs |
| Doctor | Compliance, tooling, propagation, bootstrap | partial | Tools list, install and findings ledger done. No bootstrap, no propagation, no upgrade view. | pages/Doctor.tsx | src/features/projects/doctor-tools.tsx, doctor-ledger.tsx |
| Doctor | Compliance registry: absent, stale, current per item | partial | Ledger records finding changes. No per-skill status, no stack detection. | provision_ledger, upgrade_report | src/features/projects/doctor-ledger.tsx |
| Extensions | Compass browse (skills, goals, knowledge, docs) | partial | Rules and tiers only. No goals or knowledge panel. | Compass.tsx | src/features/settings/extensions/compass.tsx |
| Import | Import a Legacy repo into a Shipyard project | partial | Open in place works. The import copies only project file, team, costing, personas, tickets config. | n/a | crates/shipyard-store/src/project_import.rs |
| Import | Legacy import covers all artifacts | partial | Skips plan, calendar, designs, slides, dashboards, worklog, .agents/legacy.json. | whole docs/ tree | project_import.rs |
| MCP | Legacy MCP server for outside agents | partial | Read, write, git, forge, check, delivery diff done. No ticket tools, no ADR decide, no QA. | legacy_server.rs | crates/shipyard-mcp/src/outside.rs |
| Planning | Working week, holidays (calendar.json), arbitrations (plan.json) | partial | Only yaml read. Legacy json not read. | docs/planning/calendar.json, plan.json | work.rs CALENDAR_PATH, DECISIONS_PATH |
| Scanners | Security: SBOM, score, saved scans | partial | osv-scanner, semgrep, skillspector run with install. No SBOM, no score. | security_sbom | crates/shipyard-app/src/scanners.rs |
| Scanners | QA: BDD view | partial | Checks and last report. No BDD view. | pages/Qa.tsx | src/features/code/quality.tsx |
| Settings | Preferences: 7 groups | partial | Theme, language, role, density, contrast done. No fonts, terminal, default CLI, shortcut editor in me.tsx. | pages/Preferences.tsx | src/features/settings/me.tsx |
| Shell | File browser drawer (tree, new, rename, delete, reveal) | missing | No working-copy file tree. | file-browser.tsx | none |
| Shell | Page tours and tour button | missing | No tour code. | src/lib/tour | none |
| Shell | Get started checklist | missing | First run has open, clone, create only. | Welcome.tsx | src/features/projects/first-run.tsx |
| Shell | Terminal drawer from any page | partial | Code / Terminal tab only. No drawer, no external mode. | terminal-panel.tsx | src/features/code/terminal.tsx |
| Shell | Context menu on any row | partial | Menu atom exists. Not on every row. No open-in-editor or copy-path everywhere. | item-menu.tsx | src/ui/molecules/context-menu.tsx |
| Slides | reveal.js decks, CGI HTML template | partial | Markdown decks only. HTML decks and template not matched. | paths.slides | crates/shipyard-store/src/knowledge.rs parse_deck |
| Specs | Chain watch: documents to check downstream | partial | Gate on push done. No chain watch view. | chain-watch.tsx | src/features/code/push-target.tsx |
| Trackers | Edit a ticket (type, priority, due, estimate, description) | partial | Title and labels only. | ticket-edit.tsx | src/features/sync/ticket-thread.tsx |

## P2 (22)

| Area | Feature | State | Gap | Legacy source | Shipyard |
|---|---|---|---|---|---|
| Agents | Orca sessions | missing | No Orca reader. | orca.rs | none |
| Agents | Assistant worktree discard and defaults UI | partial | Commands exist. No UI found. | n/a | assistantWorktreeDiscard |
| Catalog | Custom catalog repo | partial | Undeploy done. No remote catalog. | catalog repo setting | src/features/settings/extensions/extensions.tsx |
| Code | QA coverage graph, report form | partial | No BDD, no coverage graph. | Qa.tsx | src/features/code/quality.tsx |
| Compass | Custom packages, check external skills | partial | Import and remove done. No packages. | compass_save_package | src/features/settings/extensions/compass.tsx |
| Compass | Policy packs | partial | No policy pack choice in UI. | compass_apply_policy | crates/shipyard-app/src/extensions/manage.rs |
| Compass | Goals and knowledge panels | partial | No goals panel. | GoalsPanel.tsx | compass.tsx |
| Design | Designs .fig viewer, Figma import, design.md validate | partial | Open in Figma only. | fig-viewer.tsx | src/features/design/screens.tsx |
| Design | Drawings: draw.io and BPMN edit, convert | partial | Path fixed (docs/drawings). draw.io and BPMN read-only. | Drawings.tsx | src/features/design/diagrams.tsx |
| Doctor | Bootstrap new project form | missing | Create project only. | bootstrap_project | none |
| Doctor | Propagate parent items to linked projects | missing | Absent. | Doctor propagation | none |
| MCP | MCP resources and prompts | partial | Ref resource only. | mcpresources.rs | crates/shipyard-mcp/src/server.rs |
| Projects | Screens toggle per project | missing | Absent. | SurfacesCard.tsx | none |
| Scanners | Secrets scan (gitleaks) | partial | Built-in regex scan. | security_leaks | scan_run |
| Shell | OS notifications when unfocused | partial | Plugin registered in Rust. No send path found in src. | system-notify.ts | crates/shipyard-app/src/lib.rs |
| Shell | Feedback button | missing | Absent. | feedback-button.tsx | none |
| Shell | Debug console | missing | Absent. | debug-console.tsx | none |
| Shell | What's new dialog, version badge | partial | Check works. No dialog, no badge. | whats-new.tsx | src/lib/updates/index.ts |
| Test plans | Verdict .json sibling | partial | Compatibility not verified. | docs/delivery/test-plans | src/features/specs/test-plans.tsx |
| Trackers | Workflow guide page | partial | No explainer page. | workflow-view.tsx | src/features/factory/workflows/workflows.tsx |
| UX design doc | docs/design.md | partial | Reads docs/designs/design.md only. | docs/design.md | design.rs design_doc_path |
| Workflows | docs/workflows and docs/architecture markdown | partial | In no Shipyard list. | none | Handbook, Documents |

## Present (117)

| Area | Feature |
|---|---|
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
| Project open | Open a Legacy repo with no project file (layout detected) |
| Project registry | Legacy project list read, project opens in place |
| Projects | Close the open project |
| Projects | Remove a project from the list |
| Projects | Auto-detect Legacy paths (drawings, diagrams, flows) |
| Projects | Switch project from the top bar |
| Projects | Add project from the switcher (folder, clone) |
| Projects | Edit all artifact paths (14 kinds) |
| Trackers | Set the tracker project key and repo scope |
| Design | Models (LikeC4) editor, .c4 in docs/diagrams |
| Diagrams | LikeC4 files in docs/diagrams listed and rendered |
| Drawings | Boards in docs/drawings listed |
| Git | Merge a chosen branch, abort merge |
| Agents | Selection toolbar: explain, improve, shorten, rephrase, fix |
| Assistant | Selection toolbar: explain, improve, shorten, rewrite, fix |
| Agents | AI sessions bar: every agent CLI on the machine |
| Assistant | / prompts and @ file mentions in the composer |
| Code | Merge a branch |
| Costing | Legacy docs/costing/*.json sheets read in place |
| Delivery | Assignments per profile with brief |
| Delivery | Impact notes and digests in docs/delivery |
| Forges | AI actions on a PR |
| Forges | Add forge account: gh/glab login detection |
| Git | Rebase, continue, abort |
| Git | History with branch graph |
| MCP | MCP gates and settings for outside agents |
| Network flows | IPAM flows from docs/network/flows.json |
| Personas | Personas with TJM |
| Planning | Team members in docs/planning/team.json, read in place |
| Project paths | Per-project path override from the Legacy registry |
| Projects | Projects page with cards |
| Projects | Repo picker with search and push-target check |
| Settings | Settings / Team tab |
| Settings | Repo connection, tracker card, auto-commit, costing seal |
| Shell | Branch switcher in the top bar |
| Shell | Keyboard shortcuts with help overlay and rebind |
| Shell | Notification centre (bell, unread, clear) |
| Tickets | Legacy ticket links and config |
| Trackers | Ticket setup form (issue types, estimate field, hours per day) |
| Trackers | Comments on a ticket |
| Agents | AI CLIs detected, install from the no-CLI panel |
| Assistant | Follow-up suggestion buttons |
| Child projects | Remove a child |
| Compass | Import own skills, remove user skills |
| Doctor | Tooling: run and install tools |
| Forges | Repo picker with create repo |
| Git | Force push with lease |
| Git | Blame |
| Git | Docs-chain gate before push |
| Git | Conflict resolver with hand-off to the factory |
| Git | Remote watch with per-project interval |
| MCP | Import custom MCP servers, list servers elsewhere |
| Plugins | Plugin list, delete, config |
| Projects | Project details and open remote |
| Projects | Recent projects on first run |
| Projects | Per-project overrides |
| Projects | Role and profile per project |
| Settings | Auto-commit and close guard |
| Shell | Close guard |
| Shell | Sidebar counts |
| Trackers | Budget bar on tickets |
| Trackers | Add and remove labels |

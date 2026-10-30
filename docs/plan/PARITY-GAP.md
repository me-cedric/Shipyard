# Legacy to Shipyard gap audit

Date: 2026-10-30. Source: re-audit of the 2026-10-29 gap list against Shipyard `526239f` plus the uncommitted stage 8 work (the audit at 526239f found 133 present, 28 partial, 1 missing). 162 Legacy features checked: 136 present, 25 partial, 1 missing.

Status: `missing` (no UI and no backend), `partial` (part of it, or backend only). P0 = a core flow is broken; P1 = a Legacy user relies on it; P2 = minor.

## P0 (0)

None open. W10 closed all core flows (open in place, registry, close, remove, paths, merge, tracker scope).

## P1 (10)

| Area | Feature | State | Gap | Legacy source | Shipyard |
|---|---|---|---|---|---|
| Designs | List and preview docs/designs files (HTML, images, .fig) | partial | Q-122: the folder scan lists HTML, image and .fig files as screens, opened outside. No inline preview. | paths.designs | crates/shipyard-store/src/design.rs read_screens |
| Extensions | Compass browse (skills, goals, knowledge, docs) | partial | Rules and tiers only. No goals or knowledge panel. | Compass.tsx | src/features/settings/extensions/compass.tsx |
| Import | Import a Legacy repo into a Shipyard project | partial | Open in place works. The import adds calendar and plan (Q-122). Still not copied: slides, dashboards, worklog. | n/a | crates/shipyard-store/src/project_import.rs |
| Import | Legacy import covers all artifacts | partial | Q-122: calendar.json, plan.json and the designs folder are read. Skips slides, dashboards, worklog, .agents/legacy.json. | whole docs/ tree | project_import.rs |
| Settings | Preferences: 7 groups | partial | Theme, language, role, density, contrast done. No fonts, terminal, default CLI, shortcut editor in me.tsx. | pages/Preferences.tsx | src/features/settings/me.tsx |
| Shell | File browser drawer (tree, new, rename, delete, reveal) | partial | Stage 6: drawer with tree, ⌘P search, viewer, show in Changes, copy path. Read only: no new, rename, delete (Q-127). | file-browser.tsx | src/features/code/file-drawer.tsx, code_file_list |
| Shell | Terminal drawer from any page | partial | Stage 6: bottom drawer with tabs on every view (⌘`, Q-088 option 1); the Code / Terminal tab stays. No external mode. | terminal-panel.tsx | src/features/code/terminal-drawer.tsx |
| Slides | reveal.js decks, CGI HTML template | partial | Markdown decks only. HTML decks and template not matched. | paths.slides | crates/shipyard-store/src/knowledge.rs parse_deck |
| Specs | Chain watch: documents to check downstream | partial | Gate on push done. No chain watch view. | chain-watch.tsx | src/features/code/push-target.tsx |
| Trackers | Edit a ticket (type, priority, due, estimate, description) | partial | Q-123: title, description, labels (add, remove), assignee, status and priority with capability flags. No type, due date or estimate. | ticket-edit.tsx | src/features/sync/ticket-thread.tsx |

## P2 (16)

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
| MCP | MCP resources and prompts | partial | Ref resource only. | mcpresources.rs | crates/shipyard-mcp/src/server.rs |
| Scanners | Secrets scan (gitleaks) | partial | Built-in regex scan. | security_leaks | scan_run |
| Shell | OS notifications when unfocused | partial | Plugin registered in Rust. No send path found in src. | system-notify.ts | crates/shipyard-app/src/lib.rs |
| Test plans | Verdict .json sibling | partial | Compatibility not verified. | docs/delivery/test-plans | src/features/specs/test-plans.tsx |
| Trackers | Workflow guide page | partial | No explainer page. | workflow-view.tsx | src/features/factory/workflows/workflows.tsx |
| UX design doc | docs/design.md | partial | Reads docs/designs/design.md only. | docs/design.md | design.rs design_doc_path |
| Workflows | docs/workflows and docs/architecture markdown | partial | In no Shipyard list. | none | Handbook, Documents |

## Present (136)

| Area | Feature |
|---|---|
| Agents | API model providers (Ollama, OpenRouter, vendor), models fetch, key in keychain |
| Agents | Assistant drawer: tabs, per-tab session, streaming steps, file cards, copy and quote reply, follow-up buttons |
| Agents | Model and effort pick per CLI, context ring, account quota windows |
| Agents | Permission levels (ask, edit, auto) and grant-and-resume when the CLI refuses a tool |
| Agents | Factory runs, workflows, agents map, plan approve, kill switch |
| Agents | Notification centre with quick actions and OS notifications per category |
| Agents | Selection toolbar: explain, improve, shorten, rephrase, fix |
| Agents | AI sessions bar: every agent CLI on the machine |
| Agents | AI CLIs detected, install from the no-CLI panel |
| Agents | Composer attachments |
| Agents | FinOps: ccusage history, request tree, prices |
| Assistant | Drawer with CLI runner (Claude/Codex/Copilot), model + effort lists, mode, permission |
| Assistant | Multiple conversation tabs, rename, delete, per-thread session |
| Assistant | Tool trace, changed-file cards with diff, copy/insert code, retry, grant permission |
| Assistant | Context ring + quota windows, new conversation when full |
| Assistant | Resize drawer, move left/right |
| Assistant | Send to factory (work item from chat) |
| Assistant | Selection toolbar: explain, improve, shorten, rewrite, fix |
| Assistant | / prompts and @ file mentions in the composer |
| Assistant | Follow-up suggestion buttons |
| Assistant | Bypass-permission warning, Codex trust |
| Catalog | Catalog: devcontainers, agents instructions, DevOps (GitLab, GitHub, Ansible, Terraform), security (Sonar, grype, syft, Renovate); preview and deploy |
| Child projects | Linked child repos: add, clone, deploy catalog or compass items, commit and push |
| Child projects | Remove a child |
| Code | Git changes tree, stage/unstage/discard, commit, stash, conflict resolver, history graph |
| Code | Pull requests: list, detail, create, comment, approve, merge, AI actions |
| Code | Merge a branch |
| Compass | Browse skills, packs, guides, patterns, contract; search; preview SKILL.md; apply selected |
| Compass | Import own skills, remove user skills |
| Costing | Legacy docs/costing/*.json sheets read in place |
| Data models | DBML models in docs/data-models |
| Delivery | Assignments per profile with brief |
| Delivery | Impact notes and digests in docs/delivery |
| Design | ADRs: list, create from template, edit, accept/refuse with comment |
| Design | OpenAPI Redoc/Swagger toggle; DBML; IPAM flows with filters |
| Design | Models (LikeC4) editor, .c4 in docs/diagrams |
| Diagrams | LikeC4 files in docs/diagrams listed and rendered |
| Doctor | Tooling: run and install tools |
| Doctor | Custom CA certificates (import, enable, remove) |
| Doctor | Compliance, tooling, propagation, bootstrap |
| Doctor | Compliance registry: absent, stale, current per item |
| Doctor | Bootstrap new project form |
| Doctor | Propagate parent items to linked projects |
| Drawings | Boards in docs/drawings listed |
| Forges | Pull requests list, detail, files diff, commits, CI checks, conversation, verdicts |
| Forges | Open PR, comment, approve, request changes, merge/squash/rebase, ready |
| Forges | AI actions on a PR |
| Forges | Add forge account: gh/glab login detection |
| Forges | Repo picker with create repo |
| Git | Working copy as folder tree: stage, unstage, discard per file/folder/selection, staged vs working diff |
| Git | Commit with summary counter (50 chars advisory) and description; commit all |
| Git | Pull, push, fetch, fast-forward |
| Git | Stash: save (with untracked), apply, pop, drop, diff |
| Git | Branches: list local/remote, create, switch, delete, ahead/behind |
| Git | Merge a chosen branch, abort merge |
| Git | Rebase, continue, abort |
| Git | History with branch graph |
| Git | Force push with lease |
| Git | Blame |
| Git | Docs-chain gate before push |
| Git | Conflict resolver with hand-off to the factory |
| Git | Remote watch with per-project interval |
| Impacts | Impacts: diff vs ref, dev analysis (7 axes), PO digest, saved files |
| Knowledge | Graph, Handbook, Documents (+docx dossiers), Slides, Learn, Dashboards |
| MCP | MCP catalogue, enable, start, stop, secrets, deps install, custom server add/remove |
| MCP | Relay for stdio servers and proxy of third-party servers |
| MCP | MCP gates and settings for outside agents |
| MCP | Import custom MCP servers, list servers elsewhere |
| MCP | Legacy MCP server for outside agents |
| Network flows | IPAM flows from docs/network/flows.json |
| OpenAPI | View OpenAPI in docs/api (Redoc read / Swagger try) |
| OpenSpec | Changes, capabilities, constitution, schema shipyard-delivery in docs/openspec |
| Personas | Personas with TJM |
| Planning | Team members in docs/planning/team.json, read in place |
| Planning | Working week, holidays (calendar.json), arbitrations (plan.json) |
| Plugins | Import .zip plugin: review files, accept, apply, MCP and config |
| Plugins | Plugin list, delete, config |
| Project open | Open a Legacy repo with no project file (layout detected) |
| Project paths | Per-project path override from the Legacy registry |
| Project registry | Legacy project list read, project opens in place |
| Projects | Clone a repo (URL + folder) |
| Projects | Open the page the project was on when switching/reopening |
| Projects | Remote watch: poll remote per project, notify moved branch with Sync button |
| Projects | Close the open project |
| Projects | Remove a project from the list |
| Projects | Auto-detect Legacy paths (drawings, diagrams, flows) |
| Projects | Switch project from the top bar |
| Projects | Add project from the switcher (folder, clone) |
| Projects | Edit all artifact paths (14 kinds) |
| Projects | Projects page with cards |
| Projects | Repo picker with search and push-target check |
| Projects | Project details and open remote |
| Projects | Recent projects on first run |
| Projects | Per-project overrides |
| Projects | Role and profile per project |
| Projects | Screens toggle per project |
| RAID / questions | RAID register: one md file per question/risk/assumption in docs/delivery/questions |
| Scanners | Security: SBOM, score, saved scans |
| Scanners | QA: BDD view |
| Sessions | AI sessions bar: running/idle sessions on machine, open terminal |
| Settings | Settings / Team tab |
| Settings | Repo connection, tracker card, auto-commit, costing seal |
| Settings | Auto-commit and close guard |
| Shell | Command palette (nav, actions, projects, refs) |
| Shell | Native menu |
| Shell | Theme toggle, language switch in top bar |
| Shell | Branch switcher in the top bar |
| Shell | Keyboard shortcuts with help overlay and rebind |
| Shell | Notification centre (bell, unread, clear) |
| Shell | Close guard |
| Shell | Sidebar counts |
| Shell | Page tours and tour button |
| Shell | Get started checklist |
| Shell | Context menu on any row |
| Shell | Feedback button |
| Shell | Debug console |
| Shell | What's new dialog, version badge |
| Specs | OpenSpec: tree, change stages (propose/apply/archive), journey greenfield/brownfield, delegate |
| Specs | Questions RAID, Test plans (Gherkin), constitution |
| Tickets | Legacy ticket links and config |
| Trackers | Test the tracker connection and show the reason |
| Trackers | Tracker kinds: Jira Cloud, GitHub Issues, GitLab Issues, Azure DevOps |
| Trackers | Ticket list / registry with key, status, assignee, updated, time spent, Jira-only state |
| Trackers | Change status (transition) from the UI |
| Trackers | Assign a ticket, ranked suggestions from team |
| Trackers | Sync: adopt provable tickets, propose link for the rest, import backlog into a costing sheet |
| Trackers | Plan and apply: project epics and stories from costing, review, apply, apply log, dup warning |
| Trackers | Worklog: log work on a ticket, pull worklogs, push to tracker, month stats |
| Trackers | Delegate a ticket or change to an agent run |
| Trackers | Set the tracker project key and repo scope |
| Trackers | Ticket setup form (issue types, estimate field, hours per day) |
| Trackers | Comments on a ticket |
| Trackers | Budget bar on tickets |
| Trackers | Add and remove labels |
| Update | App update check and release notes |
| Work | Backlog/Board, Tickets plan+apply+sync, Estimates (sheets, Excel), Plan (Gantt), Team, Time/worklog |

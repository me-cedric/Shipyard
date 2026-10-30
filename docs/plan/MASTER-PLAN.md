# Shipyard master plan

Status: proposed, 2026-10-29. Owner: Cédric Meyer.
Source: a full read of the earlier desktop tool, agent-compass 1.0.2, and the reference projects in section 12.

## 1. Goal

Shipyard is one desktop app for the whole project team.
It runs one loop: design, specify, split into work items, assign, build with agents, review, merge, close.
Every project artifact lives in the Git repository (Project-as-a-Git).

Users: project manager, architect, developer, QA tester, business analyst, functional lead, junior.

Three quality axes apply to each decision:

- UX: fewer screens, one way to do each thing, the layout explains itself.
- DX: generated contracts, feature folders, small crates, fast tests.
- AX: specs first, agent rules from agent-compass, structured agent tools, budgets.

## 2. Problems to solve

The earlier structure has 40 routes, 281 Tauri commands, about 63,000 TSX lines and 70,000 Rust lines.
The features are good. The structure is not.

| Problem | Example |
|---|---|
| Too many pages | 40 routes, 12 sidebar groups, 4 stacked filters that hide pages |
| Overlap | Costing "Plan" tab, Gantt page and Tickets "Generate" tab do the same job |
| Twin names | Settings "Preferences" tab and `/preferences`; `/learning` and `/learning-path` |
| Repeated actions | Commit in 11 pages, the sidebar and Git; Pull in sidebar, topbar and Git |
| Text load | 490 titles, 336 hints, 216 descriptions, 343 tour anchors |
| Weak links | Pages connect only through a "chain" staleness graph, not through real references |
| Hand-written IPC | About 250 hand-written `invoke` wrappers over ts-rs types |
| Jira-shaped trackers | `repoissues.rs` depends on `jira::Api` |
| God files | `MCPServers.tsx` 1,287 lines, `finops.rs` 1,857 lines, one 281-command handler list |
| No agent factory | Delegation sets a label. There is no run engine, no worktrees per agent, no question loop |

## 3. Concept model

One reference graph connects everything. Each entity has a stable `ref`.

| Entity | Ref example | Stored in |
|---|---|---|
| Project | `project:shipyard` | `.shipyard/project.yaml` |
| Member | `member:cmeyer` | `.shipyard/team.yaml` |
| Diagram, ADR, API, data model, screen | `adr:0004`, `diagram:context` | `docs/**` |
| Spec (OpenSpec change or capability) | `spec:auth/login` | `docs/openspec/**` |
| Question (RAID) | `q:Q-012` | `docs/delivery/questions/` and the tracker comment |
| Work item (epic, story, task, bug) | `wi:SHIP-42` | the tracker; mirror in the local store |
| Workflow | `wf:feature` | `.shipyard/workflows/*.yaml` |
| Run, step, event | `run:01JD…` | local store; summary on the ticket |
| Pull request | `pr:github:42` | the forge; mirror in the local store |

Links: a spec cites ADRs and diagrams. A spec splits into work items. A work item starts a run. A run asks questions and opens a pull request. A merge closes the work item.
Every view shows the backlinks of its entity. The knowledge graph is this graph, drawn.

## 4. Information architecture

The 40 routes become 7 spaces and one settings area. Tabs inside a space replace pages.

| Space | Views | Main roles |
|---|---|---|
| Home | Inbox ("Needs you"), My work, Activity | everyone |
| Design | Diagrams, Architecture (LikeC4), Decisions (ADR), API, Data, Flows, Screens | architect |
| Specs | Changes, Capabilities, Questions, Test plans, Constitution | BA, functional lead, QA |
| Work | Backlog, Board, Plan (Gantt), Estimates, Team, Time | PM |
| Factory | Runs, Workflows, Agents map, Sessions, Usage | developer, PM |
| Code | Changes, History, Branches, Pull requests, Quality, Impacts, Terminal | developer, QA |
| Knowledge | Graph, Handbook, Documents, Slides, Learn, Dashboards | junior, everyone |
| Settings | Project, Connections, Agents and rules, Extensions, Team, Me, Health | admin, everyone |

Global, in every space: the command palette (search and actions), the assistant panel, the inspector panel, notifications.
One commit action exists, in the shell status bar. One sync action exists, in the shell status bar.

### Features

| Feature | Where in Shipyard |
|---|---|
| Drawings (Excalidraw, draw.io, Mermaid, BPMN) | Design / Diagrams |
| Models (LikeC4) | Design / Architecture |
| ADRs (MADR, accept or refuse) | Design / Decisions |
| OpenAPI, Data models (DBML), Flows (IPAM) | Design / API, Data, Flows |
| Designs, Design doc | Design / Screens |
| Specifications (OpenSpec), delegate | Specs / Changes and Capabilities; Factory runs |
| Questions (RAID) | Specs / Questions; Home / Inbox |
| Test plans (Gherkin) | Specs / Test plans |
| QA, Security scanners | Code / Quality |
| Impacts | Code / Impacts |
| Git (changes, conflicts, history, stash, branches) | Code |
| Pull requests (GitHub, GitLab) | Code / Pull requests |
| Embedded terminal | Code / Terminal (panel) |
| Team, Personas, Availability, Assignments | Work / Team |
| Costing (sheets, Excel, sealed) | Work / Estimates |
| Planning (Gantt) | Work / Plan |
| Tickets (sync, plan and apply, setup, labels) | Work / Backlog and Board; Settings / Connections |
| Imputations, worklog | Work / Time |
| FinOps | Factory / Usage |
| AI sessions bar, Orca | Factory / Sessions |
| Assistant drawer (Claude Code, Codex, Copilot, API providers) | Assistant panel (same runner as Factory) |
| Knowledge graph | Knowledge / Graph |
| Wiki handbook | Knowledge / Handbook |
| Documents, Slides | Knowledge / Documents, Slides |
| Learning, Learning path | Knowledge / Learn |
| Dashboards | Home widgets; Knowledge / Dashboards |
| Compass (skills, packs, guides, contract) | Settings / Agents and rules |
| MCP servers (catalogue, custom, start, stop, deps) | Settings / Connections |
| Catalog, Plugins, Child projects | Settings / Extensions |
| Doctor | Settings / Health; status bar |
| Settings, Preferences | Settings / Project, Me |
| Welcome, Home (project list) | First run; project switcher |
| MCP server (HTTP, stdio, relay, gates, proxy) | `shipyard-mcp` crate |
| i18n FR and EN, tours, context menus, native menu, update check | Kept |

## 5. The factory loop

This is the new core. It comes from Symphony (run engine), Paperclip (claims, budgets, goals), Orca (worktree per task), agent-orchestrator ("Needs you" lane, CI feedback) and Backlog.md (human checkpoints).

### 5.1 Connections and sync

- Trackers: Jira Cloud and Data Center, GitHub Issues, GitLab Issues, Azure DevOps, Linear.
- Forges: GitHub, GitLab, Azure DevOps.
- One `Tracker` trait with capability flags: hierarchy, transitions, labels, comments, time tracking, assignee. No tracker shape leaks into another.
- Sync polls. The default interval is 60 s, the minimum 30 s, with jitter and "updated since" queries. A webhook relay is a later option.
- Each tick reconciles before it dispatches: fetch, diff, update the mirror, stop runs whose ticket became terminal, then pick up new work.
- The mirror is a local SQLite store in the app data folder. The tracker stays the source of truth for tickets.

### 5.2 Pickup rules

Configured per project in `.shipyard/automation.yaml`:

- Filter: assignee, label (default `shipyard`), status set, component, priority.
- Concurrency: global, per project, per status. Default 2 runs.
- Claim: an atomic lock in the store, plus a claim stamp on the ticket. Two machines never run the same ticket.

### 5.3 Run state machine

Shipyard owns the run state. Config maps each run state to a tracker status and labels.

```
Queued → Claimed → Planning → PlanReview* → Working → SelfReview → PROpen → Merged → Done
                                                  ↑                    │
                                                  └── ChangesRequested ┘
Side states, from any active state:
  WaitingForAnswer (stores the return state)   Blocked   RetryQueued   Paused (budget)   Failed   Cancelled
* PlanReview is a human gate. A workflow can turn it off.
```

- `WaitingForAnswer` pauses the stall timer and the budget clock.
- CI failure or review comments on the pull request move the run back to `Working`, in the same worktree.
- Retry backoff: `min(10 s × 2^(n−1), 5 min)`.

### 5.4 Workflows

- Files: `.shipyard/workflows/<id>.yaml`, committed. A JSON Schema validates them. Hot reload keeps the last valid version.
- Defaults: `feature`, `bug`, `spike`, `spec-split`, `review-only`.
- A step has: `id`, `role`, `model`, `effort`, `tools`, `mode` (plan, auto), `workspace` (worktree, shared, none), `needs`, `gate` (none, human), `for_each` (fan-out), `retry`, `timeout`, `budget`.
- A role is a Markdown agent profile: compass `scout`, `worker`, `reviewer`, plus Shipyard `planner`, `tester`, `docs`, `triager`. Projects can add roles.

```yaml
id: feature
steps:
  grill:  { role: planner,  model: opus,   effort: high,   skill: grill-me }
  plan:   { role: planner,  model: opus,   effort: high,   needs: [grill], gate: human }
  build:  { role: worker,   model: sonnet, effort: medium, needs: [plan], workspace: worktree, for_each: plan.tasks, max_parallel: 2 }
  review: { role: reviewer, model: opus,   effort: high,   needs: [build], fresh_context: true, max_rounds: 2 }
  pr:     { action: open_pr, needs: [review] }
limits: { max_turns: 40, budget_usd: 5, stall_s: 300 }
```

### 5.5 Agents, sub-sessions and messages

- Runners: Claude Code, Codex, GitHub Copilot (ACP), Gemini CLI, OpenCode, and HTTP model providers. All run headless with streamed JSON.
- Sub-sessions: a `for_each` step starts child runs. Each child gets its own worktree when the step says so. The parent collects the outputs.
- Agents do not chat freely. They write structured events to the run bus through the Shipyard MCP tools:
  `ask_question`, `post_progress`, `handoff`, `message`, `spawn_subtask`, `report`, `read_ticket`, `read_ref`.
- Each event is in the append-only run log. The UI and the ticket summary read the same log.

### 5.6 Questions: the human-in-the-loop step

1. The planner runs the `grill-me` skill on the ticket first. Each open high-impact item becomes a question.
2. Any agent can call `ask_question` with a question, two to four options, a recommended option, and free text allowed.
3. Shipyard moves the run to `WaitingForAnswer`. It moves the ticket to the mapped status (for example `Needs info`).
4. Shipyard posts one comment with a marker `<!-- shipyard:q Q-012 -->` and numbered options. Spec-level questions also get a RAID file.
5. The person answers in Shipyard (Home / Inbox) or on the tracker site.
6. The next tick finds the first human reply after the marker. It reads an option number, a letter, `/answer B`, or free text.
7. The run resumes at its return state with the answer in context. It resumes the CLI session when the CLI supports it. Else it re-briefs from the run log.

### 5.7 Review, pull request, merge

- `SelfReview`: the reviewer role, fresh context, the compass `review` skill (spec and standards), two fix rounds at most.
- Pull request: compass `pr-flow` rules. Branch `<type>/<area>/<kebab>`. Conventional commit. Body: opening paragraph, gate result, one item per ticket. Existing labels only. No AI attribution.
- Merge detection on a tick: the run goes to `Merged`, then `Done`. Shipyard moves the ticket, posts the run summary, removes the worktree.

### 5.8 Permissions, budgets, audit

- Automation writes are off by default: push, pull request, tracker transition, tracker comment. A project admin turns each one on in Settings. That switch is the durable "yes" that agent-compass asks for.
- Without the switch, each write waits in Home / Inbox for one click.
- Budgets per run, per day, per member: tokens and money. Alert at 80 %. Hard stop moves the run to `Paused`.
- Limits: stall timeout, max turns, kill switch per run and global.
- Secrets live in the OS keychain. They never go in arguments, files in the repo, or logs.
- Never a worklog write without the person's action (kept from compass).

### 5.9 Visualization

- Factory / Runs: lanes Queued, Working, Needs you, In review, Ready to merge, Done.
- Run view: the workflow DAG with live step states (xyflow), the event tail, the diff, the cost.
- Factory / Agents map: a live force graph of agents, tickets, files and refs.
- Knowledge / Graph: the same renderer on the reference graph and the code graph (codebase-memory).

## 6. Team, roles, juniors

- `.shipyard/team.yaml`: name, tracker handles, role, capacity, skills.
- The PM assigns in Work. Shipyard suggests an assignee from skills and capacity.
- Each member runs Shipyard on their machine. The rule "assigned to me" splits the agent work across the team.
- Each role gets a default home view. No page is hidden. The sidebar order changes per role.
- Junior mode: an "Explain" action on every entity. The assistant answers from the reference graph and cites refs. Knowledge / Learn builds a path from the ADRs, specs and architecture. A glossary comes from the specs.

## 7. Architecture

### 7.1 Backend (Rust workspace)

| Crate | Content |
|---|---|
| `shipyard-core` | Domain types, refs, run state machine, workflow model. No I/O. |
| `shipyard-store` | SQLite mirror and run log (`rusqlite`), repo file codecs (YAML, MADR, RAID, OpenSpec). |
| `shipyard-trackers` | `Tracker` trait and adapters. |
| `shipyard-forges` | `Forge` trait, pull requests, CI status. |
| `shipyard-git` | git2 operations, worktrees, credentials (one place). |
| `shipyard-agents` | CLI and HTTP runners, MCP injection, session resume. |
| `shipyard-engine` | Scheduler tick, claims, dispatch, budgets, retries. |
| `shipyard-mcp` | MCP server (stdio, HTTP, relay), gates, proxy. |
| `shipyard-app` | Tauri shell. Commands grouped by feature module. |
| `shipyard-cli` | Headless binary: `shipyard run`, `shipyard mcp`, `shipyard check`. |

### 7.2 IPC

`tauri-specta` generates the TypeScript types, the command functions and the event types. No hand-written wrapper. CI fails when the generated file is stale.
A generated mock layer serves the same contract to Vite, Vitest and Playwright. The UI then runs in a browser without Tauri.

### 7.3 Frontend

- React 19, Vite, TypeScript strict, TanStack Router (typed) and TanStack Query.
- Tailwind v4, shadcn/ui on Base UI, `motion`, heroicons-animated, `cmdk`, TanStack Table and Virtual, xyflow.
- `src/ui/` holds the atomic layers. `src/features/<space>/` holds each space. A feature imports only `ui`, `lib` and its own folder.

## 8. Design system

- Atomic layers: tokens, atoms, molecules, organisms, templates, pages. The dev build has a gallery route for each layer.
- Tokens: OKLCH colours (12-step neutral, one accent, four status colours), 4 px grid, type 11/12/13/14/16/20. Visual language v2 (ADR 0014, `docs/design/visual-language-v2.md`): four surface levels with soft elevation, an accent gradient and glow, radius 8, 12 and 16, spring motion.
- Fonts: Switzer (Fontshare) for text, Departure Mono for ids, numbers and code. Fallback Inter. See Q-001.
- Atoms: Button, IconButton, Input, Select, Checkbox, Switch, Badge, StatusDot, Avatar, Kbd, Tooltip, Skeleton.
- Molecules and organisms: CommandPalette, FilterBar, TicketRow, TicketCard, BoardColumn, RunStep, QuestionCard, ApprovalBar, RefChip, BacklinkList, Inspector, EditorFrame, SettingsRow, MemberRow.
- Templates: Shell (sidebar, main, inspector), Board, List and detail, Editor, Settings.
- Rules:
  - No taglines, no helper text, no secondary labels. When a screen needs them, change the layout.
  - Icon and noun as labels. Group headings show a count.
  - Status uses shape and colour together.
  - Empty state: ghost rows and one primary action.
  - Tooltip: name and shortcut only.
  - One primary action per view. Details open in the inspector.
  - Motion follows ADR 0014: springs on hover, press, panels and page change; only a live agent loops. `prefers-reduced-motion` turns all of it off.
- Density: row 28 px, text 13 px, sidebar 48 px or 220 px, inspector 320 px.

## 9. Agent rules (AX)

- agent-compass is a submodule at `docs/agent-compass`, pinned to a tag. `ac sync` writes the contract, skills, agents, hooks and packs.
- Shipyard project rules sit outside the compass markers in `AGENTS.md`.
- The same principles ship inside the product. The default workflows use model tiers, effort levels, fresh-context review, two parallel workers at most, and short reports.

## 10. Waves

Each wave has its own session. Inside a wave, a workflow runs six agents or fewer. Two writers at most, on separate files.
Each wave keeps a progress file at `.agents/progress/<wave>.md` (compass `harness-loop`).

| Wave | Goal | Output | Models | Exit check |
|---|---|---|---|---|
| W0 | Foundation | Repo, compass, plan, constitution, ADRs, logo | Opus | `ac doctor`, `ac check --docs` |
| W1 | Specs | One OpenSpec change per capability (section 11) | Opus outlines and reviews; Sonnet fills; Haiku checks | `openspec validate --all --strict` |
| W2 | Skeleton | Tauri app, Rust workspace, IPC generation and mock, tokens, atoms, shell, palette, gallery, CI | Sonnet builds; Opus reviews | build, unit, e2e smoke on macOS |
| W3 | Core | Projects, settings, secrets, connections, git, ref graph store | Sonnet; Opus for store design | tests, e2e |
| W4 | Work | Backlog, board, team, assignment, estimates, plan, time, tracker sync | Sonnet | tests, e2e with fake tracker |
| W5 | Design and Specs | Editors, OpenSpec views, split to work items, questions | Sonnet | tests, e2e |
| W6 | Factory engine | Workflows, runners, worktrees, MCP server, question loop, review, PR, merge detection, budgets | Opus designs; Sonnet builds; Opus reviews | engine tests with fake tracker, forge and CLI |
| W7 | Factory UI | Runs lanes, run DAG, agents map, inbox, notifications | Sonnet | e2e |
| W8 | Knowledge and roles | Graph, explain, handbook, documents, slides, learn, dashboards, quality, extensions | Sonnet; Haiku for i18n | e2e |
| W9 | Release | a11y, performance, packaging, project import, docs | Sonnet; Opus final review | full suite, signed builds |

Token rules for the build:

- Opus, high effort: architecture, the engine state machine, security, wave reviews.
- Sonnet, medium effort: implementation and spec writing.
- Haiku, low effort: lookups, scans, i18n keys, changelog lines.
- Keep the model and effort fixed inside one task.
- Delegate broad reads. Keep only the conclusion in the main context.
- Start a new session per wave. Hand off with the progress file, not with the transcript.

## 11. Capabilities for W1

1. `shell` — app shell, navigation, palette, inspector, notifications, i18n, role homes.
2. `projects` — open, create, switch, health, project import.
3. `connections` — trackers, forges, MCP servers, model providers, secrets.
4. `refs` — reference graph, backlinks, search.
5. `design` — diagrams, architecture, decisions, API, data, flows, screens.
6. `specs` — OpenSpec changes and capabilities, constitution, questions, test plans, split to work items.
7. `work` — backlog, board, team, assignment, estimates, plan, time.
8. `sync` — tracker mirror, polling, reconcile, claims.
9. `factory` — workflows, runs, state machine, runners, sub-sessions, budgets.
10. `questions-loop` — ask, post, detect answer, resume.
11. `delivery` — review, pull request, CI feedback, merge detection, close.
12. `code` — git, pull requests view, quality, impacts, terminal.
13. `knowledge` — graph, explain, handbook, documents, slides, learn, dashboards.
14. `assistant` — chat panel, threads, context, modes.
15. `extensions` — compass rules, plugins, catalog, child projects.
16. `design-system` — tokens, atoms, molecules, organisms, templates, gallery.

## 12. References

- agent-compass 1.0.2: rules, skills, OpenSpec schema `shipyard-delivery`.
- openai/symphony: tick, claims, retries, `WORKFLOW.md`, workspace hooks.
- paperclipai/paperclip: goal ancestry, atomic checkout, budgets, approval gates.
- stablyai/orca: worktree per task, multi-agent compare, attention notifications.
- ComposioHQ/agent-orchestrator: "Needs you" lane, CI and review feedback to the owner.
- MrLesk/Backlog.md: three human checkpoints, one task per session.
- affaan-m/ecc: role library as Markdown, hooks as enforcement.
- Graphify-Labs/graphify: graph output, EXTRACTED and INFERRED edges.
- UI: runcabinet.com (three-pane shell, approval queue), paceui.com (agent console), shadcn/ui, Radix colour scales, heroicons-animated, Departure Mono, Fontshare, Mobbin (patterns).

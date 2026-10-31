# Spec: assistant

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-assistant`

### Goal

One assistant panel opens from every space. It keeps threads per project, takes refs as context, and runs on the same runners and budgets as the factory. A thread can become a work item or a run.

### Why

The earlier tool has an assistant drawer with its own runner. It does not know the project graph and it does not share budgets with delegation. People need quick answers and small changes without a full run. Shipyard needs one assistant on one runner layer.

### Users And Scenarios

- PM: asks about status and sends a thread to the factory as a work item.
- Architect: asks about decisions and models with refs, and reads the Explain answer.
- Developer: uses agent mode in a worktree for a small change and reads the diff.
- QA: asks in ask mode about specs and tests and cites the requirement.
- BA: uses plan mode to draft a plan and sends it to the factory.
- Functional lead: asks what a spec means and opens the cited refs.
- Junior: uses Explain on any entity to learn the project.

### Requirements

- REQ-001: The system SHALL show the assistant panel in every space and in Settings.
- REQ-002: The system SHALL keep the threads of the assistant for each project.
- REQ-003: The system SHALL store the threads in the app data folder and MUST NOT write them to the repository.
- REQ-004: Each turn SHALL carry a context of the current view, the selected entity and the refs that the person added.
- REQ-005: The person SHALL be able to add a ref to the context.
- REQ-006: The system SHALL send a selected passage, a ticket text or a file text as quoted content.
- REQ-007: In ask mode the assistant SHALL be read only.
- REQ-008: In plan mode the assistant SHALL write a plan as the reply and SHALL change no file.
- REQ-009: In agent mode the assistant SHALL change files only in a worktree of its own.
- REQ-010: When a tool denies the runner a permission, the thread SHALL show that it waits for the person.
- REQ-011: Each thread SHALL have its own runner, model and effort.
- REQ-012: The assistant SHALL use the runner layer of the factory.
- REQ-013: Each turn SHALL load the compass rules and the skills of the project that the extensions capability gives.
- REQ-014: A person SHALL be able to send a thread to the factory as a work item through `add-work` REQ-029.
- REQ-015: A person SHALL be able to send a thread to the factory as a run. The system SHALL set the label `wf:<id>` on the REQ-014 item and MUST NOT start a run directly.
- REQ-016: The system SHALL answer an Explain request of the knowledge capability in ask mode.
- REQ-017: Each reply SHALL offer the actions copy, insert and open a cited ref.
- REQ-018: The system SHALL tell a quota failure from an error and SHALL say so in one sentence.
- REQ-019: A project SHALL be able to set the default runner, model, effort and mode of new threads.
- REQ-020: A secret value MUST NOT appear in a prompt, a runner argument, a thread or a log.
- REQ-021: The assistant panel SHALL follow the interface rules of the constitution.
- REQ-022: Each turn SHALL show a trace of its tool calls: tool, target and elapsed time. The trace SHALL collapse to one line when the turn ends. A person SHALL be able to expand it.
- REQ-023: The panel SHALL show a ring for the share of the context window that the thread uses. The panel SHALL show the quota windows of the account when the runner reports them. The ring and each window SHALL have a text value for assistive tools.
- REQ-024: When a reply asks a follow-up or lists options, the panel SHALL show one button for each option. A click SHALL send that option as the next turn. The person MAY still type a free answer.
- REQ-025: The person SHALL be able to resize the width of the panel. The person SHALL be able to choose the left or the right side for it. The system SHALL keep both settings for each person on this machine.

### Non-Goals

- The factory run engine, workflows and approvals. The `factory` capability owns them.
- The runner, provider and secret adapters. The `connections` capability owns them.
- The Explain action on an entity and its view. The `knowledge` capability owns them.
- A `/` list of ready prompts. The skills of REQ-013 already give the ready actions.
- A selection toolbar (explain, improve, shorten). REQ-006 sends a selected passage as quoted content, and the person types the verb.
- Free chat between agents and a runner on another machine.
- Threads that several people share, and threads in the repository.

### Acceptance Criteria

- [x] The panel opens in every space with a shortcut and keeps the thread and draft when the view changes. Test: `e2e/assistant.spec.ts`.
- [x] Each project has its own threads, and each thread has its own transcript, draft and session. Test: `crates/shipyard-store/tests/threads.rs`.
- [x] A thread is not in the repository. Test: `crates/shipyard-store/tests/threads.rs`.
- [x] The context shows the view, the selected entity and the added refs, and the person can remove each one. Test: `src/features/assistant/assistant.test.tsx`.
- [x] Ask mode changes nothing, plan mode changes no file, and agent mode changes files only in a worktree. Test: `crates/shipyard-agents/tests/assistant_modes.rs`.
- [x] A denied permission shows a wait and one action grants it and resumes the session. Test: `crates/shipyard-agents/tests/assistant_turn.rs`, `src/features/assistant/assistant.test.tsx`.
- [x] A thread keeps its own runner, model and effort, and the turns count in the budgets of the factory. Test: `crates/shipyard-agents/tests/assistant_turn.rs`, `crates/shipyard-engine/tests/assistant_budget.rs`.
- [x] A changed rule applies from the next turn. Test: `crates/shipyard-agents/tests/assistant_rules.rs`.
- [x] Send to factory creates a work item after a confirm, or starts a run of a chosen workflow. Test: `crates/shipyard-app/tests/assistant_send.rs`, `src/features/assistant/assistant.test.tsx`. A run starts through the label and the pickup (REQ-015).
- [x] The Explain answer cites refs that resolve. Test: `crates/shipyard-app/tests/assistant_send.rs`.
- [x] Copy, insert and open a cited ref work on a reply. Test: `src/features/assistant/assistant.test.tsx`.
- [x] A quota failure shows one sentence and a retry that does not replay edits. Test: `crates/shipyard-agents/tests/assistant_turn.rs`, `src/features/assistant/assistant.test.tsx`.
- [x] A turn shows a trace that collapses to one line, and the panel shows a context ring and the quota windows. Test: `src/features/assistant/panel_extras.test.tsx`.
- [x] A reply with options shows one button for each option. Test: `src/features/assistant/panel_extras.test.tsx`.
- [x] The panel keeps its width and side after a restart. Test: `src/features/assistant/panel_extras.test.tsx`.
- [x] A project default sets the runner, model, effort and mode of a new thread. Test: `crates/shipyard-store/tests/assistant_defaults.rs`. No UI edits the defaults yet.
- [x] No prompt, argument, thread or log holds a secret value. Test: `crates/shipyard-agents/tests/assistant_turn.rs`, `crates/shipyard-app/src/assistant.rs` (draft).
- [x] The panel works by keyboard, shows a focus ring and assistive labels, and shows French and English. Test: `src/features/assistant/a11y.test.tsx`.

### Links

- Consumes: `add-connections` REQ-009, REQ-010 and REQ-011 (runners, providers, secrets), REQ-018 (MCP relay), `add-factory` REQ-014, REQ-015, REQ-022 and REQ-035 (runner layer, budgets, roles), `add-refs` REQ-005, REQ-006, REQ-011 and REQ-014 (context, citations, RefChip), `add-extensions` REQ-008 (rules and skills), `add-projects` REQ-010 (overrides), `add-shell` (panel slot).
- Consumes also: `add-work` REQ-029 (one work item from a ref).
- Produces: threads, the Explain answer for `add-knowledge`, work items through `add-work` (REQ-029), runs through the label `wf:<id>` and `add-factory` pickup.

### Feature list

| Feature | Shipyard view | REQ ids |
|---|---|---|
| Assistant drawer (Claude Code, Codex, Copilot, API providers) | Assistant panel in every space | REQ-001, REQ-002, REQ-004, REQ-011, REQ-012 |
| Permission level and the wait for an answer | Assistant panel, agent mode | REQ-009, REQ-010 |
| Reply actions (copy, quote, code block) | Assistant panel, reply | REQ-017 |
| Per-project assistant settings | Settings / Project overrides | REQ-019 |
| Quota failure and retry | Assistant panel, thread | REQ-018 |
| Selected passage sent as quoted content | Assistant panel, context | REQ-006 |
| `/` list of ready prompts; selection toolbar | Non-Goal: skills and quoted content cover them | none |
| Turn trace | Assistant panel, turn | REQ-022 |
| Context ring and quota windows | Assistant panel, header | REQ-023 |
| One-click reply buttons | Assistant panel, reply | REQ-024 |
| Resizable width and side | Assistant panel | REQ-025 |

### Existing References

- `docs/plan/MASTER-PLAN.md` sections 4, 5.8 and 7; `docs/openspec/constitution.md` sections 4 and 6.
- Q-023, Q-024 and Q-053 (budgets, runners, defaults).

### Clarifications

- Q-049 Which permission levels can a person pick in agent mode?: Two levels: edit with approval, and auto inside the worktree. No bypass.
- Q-047 Does an agent-mode thread keep one worktree for all its turns?: One worktree for each thread. It lives until the person discards or sends it.
- Q-024 Which runners ship in the first release?: Claude Code and Codex. The others follow in later changes.
- Q-023 What are the default budgets?: The workflow limit sets the run budget (5 USD in `feature`). No default per day or per member until an admin sets one.
- Q-048 Does a run start from a thread without a ticket?: Create a work item first, then start the run from its claim.

## ADDED Requirements

### Requirement: REQ-001 Panel in every space

The system SHALL show the assistant panel in every space and in Settings. A person SHALL open and close it from a button in the shell and from a keyboard shortcut. The panel SHALL keep its thread and draft when the person changes view.

#### Scenario: Open from a view
- GIVEN the person is in Specs / Changes
- WHEN the person presses the shortcut
- THEN the panel opens and the focus moves to its input

#### Scenario: Change view
- GIVEN a draft in the panel
- WHEN the person opens Work / Board
- THEN the panel keeps the thread and the draft

### Requirement: REQ-002 Threads per project

The system SHALL keep the threads of the assistant for each project. A person SHALL create, rename, switch and delete a thread. Each thread SHALL keep its own transcript, draft, usage and session.

#### Scenario: Two threads
- GIVEN two threads in one project
- WHEN the person switches from one to the other
- THEN each thread shows its own transcript and draft

#### Scenario: Other project
- GIVEN a thread in project A
- WHEN the person opens project B
- THEN the panel lists only the threads of project B

#### Scenario: Delete
- GIVEN a thread
- WHEN the person deletes it and confirms
- THEN the transcript is gone and the other threads stay

### Requirement: REQ-003 Thread storage

The system SHALL store the threads in the app data folder and MUST NOT write them to the repository.

#### Scenario: Threads stay local
- GIVEN a thread with messages
- WHEN the person lists the files of the repository
- THEN no file holds the thread

### Requirement: REQ-004 Context

Each turn SHALL carry a context of the current view, the selected entity and the refs that the person added. The panel SHALL show each item of the context as a RefChip. The person SHALL be able to remove any item before sending.

#### Scenario: Selected entity
- GIVEN the person selected `wi:SHIP-12` in Work / Board
- WHEN the person opens the panel
- THEN the context lists the view and `wi:SHIP-12`

#### Scenario: Remove an item
- GIVEN a context with three items
- WHEN the person removes one
- THEN the next turn carries two items

### Requirement: REQ-005 Add refs

The person SHALL be able to add a ref to the context. The person SHALL type `@` and a ref, or drop a RefChip on the panel. The system SHALL accept only a ref that resolves and SHALL refuse the others with a message.

#### Scenario: Add by typing
- GIVEN an open panel
- WHEN the person types `@spec:factory#REQ-004`
- THEN the ref joins the context as a RefChip

#### Scenario: Unknown ref
- GIVEN an open panel
- WHEN the person adds `wi:NONE-1` which does not resolve
- THEN the system refuses it and the context does not change

### Requirement: REQ-006 Quoted passages and untrusted text

The system SHALL send a selected passage, a ticket text or a file text as quoted content. The prompt SHALL tell the runner that quoted content is data and not an instruction.

#### Scenario: Selected passage
- GIVEN the person selected a paragraph in a document
- WHEN the person sends it to the assistant
- THEN the prompt marks the paragraph as quoted data

### Requirement: REQ-007 Ask mode

In ask mode the assistant SHALL be read only. It SHALL read the project and the refs of the context. It MUST NOT change a file, a ticket or a remote.

#### Scenario: Ask with a write request
- GIVEN a thread in ask mode
- WHEN the person asks the assistant to edit a file
- THEN the assistant answers in text and no file changes

### Requirement: REQ-008 Plan mode

In plan mode the assistant SHALL write a plan as the reply and SHALL change no file. The person SHALL be able to send the plan to the factory or to switch the thread to agent mode.

#### Scenario: Plan reply
- GIVEN a thread in plan mode
- WHEN the person asks for a change
- THEN the reply holds steps and the worktree has no change

### Requirement: REQ-009 Agent mode

In agent mode the assistant SHALL change files only in a worktree of its own. It SHALL use the permission level of the person. Two levels: edit with approval, and auto inside the worktree. No bypass. The worktree SHALL stay apart from the main checkout until the person acts on the result. One worktree for each thread. It lives until the person discards or sends it.

#### Scenario: Agent edit
- GIVEN a thread in agent mode
- WHEN the assistant edits a file
- THEN the change sits in the worktree and the main checkout is unchanged

#### Scenario: Show the diff
- GIVEN an agent turn that changed files
- WHEN the turn ends
- THEN the thread shows the changed files and the diff

### Requirement: REQ-010 Denied permission

When a tool denies the runner a permission, the thread SHALL show that it waits for the person. It SHALL name the permission as the runner gives it. One action SHALL grant exactly that permission and resume the session without a second first request.

#### Scenario: Grant
- GIVEN an agent turn denied a tool
- WHEN the person grants that tool
- THEN the session resumes and the first request is not sent again

#### Scenario: Visible wait
- GIVEN a runner that stopped for a permission
- WHEN the turn ends
- THEN the thread shows the wait and not a finished turn

### Requirement: REQ-011 Runner, model and effort

Each thread SHALL have its own runner, model and effort. The person SHALL choose them from the runners and providers that the connections detect. The list of models and efforts SHALL come from the chosen runner. Claude Code and Codex. The others follow in later changes.

#### Scenario: Choose per thread
- GIVEN two threads
- WHEN the person sets Claude Code on one and Codex on the other
- THEN each thread sends its turns to its own runner

#### Scenario: Choice per runner
- GIVEN a model chosen for Claude Code
- WHEN the person switches the thread to Codex
- THEN the system does not send the Claude Code model to Codex

### Requirement: REQ-012 Same runner layer and budgets

The assistant SHALL use the runner layer of the factory. It SHALL count its tokens and money in the same budgets. At 80 % of a budget the panel SHALL alert. At 100 % the panel SHALL refuse a new turn and say why. The workflow limit sets the run budget (5 USD in `feature`). No default per day or per member until an admin sets one.

#### Scenario: Shared budget
- GIVEN a daily budget of a member
- WHEN the member sends turns in the panel
- THEN Factory / Usage shows those turns in the same total

#### Scenario: Budget spent
- GIVEN a spent budget
- WHEN the person sends a turn
- THEN the panel refuses it and names the budget

### Requirement: REQ-013 Rules and skills

Each turn SHALL load the compass rules and the skills of the project that the extensions capability gives. The system SHALL load a changed rule at the next turn and not in a turn that runs.

#### Scenario: Changed rule
- GIVEN a rule file changed after a turn started
- WHEN the next turn starts
- THEN the next turn uses the new rule

### Requirement: REQ-014 Send to factory as a work item

A person SHALL be able to send a thread to the factory as a work item. The item SHALL hold the summary of the thread and its refs. The system SHALL create the item through `add-work` REQ-029, only after the person confirms it.

#### Scenario: Create the item
- GIVEN a thread with a plan
- WHEN the person chooses Send to factory and confirms the work item
- THEN the tracker holds a new item with the refs of the thread

#### Scenario: Cancel
- GIVEN the confirm step of a work item
- WHEN the person cancels
- THEN no item is created

### Requirement: REQ-015 Send to factory as a run

A person SHALL be able to send a thread to the factory as a run. The person SHALL pick the workflow. The system SHALL set the label `wf:<id>` on the work item of REQ-014. The factory SHALL then claim the item and start the run (`add-factory` REQ-009). The system MUST NOT start a run directly. Create a work item first, then start the run from its claim.

#### Scenario: Start a run
- GIVEN a thread that became a work item
- WHEN the person picks the workflow `feature`
- THEN the item holds the label `wf:feature`
- AND a run appears in Factory / Runs after pickup, with the thread as its brief

### Requirement: REQ-016 Explain answer

The system SHALL answer an Explain request of the knowledge capability in ask mode. The answer SHALL come from the reference graph and SHALL cite refs. It SHALL NOT cite a ref that does not resolve.

#### Scenario: Explain an ADR
- GIVEN the person asks to explain `adr:0005`
- WHEN the answer arrives
- THEN the answer cites refs and each cited ref resolves

#### Scenario: No source
- GIVEN an entity with no linked refs
- WHEN the person asks to explain it
- THEN the answer says that it found no source

### Requirement: REQ-017 Reply actions

Each reply SHALL offer the actions copy, insert and open a cited ref. A cited ref SHALL show as a RefChip. A code block SHALL show its file name and language, and SHALL offer its own copy action.

#### Scenario: Copy
- GIVEN a reply
- WHEN the person chooses copy
- THEN the text of the reply is in the clipboard

#### Scenario: Insert
- GIVEN a text editor with focus in the view
- WHEN the person chooses insert on a reply
- THEN the text lands at the cursor of the editor

#### Scenario: No editor
- GIVEN a view with no text editor
- WHEN the person looks at the reply
- THEN the insert action is off

#### Scenario: Open a ref
- GIVEN a reply that cites `spec:factory#REQ-004`
- WHEN the person clicks the RefChip
- THEN the view of that requirement opens

### Requirement: REQ-018 Failures

The system SHALL tell a quota failure from an error and SHALL say so in one sentence. The person SHALL be able to retry the same turn. A retry MUST NOT repeat a turn that already changed files.

#### Scenario: Quota
- GIVEN a runner that reports no quota
- WHEN the turn fails
- THEN the thread says the quota is out and offers Retry

#### Scenario: Retry after an edit
- GIVEN an agent turn that changed files
- WHEN the person retries
- THEN the system resumes the session and does not replay the first request

### Requirement: REQ-019 Assistant defaults per project

A project SHALL be able to set the default runner, model, effort and mode of new threads. The setting SHALL follow the override rule of the project. A new thread SHALL start with those values.

#### Scenario: Project default
- GIVEN a project that sets Codex as its runner
- WHEN the person opens a new thread
- THEN the thread uses Codex

### Requirement: REQ-020 Secrets

A secret value MUST NOT appear in a prompt, a runner argument, a thread or a log. The system SHALL send a connection to a runner by reference and not by value.

#### Scenario: Secret in context
- GIVEN a token stored in the keychain
- WHEN the person sends a turn
- THEN no prompt, argument, thread or log holds the token

### Requirement: REQ-021 Interface rules

The assistant panel SHALL follow the interface rules of the constitution. It SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. It SHALL have one primary action, a keyboard path, a focus ring, assistive labels, enough contrast and reduced motion. It SHALL show French and English text.

#### Scenario: Keyboard only
- GIVEN the panel is open
- WHEN the person uses only the keyboard
- THEN the person can switch thread, send, and use each reply action

#### Scenario: Reduced motion
- GIVEN the system asks for reduced motion
- WHEN the panel opens
- THEN the panel shows no motion except an active turn

### Requirement: REQ-022 Turn trace

Each turn SHALL show a trace of its tool calls: tool, target and elapsed time. The trace SHALL collapse to one line when the turn ends. A person SHALL be able to expand it.

#### Scenario: Collapse
- GIVEN a turn that ran three tool calls
- WHEN the turn ends
- THEN the trace shows one line and the person can expand it

### Requirement: REQ-023 Context ring and quota

The panel SHALL show a ring for the share of the context window that the thread uses. The panel SHALL show the quota windows of the account when the runner reports them. The ring and each window SHALL have a text value for assistive tools.

#### Scenario: Ring
- GIVEN a thread that uses 60 percent of the context window
- WHEN the person looks at the panel
- THEN the ring shows 60 percent and its text value says 60 percent

### Requirement: REQ-024 Reply buttons

When a reply asks a follow-up or lists options, the panel SHALL show one button for each option. A click SHALL send that option as the next turn. The person MAY still type a free answer.

#### Scenario: Pick an option
- GIVEN a reply that lists two options
- WHEN the person clicks the second button
- THEN the panel sends the text of that option as the next turn

### Requirement: REQ-025 Panel width and side

The person SHALL be able to resize the width of the panel. The person SHALL be able to choose the left or the right side for it. The system SHALL keep both settings for each person on this machine.

#### Scenario: Move the panel
- GIVEN the panel on the right side
- WHEN the person chooses the left side and resizes it
- THEN the panel stays on the left at that width after a restart

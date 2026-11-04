Feature: assistant

  @spec:assistant#REQ-001
  Scenario: Panel in every space: Open from a view
    Given the person is in Specs / Changes
    When the person presses the shortcut
    Then the panel opens and the focus moves to its input

  @spec:assistant#REQ-001
  Scenario: Panel in every space: Change view
    Given a draft in the panel
    When the person opens Work / Board
    Then the panel keeps the thread and the draft

  @spec:assistant#REQ-002
  Scenario: Threads per project: Two threads
    Given two threads in one project
    When the person switches from one to the other
    Then each thread shows its own transcript and draft

  @spec:assistant#REQ-002
  Scenario: Threads per project: Other project
    Given a thread in project A
    When the person opens project B
    Then the panel lists only the threads of project B

  @spec:assistant#REQ-002
  Scenario: Threads per project: Delete
    Given a thread
    When the person deletes it and confirms
    Then the transcript is gone and the other threads stay

  @spec:assistant#REQ-003
  Scenario: Thread storage: Threads stay local
    Given a thread with messages
    When the person lists the files of the repository
    Then no file holds the thread

  @spec:assistant#REQ-004
  Scenario: Context: Selected entity
    Given the person selected `wi:SHIP-12` in Work / Board
    When the person opens the panel
    Then the context lists the view and `wi:SHIP-12`

  @spec:assistant#REQ-004
  Scenario: Context: Remove an item
    Given a context with three items
    When the person removes one
    Then the next turn carries two items

  @spec:assistant#REQ-005
  Scenario: Add refs: Add by typing
    Given an open panel
    When the person types `@spec:factory#REQ-004`
    Then the ref joins the context as a RefChip

  @spec:assistant#REQ-005
  Scenario: Add refs: Unknown ref
    Given an open panel
    When the person adds `wi:NONE-1` which does not resolve
    Then the system refuses it and the context does not change

  @spec:assistant#REQ-006
  Scenario: Quoted passages and untrusted text: Selected passage
    Given the person selected a paragraph in a document
    When the person sends it to the assistant
    Then the prompt marks the paragraph as quoted data

  @spec:assistant#REQ-007
  Scenario: Ask mode: Ask with a write request
    Given a thread in ask mode
    When the person asks the assistant to edit a file
    Then the assistant answers in text and no file changes

  @spec:assistant#REQ-008
  Scenario: Plan mode: Plan reply
    Given a thread in plan mode
    When the person asks for a change
    Then the reply holds steps and the worktree has no change

  @spec:assistant#REQ-009
  Scenario: Agent mode: Agent edit
    Given a thread in agent mode
    When the assistant edits a file
    Then the change sits in the worktree and the main checkout is unchanged

  @spec:assistant#REQ-009
  Scenario: Agent mode: Show the diff
    Given an agent turn that changed files
    When the turn ends
    Then the thread shows the changed files and the diff

  @spec:assistant#REQ-010
  Scenario: Denied permission: Grant
    Given an agent turn denied a tool
    When the person grants that tool
    Then the session resumes and the first request is not sent again

  @spec:assistant#REQ-010
  Scenario: Denied permission: Visible wait
    Given a runner that stopped for a permission
    When the turn ends
    Then the thread shows the wait and not a finished turn

  @spec:assistant#REQ-011
  Scenario: Runner, model and effort: Choose per thread
    Given two threads
    When the person sets Claude Code on one and Codex on the other
    Then each thread sends its turns to its own runner

  @spec:assistant#REQ-011
  Scenario: Runner, model and effort: Choice per runner
    Given a model chosen for Claude Code
    When the person switches the thread to Codex
    Then the system does not send the Claude Code model to Codex

  @spec:assistant#REQ-012
  Scenario: Same runner layer and budgets: Shared budget
    Given a daily budget of a member
    When the member sends turns in the panel
    Then Factory / Usage shows those turns in the same total

  @spec:assistant#REQ-012
  Scenario: Same runner layer and budgets: Budget spent
    Given a spent budget
    When the person sends a turn
    Then the panel refuses it and names the budget

  @spec:assistant#REQ-013
  Scenario: Rules and skills: Changed rule
    Given a rule file changed after a turn started
    When the next turn starts
    Then the next turn uses the new rule

  @spec:assistant#REQ-014
  Scenario: Send to factory as a work item: Create the item
    Given a thread with a plan
    When the person chooses Send to factory and confirms the work item
    Then the issue tracker holds a new item with the refs of the thread

  @spec:assistant#REQ-014
  Scenario: Send to factory as a work item: Cancel
    Given the confirm step of a work item
    When the person cancels
    Then no item is created

  @spec:assistant#REQ-015
  Scenario: Send to factory as a run: Start a run
    Given a thread that became a work item
    When the person picks the workflow `feature`
    Then the item holds the label `wf:feature`
    And a run appears in Factory / Runs after pickup, with the thread as its brief

  @spec:assistant#REQ-016
  Scenario: Explain answer: Explain an ADR
    Given the person asks to explain `adr:0005`
    When the answer arrives
    Then the answer cites refs and each cited ref resolves

  @spec:assistant#REQ-016
  Scenario: Explain answer: No source
    Given an entity with no linked refs
    When the person asks to explain it
    Then the answer says that it found no source

  @spec:assistant#REQ-017
  Scenario: Reply actions: Copy
    Given a reply
    When the person chooses copy
    Then the text of the reply is in the clipboard

  @spec:assistant#REQ-017
  Scenario: Reply actions: Insert
    Given a text editor with focus in the view
    When the person chooses insert on a reply
    Then the text lands at the cursor of the editor

  @spec:assistant#REQ-017
  Scenario: Reply actions: No editor
    Given a view with no text editor
    When the person looks at the reply
    Then the insert action is off

  @spec:assistant#REQ-017
  Scenario: Reply actions: Open a ref
    Given a reply that cites `spec:factory#REQ-004`
    When the person clicks the RefChip
    Then the view of that requirement opens

  @spec:assistant#REQ-018
  Scenario: Failures: Quota
    Given a runner that reports no quota
    When the turn fails
    Then the thread says the quota is out and offers Retry

  @spec:assistant#REQ-018
  Scenario: Failures: Retry after an edit
    Given an agent turn that changed files
    When the person retries
    Then the system resumes the session and does not replay the first request

  @spec:assistant#REQ-019
  Scenario: Assistant defaults per project: Project default
    Given a project that sets Codex as its runner
    When the person opens a new thread
    Then the thread uses Codex

  @spec:assistant#REQ-020
  Scenario: Secrets: Secret in context
    Given a token stored in the keychain
    When the person sends a turn
    Then no prompt, argument, thread or log holds the token

  @spec:assistant#REQ-021
  Scenario: Interface rules: Keyboard only
    Given the panel is open
    When the person uses only the keyboard
    Then the person can switch thread, send, and use each reply action

  @spec:assistant#REQ-021
  Scenario: Interface rules: Reduced motion
    Given the system asks for reduced motion
    When the panel opens
    Then the panel shows no motion except an active turn

  @spec:assistant#REQ-022
  Scenario: Turn trace: Collapse
    Given a turn that ran three tool calls
    When the turn ends
    Then the trace shows one line and the person can expand it

  @spec:assistant#REQ-023
  Scenario: Context ring and quota: Ring
    Given a thread that uses 60 percent of the context window
    When the person looks at the panel
    Then the ring shows 60 percent and its text value says 60 percent

  @spec:assistant#REQ-024
  Scenario: Reply buttons: Pick an option
    Given a reply that lists two options
    When the person clicks the second button
    Then the panel sends the text of that option as the next turn

  @spec:assistant#REQ-025
  Scenario: Panel width and side: Move the panel
    Given the panel on the right side
    When the person chooses the left side and resizes it
    Then the panel stays on the left at that width after a restart

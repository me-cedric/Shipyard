# Spec: questions-loop

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-10-29
Change: `change:add-questions-loop`

### Goal

An agent asks a question with options when a decision belongs to a person. The person answers in the app or on the tracker site. The run resumes with the answer, and a spec-level answer folds into its spec.

### Why

An agent that guesses a decision that belongs to a person produces wrong work. Legacy keeps a RAID register, but no agent can stop, ask and wait. Shipyard needs a loop that works where the person already is.

### Users And Scenarios

- PM: answers scope questions from the Inbox and sees which runs wait.
- Architect: answers design questions that an agent raises against an ADR or a spec.
- Developer: answers a question on a ticket from the tracker site, with no Shipyard window open.
- QA: answers questions about expected behaviour and finds them in Specs / Questions.
- BA: answers requirement questions and folds each answer into the spec.
- Functional lead: approves the comment and the ticket move of a question with one click.
- Junior: reads a closed question to learn why a decision was made.

### Requirements

- REQ-001: The planner SHALL run the `grill-me` skill on the ticket before it plans. Each open high-impact item SHALL become one question. A ticket with none SHALL go on to the plan with no wait.
- REQ-002: Any agent SHALL be able to ask through `ask_question`. The call SHALL carry a question, two to four options and one recommended option. It SHALL also carry a flag for free text and an optional ref of a spec. The system MUST reject any other shape.
- REQ-003: The system SHALL give each question one id Q-NNN and one entity `q:Q-NNN`. The id SHALL be unique in the project. [NEEDS CLARIFICATION: Q-026 How do two machines avoid the same Q-NNN?] Working assumption: Q-026 option 1, the next number after the highest in the register and in the ticket comments.
- REQ-004: When an agent asks, the system SHALL move the run to `WaitingForAnswer` and store its return state. The stall timer and the budget clock SHALL stop, as `factory` REQ-006 states.
- REQ-005: The system SHALL move the ticket to the status that the mapping gives for `WaitingForAnswer`, for example `Needs info`. The move SHALL follow the `tracker_transition` switch.
- REQ-006: The system SHALL post one comment for each question. The comment SHALL hold the marker `<!-- shipyard:q Q-NNN -->`, the question and the options. The options SHALL be numbered from 1, with the recommended one marked. The comment SHALL end with one line that tells how to reply. The system SHALL store the id of each comment that it posts. The post SHALL follow the `tracker_comment` switch. A tracker with no comment capability SHALL get no comment.
- REQ-007: A question that carries the ref of a spec SHALL also create the file `docs/delivery/questions/Q-NNN.md` in the working copy. The file SHALL follow the format of `add-specs` REQ-009 and SHALL hold the question and its options. The system MUST NOT commit the file.
- REQ-008: Home / Inbox SHALL show each open question as a QuestionCard. The card SHALL show the question, the options and the recommended option. It SHALL show a free text field when the question allows it. The card SHALL have one primary action, send the answer. The person SHALL choose an option with the keyboard.
- REQ-009: On each tick the system SHALL look for the first human reply after the marker. A human reply SHALL be a later comment with an id that the system did not store at a post. The system SHALL NOT use the author of a comment to tell a reply from a Shipyard comment.
- REQ-010: The system SHALL read a reply as an option number, an option letter (A is option 1) or `/answer B`. It SHALL read free text when the question allows it. The system SHALL read the forms without case.
- REQ-011: A reply that matches no option and no free text rule SHALL NOT resume the run. The system SHALL show the reply on the card for a decision. [NEEDS CLARIFICATION: Q-027 How does Shipyard treat a reply that is not a clear answer?] Working assumption: Q-027 option 1, the person confirms or chooses on the card.
- REQ-012: The system SHALL read the text of a reply as it stands at the moment of detection. An edit after the run resumed MUST NOT change the answer. The system SHALL log that edit and show a note on the card.
- REQ-013: Each question SHALL have one answer. The first answer in time SHALL win, from the Inbox or from the tracker site. The system SHALL log a later answer without effect.
- REQ-014: A run MAY have several open questions. It SHALL stay in `WaitingForAnswer` until each one has an answer. Its return state SHALL be the state before the first question.
- REQ-015: After an answer, the system SHALL offer the fold preview of a spec-level answer into the Clarifications of its spec. The system SHALL write nothing. After one click, `add-specs` REQ-015 SHALL write the answer.
- REQ-016: With `tracker_comment` or `tracker_transition` off, the comment and the ticket move SHALL be approvals in the Inbox. An answer in the Inbox SHALL still resume the run, and it SHALL also appear on the ticket: the click on the answer is the consent for one comment, so the system SHALL post at once a comment with the marker `<!-- shipyard:a Q-NNN -->` and the chosen option or text, whatever the switch says. The system SHALL store the id of that comment, so that it is never read as a human reply. A question comment that is still an approval SHALL be replaced by one comment that holds the question and the answer. A tracker with no comments SHALL get none, and the run log SHALL say so. [NEEDS CLARIFICATION: Q-002 What is the default for automation writes?] Working assumption: Q-002 option 1, all off.
- REQ-017: The run SHALL return to its return state with the answer in its context. It SHALL resume the CLI session when the runner supports it. Otherwise it SHALL re-brief the agent from the run log. The ticket SHALL move to the status of the return state.
- REQ-018: When the ticket of a question becomes terminal, the system SHALL close each ticket-level question of that run as withdrawn. It SHALL post no comment. A spec-level question SHALL stay open until a person answers it or withdraws it.
- REQ-019: A question that nobody answers SHALL keep its run in `WaitingForAnswer`. The system SHALL remind the person once. [NEEDS CLARIFICATION: Q-028 What happens when nobody answers?] Working assumption: Q-028 option 1, one reminder after 24 h and no timeout.
- REQ-020: A question SHALL be open, answered or withdrawn. The system SHALL show the state and the answer in the card, the inspector and the run log.
- REQ-021: The QuestionCard and the fold preview SHALL follow the interface rules of the constitution. They SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. They SHALL have one primary action, a keyboard path and a focus ring. They SHALL have assistive labels, enough contrast and reduced motion. They SHALL show French and English text.

### Non-Goals

- The run state machine, the stall timer and the budget clock. The `factory` capability owns them.
- Tracker polling and comment fetch. The `sync` capability owns them.
- The adapter that writes a comment or moves a ticket. The `connections` capability owns it.
- The Specs / Questions view and the RAID register. The `specs` capability owns them.
- Risks, assumptions, issues and dependencies that no agent raises. Only questions are in scope.
- A question to many people or a vote. One person answers each question.

### Acceptance Criteria

- [ ] The planner reads the ticket with `grill-me` before any plan, and each open high-impact item becomes a question.
- [ ] A call to `ask_question` with one option or five options is rejected.
- [ ] The run moves to `WaitingForAnswer`, shows its return state, and spends no budget while it waits.
- [ ] With the switches on, the ticket moves to the mapped status and one comment carries the marker and numbered options.
- [ ] A spec-level question creates a RAID file in `docs/delivery/questions/` and the file validates.
- [ ] The Inbox shows a QuestionCard, and the person sends an answer with the keyboard.
- [ ] A reply from the account that Shipyard writes with counts as a reply, and a comment with a stored id does not.
- [ ] A reply on the tracker site is found on the next tick and read as a number, a letter, `/answer B` or free text.
- [ ] A reply that Shipyard cannot read does not resume the run, and the card shows it for a decision.
- [ ] A reply that the person edits before the run resumes gives the edited answer, and an edit after the resume changes nothing and is logged.
- [ ] A run with two open questions resumes only after both have an answer.
- [ ] With `tracker_comment` and `tracker_transition` off, the comment and the move show as approvals, and an answer in the Inbox resumes the run.
- [ ] The run returns to its return state with the answer in context, by CLI session resume or by a re-brief from the run log.
- [ ] A person folds the answer of a spec-level question into the spec after a preview.
- [ ] A ticket that becomes terminal closes its non-spec questions and leaves its spec-level questions open.
- [ ] The question card works with the keyboard, shows a focus ring, has assistive labels and ships in French and English.

### Links

- Consumes: `add-factory` REQ-004, REQ-005, REQ-006, REQ-008, REQ-009, REQ-017, REQ-021, REQ-025 and REQ-026 (states, return state, clocks, mapping, terminal tickets, `ask_question`, run log, switches, approvals), `add-sync` REQ-004 and REQ-011 (terminal tickets, new comments on the tick), `add-connections` REQ-003 (comment and transition capability flags), `add-specs` REQ-009 and REQ-015 (the RAID file format, the register, the fold write), `add-shell` REQ-004 (Inbox), `add-design-system` REQ-005 (QuestionCard, ApprovalBar).
- Produces: `q:` entities, Inbox cards for `add-shell`, answers that resume runs in `add-factory`, folded clarifications in `add-specs`, RAID files that `add-refs` indexes.

### Legacy parity

| Legacy feature | Shipyard view | REQ ids |
|---|---|---|
| Questions (RAID register, one file for each question) | Home / Inbox, Specs / Questions | REQ-003, REQ-007, REQ-008, REQ-020 |
| Fold an answer into `## Clarifications` | Fold action on an answered question | REQ-015 |

### Existing References

- Existing code/docs/specs: `docs/plan/MASTER-PLAN.md` section 5.6; ADR 0008; ADR 0005; Q-002.
- Supersedes or extends: N/A

## ADDED Requirements

### Requirement: REQ-001 Grill first

The planner SHALL run the `grill-me` skill on the ticket before it plans. Each open high-impact item SHALL become one question. A ticket with none SHALL go on to the plan with no wait.

#### Scenario: Open item
- GIVEN a ticket with an unclear scope
- WHEN the planner runs `grill-me`
- THEN it raises one question for the scope item before the plan

#### Scenario: No open item
- GIVEN a ticket with no open high-impact item
- WHEN the planner runs `grill-me`
- THEN the run goes on to the plan with no question

### Requirement: REQ-002 Question input

Any agent SHALL be able to ask through `ask_question`. The call SHALL carry a question, two to four options and one recommended option. It SHALL also carry a flag for free text and an optional ref of a spec. The system MUST reject any other shape.

#### Scenario: Five options
- GIVEN an agent in a step
- WHEN it asks with five options
- THEN the system rejects the call and names the limit

#### Scenario: No recommended
- GIVEN an agent in a step
- WHEN it asks with no recommended option
- THEN the system rejects the call

#### Scenario: Spec ref
- GIVEN an agent in a step
- WHEN it asks with three options and the ref `spec:projects#REQ-003`
- THEN the system accepts the call

### Requirement: REQ-003 Question identity

The system SHALL give each question one id Q-NNN and one entity `q:Q-NNN`. The id SHALL be unique in the project. [NEEDS CLARIFICATION: Q-026 How do two machines avoid the same Q-NNN?] Working assumption: Q-026 option 1, the next number after the highest in the register and in the ticket comments.

#### Scenario: Next id
- GIVEN a register that ends at Q-012
- WHEN an agent asks a question
- THEN the question gets Q-013

#### Scenario: Backlinks
- GIVEN a question `q:Q-013`
- WHEN the person opens it in the inspector
- THEN its run and ticket show in the backlinks

### Requirement: REQ-004 Wait

When an agent asks, the system SHALL move the run to `WaitingForAnswer` and store its return state. The stall timer and the budget clock SHALL stop, as `factory` REQ-006 states.

#### Scenario: Run waits
- GIVEN a run in `Working`
- WHEN an agent asks
- THEN the run shows `WaitingForAnswer` with the return state `Working`

#### Scenario: Clocks stop
- GIVEN a run that waits
- WHEN one hour passes
- THEN the run has no stall and no budget spend

### Requirement: REQ-005 Ticket move

The system SHALL move the ticket to the status that the mapping gives for `WaitingForAnswer`, for example `Needs info`. The move SHALL follow the `tracker_transition` switch.

#### Scenario: Switch on
- GIVEN the switch on and a mapping to `Needs info`
- WHEN a run starts to wait
- THEN the ticket moves to `Needs info`

#### Scenario: Switch off
- GIVEN the switch off
- WHEN a run starts to wait
- THEN the Inbox shows the move as an approval

### Requirement: REQ-006 Ticket comment

The system SHALL post one comment for each question. The comment SHALL hold the marker `<!-- shipyard:q Q-NNN -->`, the question and the options. The options SHALL be numbered from 1, with the recommended one marked. The comment SHALL end with one line that tells how to reply. The system SHALL store the id of each comment that it posts. The post SHALL follow the `tracker_comment` switch. A tracker with no comment capability SHALL get no comment.

#### Scenario: One comment
- GIVEN the switch on
- WHEN a question is asked
- THEN the ticket gets one comment with the marker and numbered options

#### Scenario: No comments on tracker
- GIVEN a tracker with no comment capability
- WHEN a question is asked
- THEN no comment is posted and the person answers in the Inbox

#### Scenario: Stored id
- GIVEN the switch on
- WHEN the system posts the comment
- THEN the system stores the id of that comment

### Requirement: REQ-007 RAID file

A question that carries the ref of a spec SHALL also create the file `docs/delivery/questions/Q-NNN.md` in the working copy. The file SHALL follow the format of `add-specs` REQ-009 and SHALL hold the question and its options. The system MUST NOT commit the file.

#### Scenario: Spec-level
- GIVEN a question with the ref `spec:projects#REQ-003`
- WHEN it is asked
- THEN the file Q-NNN.md exists and its `specRef` holds that ref

#### Scenario: Ticket-level
- GIVEN a question with no spec ref
- WHEN it is asked
- THEN no RAID file is created

### Requirement: REQ-008 Answer in the Inbox

Home / Inbox SHALL show each open question as a QuestionCard. The card SHALL show the question, the options and the recommended option. It SHALL show a free text field when the question allows it. The card SHALL have one primary action, send the answer. The person SHALL choose an option with the keyboard.

#### Scenario: Choose option
- GIVEN a card with three options
- WHEN the person presses 2 and sends
- THEN the answer is option 2

#### Scenario: Free text
- GIVEN a card that allows free text
- WHEN the person types a text and sends
- THEN the answer is that text

### Requirement: REQ-009 Answer on the tracker site

On each tick the system SHALL look for the first human reply after the marker. A human reply SHALL be a later comment with an id that the system did not store at a post. The system SHALL NOT use the author of a comment to tell a reply from a Shipyard comment.

#### Scenario: First reply
- GIVEN a marker and two later comments by people
- WHEN the tick runs
- THEN the first one is the answer candidate

#### Scenario: Own comment
- GIVEN a later comment with an id that the system stored at a post
- WHEN the tick runs
- THEN the system ignores it

#### Scenario: Echo of an answer
- GIVEN a later comment with the marker `<!-- shipyard:a Q-NNN -->` and an id that the system stored at a post
- WHEN the tick runs
- THEN the comment is no reply and the latest question marker stays the same

#### Scenario: Same account
- GIVEN a person who replies with the account that Shipyard writes with
- WHEN the tick runs
- THEN the reply is the answer candidate

### Requirement: REQ-010 Reply forms

The system SHALL read a reply as an option number, an option letter (A is option 1) or `/answer B`. It SHALL read free text when the question allows it. The system SHALL read the forms without case.

#### Scenario: Number
- GIVEN a question with three options
- WHEN the reply is `2`
- THEN the answer is option 2

#### Scenario: Command
- GIVEN a question with three options
- WHEN the reply is `/answer c`
- THEN the answer is option 3

### Requirement: REQ-011 Unclear reply

A reply that matches no option and no free text rule SHALL NOT resume the run. The system SHALL show the reply on the card for a decision. [NEEDS CLARIFICATION: Q-027 How does Shipyard treat a reply that is not a clear answer?] Working assumption: Q-027 option 1, the person confirms or chooses on the card.

#### Scenario: Out of range
- GIVEN a question with three options
- WHEN the reply is `5`
- THEN the run keeps waiting and the card shows the reply

#### Scenario: Confirm
- GIVEN a card that shows an unclear reply
- WHEN the person chooses option 2
- THEN the answer is option 2 and the run resumes

### Requirement: REQ-012 Edited reply

The system SHALL read the text of a reply as it stands at the moment of detection. An edit after the run resumed MUST NOT change the answer. The system SHALL log that edit and show a note on the card.

#### Scenario: Edit before
- GIVEN a reply that the author edits before the tick
- WHEN the tick runs
- THEN the answer is the edited text

#### Scenario: Edit after
- GIVEN a run that already resumed
- WHEN the author edits the reply
- THEN the answer stays and the log holds the edit

### Requirement: REQ-013 One answer

Each question SHALL have one answer. The first answer in time SHALL win, from the Inbox or from the tracker site. The system SHALL log a later answer without effect.

#### Scenario: Inbox first
- GIVEN an answer in the Inbox
- WHEN a tracker reply arrives later
- THEN the Inbox answer stays and the log holds the reply

### Requirement: REQ-014 Several questions

A run MAY have several open questions. It SHALL stay in `WaitingForAnswer` until each one has an answer. Its return state SHALL be the state before the first question.

#### Scenario: Two questions
- GIVEN a run with two open questions
- WHEN one is answered
- THEN the run keeps waiting

#### Scenario: Both answered
- GIVEN a run with two open questions
- WHEN the second is answered
- THEN the run resumes at its return state

### Requirement: REQ-015 Fold

After an answer, the system SHALL offer the fold preview of a spec-level answer into the Clarifications of its spec. The system SHALL write nothing. After one click, `add-specs` REQ-015 SHALL write the answer.

#### Scenario: Preview
- GIVEN an answered spec-level question
- WHEN the person starts the fold
- THEN a preview of the spec change shows and nothing is written

#### Scenario: Confirm
- GIVEN the preview
- WHEN the person confirms
- THEN `add-specs` REQ-015 writes the answer and the marker is gone

### Requirement: REQ-016 Approvals for comment and move

With `tracker_comment` or `tracker_transition` off, the comment and the ticket move SHALL be approvals in the Inbox. An answer in the Inbox SHALL still resume the run. [NEEDS CLARIFICATION: Q-002 What is the default for automation writes?] Working assumption: Q-002 option 1, all off.

#### Scenario: Answer first
- GIVEN an unsent question comment approval and an answer in the Inbox
- WHEN the person sends the answer
- THEN the run resumes, the approval is gone, and one comment with the answer marker, the question and the answer is on the ticket

#### Scenario: Answer after the question comment
- GIVEN a question comment on the ticket and an answer in the Inbox
- WHEN the person sends the answer
- THEN one comment with the marker `<!-- shipyard:a Q-NNN -->` and the chosen option goes out at once, and the next tick does not read it as a reply

#### Scenario: No comments
- GIVEN a tracker that has no comments
- WHEN the person answers in the Inbox
- THEN the run resumes, no comment goes out, and the run log notes that the answer is not on the ticket

### Requirement: REQ-017 Resume

The run SHALL return to its return state with the answer in its context. It SHALL resume the CLI session when the runner supports it. Otherwise it SHALL re-brief the agent from the run log. The ticket SHALL move to the status of the return state.

#### Scenario: Session resume
- GIVEN a runner that supports resume
- WHEN the answer arrives
- THEN the same session continues with the answer

#### Scenario: Re-brief
- GIVEN a runner that does not support resume
- WHEN the answer arrives
- THEN a new session starts with a brief from the run log and the answer

#### Scenario: Restart
- GIVEN an open question and the app restarts (`factory` REQ-039)
- WHEN the answer arrives
- THEN the question is still open and still a marker, and the run resumes with the answer and posts no second comment

### Requirement: REQ-018 Ticket became terminal

When the ticket of a question becomes terminal, the system SHALL close each ticket-level question of that run as withdrawn. It SHALL post no comment. A spec-level question SHALL stay open until a person answers it or withdraws it.

#### Scenario: Ticket closed
- GIVEN a run that waits and a ticket that a tick shows as done
- WHEN the tick runs
- THEN the run is `Cancelled`, the question is withdrawn and the card leaves the Inbox

#### Scenario: Spec-level
- GIVEN a spec-level question on that ticket
- WHEN the tick runs
- THEN the question stays open

### Requirement: REQ-019 Unanswered question

A question that nobody answers SHALL keep its run in `WaitingForAnswer`. The system SHALL remind the person once. [NEEDS CLARIFICATION: Q-028 What happens when nobody answers?] Working assumption: Q-028 option 1, one reminder after 24 h and no timeout.

#### Scenario: Reminder
- GIVEN a question open for 24 h
- WHEN the time passes
- THEN one notification reminds the person and the run keeps waiting

### Requirement: REQ-020 Question states

A question SHALL be open, answered or withdrawn. The system SHALL show the state and the answer in the card, the inspector and the run log.

#### Scenario: Answered
- GIVEN an answered question
- WHEN the person opens it
- THEN it shows the answer, who answered and when

### Requirement: REQ-021 Interface rules

The QuestionCard and the fold preview SHALL follow the interface rules of the constitution. They SHALL use icon and noun labels, with no tagline, no helper text and no secondary label. They SHALL have one primary action, a keyboard path and a focus ring. They SHALL have assistive labels, enough contrast and reduced motion. They SHALL show French and English text.

#### Scenario: Keyboard
- GIVEN a QuestionCard
- WHEN the person uses only the keyboard
- THEN they choose, send and see the focus ring

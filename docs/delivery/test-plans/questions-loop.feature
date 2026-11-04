Feature: questions-loop

  @spec:questions-loop#REQ-001
  Scenario: Grill first: Open item
    Given a ticket with an unclear scope
    When the planner runs `grill-me`
    Then it raises one question for the scope item before the plan

  @spec:questions-loop#REQ-001
  Scenario: Grill first: No open item
    Given a ticket with no open high-impact item
    When the planner runs `grill-me`
    Then the run goes on to the plan with no question

  @spec:questions-loop#REQ-002
  Scenario: Question input: Five options
    Given an agent in a step
    When it asks with five options
    Then the system rejects the call and names the limit

  @spec:questions-loop#REQ-002
  Scenario: Question input: No recommended
    Given an agent in a step
    When it asks with no recommended option
    Then the system rejects the call

  @spec:questions-loop#REQ-002
  Scenario: Question input: Spec ref
    Given an agent in a step
    When it asks with three options and the ref `spec:projects#REQ-003`
    Then the system accepts the call

  @spec:questions-loop#REQ-003
  Scenario: Question identity: Next id
    Given a register that ends at Q-012
    When an agent asks a question
    Then the question gets Q-013

  @spec:questions-loop#REQ-003
  Scenario: Question identity: Backlinks
    Given a question `q:Q-013`
    When the person opens it in the inspector
    Then its run and ticket show in the backlinks

  @spec:questions-loop#REQ-004
  Scenario: Wait: Run waits
    Given a run in `Working`
    When an agent asks
    Then the run shows `WaitingForAnswer` with the return state `Working`

  @spec:questions-loop#REQ-004
  Scenario: Wait: Clocks stop
    Given a run that waits
    When one hour passes
    Then the run has no stall and no budget spend

  @spec:questions-loop#REQ-005
  Scenario: Ticket move: Switch on
    Given the switch on and a mapping to `Needs info`
    When a run starts to wait
    Then the ticket moves to `Needs info`

  @spec:questions-loop#REQ-005
  Scenario: Ticket move: Switch off
    Given the switch off
    When a run starts to wait
    Then the Inbox shows the move as an approval

  @spec:questions-loop#REQ-006
  Scenario: Ticket comment: One comment
    Given the switch on
    When a question is asked
    Then the ticket gets one comment with the marker and numbered options

  @spec:questions-loop#REQ-006
  Scenario: Ticket comment: No comments on issue tracker
    Given an issue tracker with no comment capability
    When a question is asked
    Then no comment is posted and the person answers in the Inbox

  @spec:questions-loop#REQ-006
  Scenario: Ticket comment: Stored id
    Given the switch on
    When the system posts the comment
    Then the system stores the id of that comment

  @spec:questions-loop#REQ-007
  Scenario: RAID file: Spec-level
    Given a question with the ref `spec:projects#REQ-003`
    When it is asked
    Then the file Q-NNN.md exists and its `specRef` holds that ref

  @spec:questions-loop#REQ-007
  Scenario: RAID file: Ticket-level
    Given a question with no spec ref
    When it is asked
    Then no RAID file is created

  @spec:questions-loop#REQ-008
  Scenario: Answer in the Inbox: Choose option
    Given a card with three options
    When the person presses 2 and sends
    Then the answer is option 2

  @spec:questions-loop#REQ-008
  Scenario: Answer in the Inbox: Free text
    Given a card that allows free text
    When the person types a text and sends
    Then the answer is that text

  @spec:questions-loop#REQ-009
  Scenario: Answer on the issue tracker site: First reply
    Given a marker and two later comments by people
    When the tick runs
    Then the first one is the answer candidate

  @spec:questions-loop#REQ-009
  Scenario: Answer on the issue tracker site: Own comment
    Given a later comment with an id that the system stored at a post
    When the tick runs
    Then the system ignores it

  @spec:questions-loop#REQ-009
  Scenario: Answer on the issue tracker site: Echo of an answer
    Given a later comment with the marker `<!-- shipyard:a Q-NNN -->` and an id that the system stored at a post
    When the tick runs
    Then the comment is no reply and the latest question marker stays the same

  @spec:questions-loop#REQ-009
  Scenario: Answer on the issue tracker site: Same account
    Given a person who replies with the account that Shipyard writes with
    When the tick runs
    Then the reply is the answer candidate

  @spec:questions-loop#REQ-010
  Scenario: Reply forms: Number
    Given a question with three options
    When the reply is `2`
    Then the answer is option 2

  @spec:questions-loop#REQ-010
  Scenario: Reply forms: Command
    Given a question with three options
    When the reply is `/answer c`
    Then the answer is option 3

  @spec:questions-loop#REQ-011
  Scenario: Unclear reply: Out of range
    Given a question with three options
    When the reply is `5`
    Then the run keeps waiting and the card shows the reply

  @spec:questions-loop#REQ-011
  Scenario: Unclear reply: Confirm
    Given a card that shows an unclear reply
    When the person chooses option 2
    Then the answer is option 2 and the run resumes

  @spec:questions-loop#REQ-012
  Scenario: Edited reply: Edit before
    Given a reply that the author edits before the tick
    When the tick runs
    Then the answer is the edited text

  @spec:questions-loop#REQ-012
  Scenario: Edited reply: Edit after
    Given a run that already resumed
    When the author edits the reply
    Then the answer stays and the log holds the edit

  @spec:questions-loop#REQ-013
  Scenario: One answer: Inbox first
    Given an answer in the Inbox
    When an issue tracker reply arrives later
    Then the Inbox answer stays and the log holds the reply

  @spec:questions-loop#REQ-014
  Scenario: Several questions: Two questions
    Given a run with two open questions
    When one is answered
    Then the run keeps waiting

  @spec:questions-loop#REQ-014
  Scenario: Several questions: Both answered
    Given a run with two open questions
    When the second is answered
    Then the run resumes at its return state

  @spec:questions-loop#REQ-015
  Scenario: Fold: Preview
    Given an answered spec-level question
    When the person starts the fold
    Then a preview of the spec change shows and nothing is written

  @spec:questions-loop#REQ-015
  Scenario: Fold: Confirm
    Given the preview
    When the person confirms
    Then `add-specs` REQ-015 writes the answer and the marker is gone

  @spec:questions-loop#REQ-016
  Scenario: Approvals for comment and move: Answer first
    Given an unsent question comment approval and an answer in the Inbox
    When the person sends the answer
    Then the run resumes, the approval is gone, and one comment with the answer marker, the question and the answer is on the ticket

  @spec:questions-loop#REQ-016
  Scenario: Approvals for comment and move: Answer after the question comment
    Given a question comment on the ticket and an answer in the Inbox
    When the person sends the answer
    Then one comment with the marker `<!-- shipyard:a Q-NNN -->` and the chosen option goes out at once, and the next tick does not read it as a reply

  @spec:questions-loop#REQ-016
  Scenario: Approvals for comment and move: No comments
    Given an issue tracker that has no comments
    When the person answers in the Inbox
    Then the run resumes, no comment goes out, and the run log notes that the answer is not on the ticket

  @spec:questions-loop#REQ-017
  Scenario: Resume: Session resume
    Given a runner that supports resume
    When the answer arrives
    Then the same session continues with the answer

  @spec:questions-loop#REQ-017
  Scenario: Resume: Re-brief
    Given a runner that does not support resume
    When the answer arrives
    Then a new session starts with a brief from the run log and the answer

  @spec:questions-loop#REQ-017
  Scenario: Resume: Restart
    Given an open question and the app restarts (`factory` REQ-039)
    When the answer arrives
    Then the question is still open and still a marker, and the run resumes with the answer and posts no second comment

  @spec:questions-loop#REQ-018
  Scenario: Ticket became terminal: Ticket closed
    Given a run that waits and a ticket that a tick shows as done
    When the tick runs
    Then the run is `Cancelled`, the question is withdrawn and the card leaves the Inbox

  @spec:questions-loop#REQ-018
  Scenario: Ticket became terminal: Spec-level
    Given a spec-level question on that ticket
    When the tick runs
    Then the question stays open

  @spec:questions-loop#REQ-019
  Scenario: Unanswered question: Reminder
    Given a question open for 24 h
    When the time passes
    Then one notification reminds the person and the run keeps waiting

  @spec:questions-loop#REQ-020
  Scenario: Question states: Answered
    Given an answered question
    When the person opens it
    Then it shows the answer, who answered and when

  @spec:questions-loop#REQ-021
  Scenario: Interface rules: Keyboard
    Given a QuestionCard
    When the person uses only the keyboard
    Then they choose, send and see the focus ring

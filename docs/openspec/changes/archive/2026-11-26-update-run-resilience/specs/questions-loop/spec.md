# Spec: questions-loop (delta of update-run-resilience)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:update-run-resilience`

### Goal

A question with no answer does not hold its run forever. A reply on the ticket after a stop report moves the run on.

### Why

A question with no answer keeps its run in `WaitingForAnswer` with no end (Q-028). A run that stops tells the person to reply on the ticket, and the sync must read that reply.

### Users And Scenarios

- PO: gets a reminder on the ticket after one day, and the run escalates after three days.
- Developer: replies on the ticket to a stop report, and the run gets one more round.

### Requirements

- REQ-019: One reminder on the ticket after 24 h, an escalation after 72 h. Both in `.shipyard/automation.yaml`.
- REQ-022: The first reply of a team member after a stop report unblocks its run with the reply as the message. A reply of a person who is not a member does not unblock it.

### Non-Goals

- An answer by Shipyard to its own question.
- A change of the reply forms.

### Acceptance Criteria

- [ ] A question open for 72 h moves its run to `Blocked` with the cause no answer, and the question stays open.
- [ ] A reply on the ticket after a stop report unblocks the run with the reply.

### Existing References

- Existing code/docs/specs: `crates/shipyard-engine/src/questions.rs`, `adr:0022`.
- Supersedes or extends: `spec:questions-loop`. Questions: Q-028.

## MODIFIED Requirements

### Requirement: REQ-019 Unanswered question

A question that nobody answers SHALL keep its run in `WaitingForAnswer` with the clocks stopped. After `remind_after_h` (default 24), the system SHALL remind once: one notification, and one ticket comment under the `tracker_comment` switch. After `escalate_after_h` (default 72), the run SHALL escalate with the cause no answer (`factory` REQ-053), and the question SHALL stay open. Both values SHALL come from the `questions` block of `.shipyard/automation.yaml`.

#### Scenario: Reminder
- GIVEN a question open for 24 h and `tracker_comment` on
- WHEN the time passes
- THEN one notification and one ticket comment remind the person, and the run keeps waiting

#### Scenario: Escalation
- GIVEN a question open for 72 h
- WHEN the time passes
- THEN the run moves to `Blocked` with the cause no answer, and the question stays open

#### Scenario: Late answer
- GIVEN a run blocked with the cause no answer
- WHEN the person answers the question
- THEN the run returns to its return state with the answer

## ADDED Requirements

### Requirement: REQ-022 Reply to a stop report

The first reply of a team member after a stop report marker (`factory` REQ-058) SHALL unblock its run, with the reply as the message of the person. A member is a person that `team-rights` finds, or any person while the team names no admin. A reply SHALL follow the rule of REQ-009. The reply SHALL reach the agents in an `<untrusted-data>` block (`factory` REQ-043). A reply SHALL NOT resume a run in `Paused`.

#### Scenario: Reply unblocks
- GIVEN a run blocked with a stop report on the ticket
- WHEN a person replies "Use the v2 endpoint" and a tick runs
- THEN the run leaves `Blocked`, and the next brief holds the reply in an `<untrusted-data>` block

#### Scenario: Not a member
- GIVEN a team with an admin and a stop report on a public issue
- WHEN a person who is not a member replies
- THEN the run stays in `Blocked` and the run log notes the reply

#### Scenario: Own comment
- GIVEN a stop report and a later comment with an id that the system stored at a post
- WHEN a tick runs
- THEN the run stays in `Blocked`

#### Scenario: Paused run
- GIVEN a run in `Paused` for the member budget with a stop report on the ticket
- WHEN a person replies on the ticket
- THEN the run stays in `Paused` and the run log notes the reply

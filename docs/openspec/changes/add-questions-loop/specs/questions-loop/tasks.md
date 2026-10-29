# Tasks: questions-loop

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.
- `[P]` means parallel-safe: no shared files or ordering dependency.
- Every task names the file or command it touches.

## Tasks

- [x] T001 Write reply parser tests in `crates/shipyard-core/tests/reply_parser.rs`. Covers REQ-010, REQ-011, REQ-012.
- [x] T002 Implement the reply parser and the question states in `crates/shipyard-core/src/question.rs`. Covers REQ-010, REQ-011, REQ-012, REQ-020.
- [x] T003 Write RAID file codec tests in `crates/shipyard-store/tests/raid_question.rs`. Covers REQ-003, REQ-007.
- [x] T004 Implement the RAID file codec and id allocation in `crates/shipyard-store/src/raid.rs`. Covers REQ-003, REQ-007.
- [ ] T005 Write engine tests with a fake tracker in `crates/shipyard-engine/tests/questions.rs`. Covers REQ-001, REQ-002, REQ-004, REQ-005, REQ-006, REQ-009, REQ-013, REQ-014, REQ-016, REQ-017, REQ-018, REQ-019.
- [ ] T006 Implement validation of `ask_question`, the wait, the ticket move and the comment in `crates/shipyard-engine/src/questions.rs`. Covers REQ-002, REQ-004, REQ-005, REQ-006, REQ-016.
- [ ] T007 Implement detection, the one-answer rule, the edit rule and the unclear reply in `crates/shipyard-engine/src/answers.rs`. Covers REQ-009, REQ-011, REQ-012, REQ-013.
- [ ] T008 Implement resume, several open questions, the terminal ticket rule and the reminder in `crates/shipyard-engine/src/resume.rs`. Covers REQ-001, REQ-014, REQ-017, REQ-018, REQ-019.
- [x] T009 Write fold preview tests in `crates/shipyard-store/tests/fold.rs`. Covers REQ-015.
- [x] T010 Implement the fold preview in `crates/shipyard-store/src/fold.rs`. Covers REQ-015.
- [ ] T011 Add the IPC commands and events in `crates/shipyard-app/src/questions.rs`, then regenerate the bindings with the project command. Covers REQ-008, REQ-011, REQ-015, REQ-020.
- [ ] T012 Write view tests in `src/features/home/inbox/question-card.test.tsx`. Covers REQ-008, REQ-011, REQ-015, REQ-021.
- [ ] T013 Implement the QuestionCard and the fold preview in `src/features/home/inbox/`. Covers REQ-008, REQ-011, REQ-015, REQ-020, REQ-021.
- [ ] T014 [P] Add French and English keys in `src/i18n/` for `questions`. Covers REQ-021.
- [ ] T015 Write the end-to-end test in `e2e/questions-loop.spec.ts`. Covers REQ-004, REQ-008, REQ-009, REQ-017.
- [ ] T016 [P] Add one entry to `CHANGELOG.md` and `CHANGELOG.fr.md`.
- [ ] T017 Run the validation commands from `plan.md`.
- [ ] T018 Compare the code with `spec.md` and update stale artifacts.

## Completion Check

- [ ] All acceptance criteria are met.
- [ ] Required validation passed or failures are marked pre-existing.
- [ ] Specs, docs, and code agree.

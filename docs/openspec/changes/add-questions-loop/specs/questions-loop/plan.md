# Plan: questions-loop

Spec: [spec.md](./spec.md)
Date: 2026-10-29

## Summary

Reply parsing and the question state are pure code in `shipyard-core`. The engine in `shipyard-engine` posts the comment, reads replies on the tick and resumes the run. The RAID codec is in `shipyard-store`. The Inbox card is in `src/features/home/inbox/`. This covers REQ-001 to REQ-021.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Rust workspace and React 19 (MASTER-PLAN 7.1, 7.3). |
| Dependencies | No new dependency. Reuse the engine, the store and the `Tracker` trait. |
| Data/storage | Questions and answers in the run log of the app data folder. A RAID file `docs/delivery/questions/Q-NNN.md` for a spec-level question. |
| APIs/contracts | IPC commands `question_answer`, `question_confirm_reply`, `question_fold_preview`, `questions_list`. `add-specs` owns the fold write (`specs_fold`). Events for a new question and a new answer. Bindings are generated. |
| Reply parser | A pure function in `shipyard-core` (`question::parse_reply`). It takes the reply text, the option count and the free text flag. It returns an option, a free text, or unclear. A number or a letter out of range is unclear, also when free text is allowed. `/answer` followed by other text is free text. `question::Question` holds the state, the first answer, the last unclear reply and the edit note. |
| Marker | `<!-- shipyard:q Q-NNN -->` anywhere in the comment. This is the canonical form that the code writes and reads. GitHub and GitLab keep it as it is (the page hides it). Jira, Azure DevOps and Linear store it as the plain token `(shipyard:q Q-NNN)`, because their stores rewrite or drop an HTML comment. The adapter maps both ways (`shipyard_trackers::marker`), so the engine sees the canonical form only. |
| Id allocation | `raid::next_id(files, taken)`: next number after the highest in the RAID folder (the higher of the file name and the `id` key) and in `taken`, the ids of the ticket comments. `raid::create` writes with `create_new`, so it never overwrites, and it allocates again when two writers clash. No function deletes a file. Q-026 stays open. |
| Detection | The sync tick hands each new comment to the engine (`sync` REQ-011) with the question of the latest posted marker before it (`pickup::answers`). A posted comment id goes to `Mirror::question_posted`, so the author is never used (REQ-009). The first reply answers; a later one is a `late` event. An unclear reply posts the question again once (same marker), then the card decides. The tick sends no edit event: the app calls `Factory::comment_edited` when it sees one. |
| Resume | The run goes back to its return state when no question is open. The agents of a run stop when it waits and keep their CLI session (`Event::Session`). With a session, the agent resumes with the answers only. Without one, it gets the full brief again with the answers. One engine file: `crates/shipyard-engine/src/questions.rs`. The id is the next one after the register and the questions of the project in this factory (comment ids of another machine are not read). |
| Fold | `fold::fold_preview(spec, item)` is pure. It returns the edits (old line, removed lines, added lines) and the whole text after. It replaces the marker `[NEEDS CLARIFICATION: Q-NNN ...]` and its working assumption with the answer, and adds `- Q: ... -> A: ...` under `### Clarifications` at the end of `## Purpose`. `specs` REQ-015 writes that text after a click. No commit. |
| Risks | A wrong reading resumes with a wrong answer. Unclear replies never resume (Q-027). Two machines pick the same id (Q-026). Q-002 and Q-028 stay open. |

## Affected Surfaces

- Code: `crates/shipyard-core` (reply parser, question state), `crates/shipyard-store` (RAID codec), `crates/shipyard-engine` (wait, comment, detect, resume, terminal ticket), `crates/shipyard-app` (commands), `src/features/home/inbox/`.
- Tests: `crates/*/tests`, `src/features/home/inbox/*.test.tsx`, `e2e/questions-loop.spec.ts`.
- Docs/specs: `docs/openspec/changes/add-questions-loop/`, ADR 0008, `CHANGELOG.md`, `CHANGELOG.fr.md`, Q-002, Q-026, Q-027, Q-028.

## Approach

1. Write the reply parser and the question states in `shipyard-core`, with tests.
2. Add the RAID file codec in `shipyard-store`.
3. Add the wait: `ask_question` validation, id, state change, return state.
4. Add the ticket move and the comment as engine writes behind the switches.
5. Add detection on the tick, the one-answer rule, the edit rule and the unclear reply.
6. Add the resume, with session resume or a re-brief.
7. Add the terminal ticket rule and the reminder.
8. Add the fold preview.
9. Build the QuestionCard and the fold preview. Add French and English keys.

## Validation

```bash
cargo test -p shipyard-core
cargo test -p shipyard-store
cargo test -p shipyard-engine
pnpm vitest run src/features/home
pnpm playwright test e2e/questions-loop.spec.ts
cd docs && npx -y @fission-ai/openspec@latest validate add-questions-loop --strict
```

## Docs And Spec Sync

- [ ] Spec still matches intended behavior.
- [ ] Module/project README updated if behavior or setup changed.
- [ ] API contracts updated if endpoints, payloads, or status codes changed.
- [ ] Env examples updated if config changed.

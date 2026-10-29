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
| APIs/contracts | IPC commands `question_answer`, `question_confirm_reply`, `question_fold_preview`, `question_fold_apply`, `questions_list`. Events for a new question and a new answer. Bindings are generated. |
| Reply parser | A pure function in `shipyard-core`. It takes the reply text, the option count and the free text flag. It returns an option, a free text, or unclear. |
| Marker | `<!-- shipyard:q Q-NNN -->` on the first line of the comment. Reading finds it by exact match. |
| Id allocation | Next number after the highest in the RAID folder and in the comments of the ticket. Q-026 stays open. |
| Detection | The sync tick hands each new comment to the engine (`sync` REQ-011). The engine keeps the first human comment after the marker. The Shipyard account is known from the connection. |
| Resume | The runner reports whether it supports session resume. If yes, resume with the answer. If no, build a brief from the run log. |
| Fold | A text edit of the spec file in the working copy. The preview is a diff. The write follows a click. No commit. |
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
8. Add the fold preview and the fold write.
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

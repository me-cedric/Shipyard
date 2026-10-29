# add-questions-loop

## Why

An agent that guesses a decision that belongs to a person produces wrong work. Legacy keeps a RAID register, but no agent can stop, ask and wait.
Shipyard needs a loop where an agent asks a question with options, the person answers in the app or on the tracker site, and the run resumes with the answer.

## What Changes

- Add the `grill-me` step: the planner reads the ticket first, and each open high-impact item becomes a question.
- Add `ask_question`: a question, two to four options, a recommended option, and free text allowed.
- Add the wait: the run moves to `WaitingForAnswer` and stores its return state. The ticket moves to the mapped status (for example `Needs info`). The stall timer and the budget clock stop.
- Add the ticket comment: one comment with the marker `<!-- shipyard:q Q-NNN -->` and numbered options. A spec-level question also gets a RAID file in `docs/delivery/questions/`.
- Add the answer in Home / Inbox with `QuestionCard`, and on the tracker site.
- Add answer detection on the next tick: the first human reply after the marker, read as an option number, a letter, `/answer B`, or free text.
- Add the resume: the run returns to its return state with the answer in context. It resumes the CLI session when the CLI supports it, else it re-briefs from the run log.
- Add the fold of an answer into the spec that raised it.

## Impact

- Affected capability: `questions-loop`
- Consumes: `factory` (the `ask_question` tool, run states, resume), `sync` (new comments on the tick), `connections` (tracker comment write), `specs` (the RAID register and the spec to fold into).
- Produces: `q:` entities, Inbox cards for `shell`, answers that resume runs in `factory`, folded clarifications in `specs`.
- Legacy parity: Questions (RAID register, fold into `## Clarifications`).
- Affected code/docs: `crates/shipyard-engine`, `crates/shipyard-store` (RAID codec), `src/features/home/inbox/`, ADR 0008.

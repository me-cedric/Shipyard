# add-agent-pr-actions

## Why

Today an agent reviews a pull request only inside a run. A person who opens a pull request by hand, or who gets one from a teammate, cannot ask an agent for a review. A person who opens a pull request must also write its title and body alone. The project rules (the agent-compass `review` and `pr-flow` skills and the `reviewer` role) already say how to do both.

## What Changes

- The pull request page gets "Review with an agent". An agent reviews the pull request in a fresh context and follows the project's review rules. The person sees the draft review and posts it with one click.
- The new pull request form gets "Write with an agent". An agent writes the title and the body from the branch, the ticket and the spec, and follows the project's pull request rules. The person edits it and opens the pull request.
- A project setting turns on an automatic agent review for each new pull request and each new push to it: off, draft (the person posts), or post (the agent posts, as a comment review only).

## Impact

- Affected capability: `code`
- Affected code/docs: `crates/shipyard-app/src/code.rs`, `crates/shipyard-engine/src/review.rs`, `crates/shipyard-core/src/pickup.rs`, `src/features/code/pull-requests.tsx`, `docs/guide/code.md`

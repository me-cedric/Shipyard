# add-delivery

## Why

Agent work has value only when it is reviewed, merged and closed on the tracker. The earlier tool lists pull requests, but no run takes a change from a worktree to a merged pull request and a closed ticket.
Shipyard needs the last part of the loop: a fresh-context review, a pull request that follows the team rules, feedback from CI and reviewers, and the close.

## What Changes

- Add `SelfReview`: the `reviewer` role in a fresh context runs the compass `review` skill (spec and standards). Two fix rounds at most.
- Add the pull request per the compass `pr-flow` rules: branch `<type>/<area>/<kebab>`, a conventional commit, a body with an opening paragraph, the gate result and one item per ticket, existing labels only, no AI attribution.
- Add the `push` and `pull_request` writes behind the factory switches. Without a switch, the write waits as an approval in Home / Inbox.
- Add CI and review feedback: a CI failure or a review comment moves the run from `PROpen` to `ChangesRequested`, then back to `Working` in the same worktree.
- Add merge detection on the tick: the run goes to `Merged`, then `Done`. Shipyard moves the ticket, posts the run summary, and removes the worktree.
- Add the "In review" and "Ready to merge" lanes data for Factory / Runs.

## Impact

- Affected capability: `delivery`
- Consumes: `factory` (the run, its worktree, the write switches), `sync` (pull request, CI and merge events), `connections` (Forge adapter), `code` (git push and branch operations), `extensions` (compass `review` and `pr-flow` skills).
- Produces: `pr:` entities, ticket transitions to the terminal status, the run summary comment, CI feedback to `factory`, pull request links for `code` and `refs`.
- Feature list: Pull requests (open, comment, approve, request changes, merge), Impacts digest attached to a pull request.
- Affected code/docs: `crates/shipyard-engine`, `crates/shipyard-forges`, `crates/shipyard-git`, `src/features/factory/`.

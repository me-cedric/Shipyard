# add-assistant

## Why

People ask questions about the project and want small changes done without a full run. The earlier tool has an assistant drawer for Claude Code, Codex, Copilot and API providers, but it uses a different runner from the delegation and it does not know the project graph.
Shipyard needs one assistant panel, available in every space, that uses the same runners as the factory and takes refs as context.

## What Changes

- Add the assistant panel, open from any space, with threads per project.
- Add the context: the current view, the selected entity, and refs that the person adds.
- Add modes: ask (read only), plan (writes a plan, no file change), and agent (file changes in a worktree with the permission level of the person).
- Add the runner choice per thread: Claude Code, Codex, GitHub Copilot, Gemini CLI, OpenCode, or an HTTP model provider, with model and effort.
- Add "Send to factory": a thread becomes a work item through `work`. A `wf:<id>` label on it starts a run at pickup.
- Add the turn trace, the context ring with the quota windows, one-click reply buttons, and a resizable panel on either side.
- Add the Explain answer for `knowledge`.
- Add the answer actions on a reply: copy, insert, open the cited ref.

## Impact

- Affected capability: `assistant`
- Consumes: `connections` (runners and providers), `factory` (the runner layer and the budgets), `refs` (context and citations), `extensions` (skills and rules).
- Produces: threads, the Explain answer for `knowledge`, work items through `work`, runs through the `wf:<id>` label and `factory` pickup.
- Feature list: Assistant drawer (Claude Code, Codex, Copilot, API providers), the reply actions, the per-project assistant settings.
- Affected code/docs: `crates/shipyard-agents`, `src/features/assistant/`.

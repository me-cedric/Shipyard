# Smooth runs

## Why

The owner ran the feature workflow on me-cedric/Shipyard#1 (2026-11-05). The run moved to `Failed` in the plan step with no reason on screen: it reached the 40 turns of the whole run. The run showed 0 tokens after 41 turns, because Claude Code reports usage only at the end of a run. Each ticket status, label and comment waited for a click.

## What Changes

- A workflow has no turn limit unless it sets `max_turns` (the templates set none). A run at its max turns moves to `Paused`, not `Failed`. A resume gives it one more set of max turns (`factory` REQ-004, REQ-023).
- The four write switches are on by default. A force push and a merge still wait for a person (`factory` REQ-025, `q:Q-002` revised).
- Claude Code counts one turn per model message and reports the tokens of each message at once.
- The run detail shows why a run failed, paused or is blocked, and the one action that moves it on.

## Impact

- Affected capability: `factory`.
- Affected code: `crates/shipyard-engine/src/run_engine.rs`, `feedback.rs`, `crates/shipyard-core/src/pickup.rs`, `crates/shipyard-agents/src/runner/claude.rs`, `src/features/factory/runs/`, `.shipyard/automation.yaml`.

## Also

- Run on a ticket with no assignee assigns it to the person who clicked, with their own account of the issue tracker (`me`). It is the person's click, so `work` REQ-006 (the system never assigns by itself) still holds. A failure leaves the run as it is.

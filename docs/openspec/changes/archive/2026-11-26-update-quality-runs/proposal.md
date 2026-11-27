# Quality runs

## Why

The owner ran the checks and scanners of Code / Quality on the Shipyard repository (2026-11-05). A click on Run shows no sign that the run works, no time and no output, and the run cannot move to the terminal. Four items failed for causes in Shipyard itself: the YAML that Shipyard writes breaks the Biome format, the scanners read the nested worktrees under `.claude/worktrees` and the vendored submodule, and the secrets scanner reports test fixtures and labels. A person does not know what each check is for.

## What Changes

- A running check or scanner shows its state, the elapsed time and its output so far, and can open in the integrated terminal.
- Each check and scanner has an info button that explains what it looks for, why it matters and what to do when it fails.
- The scanners skip nested worktrees, submodules and ignored folders. The dependencies scanner reads the tracked lock files only.
- The secrets scanner honours an allow marker on a test fixture and does not report a plain word.
- Shipyard writes YAML in the indented style that Biome and Prettier keep.
- Verify all docs skips git submodules.

## Impact

- Affected capability: `quality-runs` (new). It extends `code` (Code / Quality).
- Affected code/docs: `crates/shipyard-app/src/qa.rs`, `scanners.rs`, `code.rs`, `crates/shipyard-store/src/` (YAML writers), `src/features/code/quality.tsx`, `src/lib/i18n/`, `docs/guide/code.md` (EN, FR), `AGENTS.md` (project rules for fixtures).

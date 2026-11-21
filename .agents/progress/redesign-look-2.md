# Look pass 2: brief for each place

Look pass 2 rebuilds the pages of each place so that each one matches its design picture. Five sessions work at the same time, one per group. This file is the common brief. The message that starts a session gives its group, its screens, its folders, its screen id block and its port.

## State

- Waves 1 to 7 and look pass 1 are joined on the branch `feature/app-ui-ux-redesign-df0d13`.
- Look pass 1 rebuilt the tokens, the shell and the shared parts from the design source. The shell matches the design.
- A comparison of all 101 design pictures with the built screens found 0 matches. The pages inside the shell are still the old dense pages.

## Before you start

1. Check that your worktree is clean. Make a new branch from the joined one: `git switch -c feature/app-redesign-look-2-<group> feature/app-ui-ux-redesign-df0d13`. Check the branch and its base.
2. Run `git submodule update --init docs/agent-compass` and `pnpm install --frozen-lockfile`. Look pass 1 added font packages.
3. Read the look pass 1 section of `.agents/progress/app-redesign.md`: the list of shared parts with their paths and props, and the map of moved controls. Build on these parts. Do not add a second component for a thing that exists. When a shared part lacks something, work around it in your folder and name it in your report.
4. Read your gap list in `.agents/progress/redesign-gaps/` in full. For each screen it names what the design shows, what the app shows and the likely source file. It was made before look pass 1. The items about shared chrome (small title, icon tile, gradient button, switch on its own row) can be fixed already: check before you change.
5. Extract the design source outside the repository: `tar -xzf docs/designs/redesign/canvas-source.tar.gz -C <temp folder>`. For each of your screens, read its HTML file in `project/` and `shared.css`. The index `docs/designs/redesign/README.md` maps each screen number to its file. Port from the source, not from a guess.

## Rules

- Each screen of the design exists as a page or a state that a person can reach, with the layout, the parts and the controls of its design file. A screen that the design shows as a full page with a back link is a page with its own address. It is not a side panel and not a dialog.
- Keep every function of today. A control that the design does not show moves behind "More", a sub-page or the Ask bar. It is never deleted. `src/features/shell/inventory.test.tsx` must pass.
- Where a feature of today is illogical, improve it, but keep the function.
- The app must be easy for a person with little technical knowledge: plain words, no raw ids, no internal state names, dates in plain form.
- User-facing text says "issue tracker" and "code host", never "tracker" or "forge". No taglines, no helper text, no secondary labels.
- Sample values in the design are invented. Port the structure and the look, and feed it with the real data.
- Where the mock data has no case for a screen (for example no notification, no failing gate, no join request), add the case to the demo mock data in the mock files of your area, so that the screen shows in the demo build.
- Never remove input validation, data-loss handling, a security control or accessibility basics. Targets of 44 px, contrast, roles and names stay.
- Never edit the generated IPC bindings by hand. A new command needs its Rust side, `pnpm ipc:gen` and the mocks.

## Parallel work

- Stay in the folders of your group.
- Do not edit `src/ui/`, `src/features/shell/` or the tokens, except for a defect that blocks you. Then make the smallest fix and name it in your report.
- In shared files, add or change only the lines of your group. Do not reorder, reformat or rename what is there. The shared files are `src/app/router.tsx`, `src/app/tab-view.tsx`, `src/features/shell/places.ts`, `src/lib/i18n/`, `src/lib/ipc/mock.ts`, the changelogs, `docs/designs/screens.json`, `tasks.md`, `.agents/progress/app-redesign.md`, `e2e/` and `scripts/screenshots.ts`.
- Take new screen ids from the block of your group only.

## How to work

- Use a dynamic workflow: plan, split, workers, review, fix. Use up to four writers at the same time on files that do not overlap, and up to ten agents. Use the Fable model for every agent: pass `model: "fable"` in each agent call.
- Write the tests before the implementation where behavior changes. Update the e2e specs and the persona walks in the same round. Move each check; drop none.
- Verify by picture, screen by screen:
  1. Build with `pnpm build`. The demo mock data is on by default; `VITE_MOCK_DEMO=0` turns it off.
  2. Serve with `pnpm preview --port <your port> --strictPort`.
  3. Capture each of your screens at 1440 by 900 in the Light theme.
  4. Give an agent in a fresh context only the two pictures of a screen: your capture and `docs/assets/screenshots/redesign/NNN-<name>.jpg`. It lists each difference in layout, parts, controls and look.
  5. Fix, and repeat until the screen matches.
- Run the fast gates during the work. Run the slow gates once at the end, in parallel with each other, and again only after a fix.
- Do not end your turn while a workflow or a gate still runs, unless a real blocker stops you.
- Update the docs in the same change: `docs/designs/screens.json`, the pictures in `docs/assets/screenshots/`, the guide of your place in four languages, both changelogs with the same number of bullets, the i18n keys in the four languages, the spec deltas of the touched capabilities, and one section in `.agents/progress/app-redesign.md`.

## Done

Each of your screens matches its design picture in the fresh-context check, or is listed with the exact difference and the reason. These commands pass:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --no-fail-fast
pnpm typecheck
pnpm lint
pnpm test
CI=1 npx playwright test
pnpm test:personas
```

From `docs/`: `pnpm dlx @fission-ai/openspec@2.0.0 validate update-app-redesign --strict`.

Do not skip, weaken or delete a test to make a gate pass.

## Limits

- Commit locally on the new branch with conventional messages and no AI attribution lines.
- Do not push. Do not open a pull request. Do not merge another branch.
- Do not read environment, key or credential files. Do not write to an issue tracker.

## Final report

- The commits.
- A table of your screens: screen number, address or steps, match or the difference.
- The shared files that you touched.
- The shared parts that lack something.
- Each check command with its result: passed, failed, or not run and why.
- The open risks.

Say "partial" if a check failed or did not run, or if a screen does not match.

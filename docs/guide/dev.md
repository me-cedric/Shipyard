# Developer guide

## Requirements

- Node 24 or later, with pnpm 11 (`corepack enable`).
- Rust stable. On Linux, the Tauri system libraries: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`.

## Layout

| Path | Content |
|---|---|
| `crates/` | Rust workspace. Domain logic in `shipyard-core` has no I/O. |
| `crates/shipyard-app/` | Tauri shell: `tauri.conf.json`, `capabilities/`, `icons/`, commands in `src/commands/`. |
| `src/ui/` | Design system: `tokens`, `icons`, `atoms`, `molecules`, `organisms`, `templates`, `gallery`. Long lists use `VirtualList` and `DataTable` (TanStack Virtual and Table). |
| `src/features/<space>/` | One folder per space. A feature imports only `@/ui`, `@/lib` and its own folder. |
| `src/lib/ipc/` | Generated bindings and the mock layer. |
| `src/lib/i18n/` | English and French catalogues. `fr.ts` has the type of `en.ts`. |
| `e2e/` | Playwright tests on the Vite release build, with the mock IPC. |
| `docs/guide/` | User pages, one for each space, and this guide. |

## Run

```bash
pnpm install
pnpm dev          # UI in a browser on http://localhost:1420, with the mock IPC
pnpm tauri dev    # desktop app
```

The gallery is at `/dev/gallery` in the dev build only.

## IPC

1. Add a command in `crates/shipyard-app/src/commands/<feature>.rs` (the Work commands sit in `crates/shipyard-app/src/work.rs`, next to the state that they keep; the Factory commands sit in `factory.rs`, `questions.rs` and `delivery.rs` of the same folder) and register it in the specta builder in `src/lib.rs`. A command is `async`, takes `app: AppHandle` and returns `Result<T, String>`. Put the logic in a plain function over `&AppState`, so a unit test needs no Tauri runtime. A TypeScript call returns a result object: read it with `unwrap` from `@/lib/ipc`.
2. Run `pnpm ipc:gen`. It runs `cargo test --workspace` and writes `src/lib/ipc/bindings.ts`. Do not edit that file.
3. Add the mock handler in `src/lib/ipc/mock.ts`. A handler gets the arguments in order and returns the data. `pnpm typecheck` fails until each command has a handler. Tests start from an empty mock (`resetMock`) and read it with `mockState()`.

Outside Tauri, `src/main.tsx` installs the mock, so Vite, Vitest and Playwright run with no Rust. The mock folder picker returns `/mock/alpha`, `/mock/beta` and `/mock/gamma` in turn. The mock file dialog for Excel returns `/mock/costing.xlsx`, or the path in `mockState().nextFile` once. A path with `bad` in it gives a workbook with one refused row.

## App data

Machine state lives in the app data folder: `prefs.json` (theme, language, role), `registry.json` (projects, last view, overrides), `connections.json` (the settings of each issue tracker and code host connection, no secret), `agents.json` (the MCP config, the model providers and the model tiers of each runner, no secret), `mirror.sqlite` (the tickets and pull requests of the sync engine, the claims and the event outbox, rebuilt by the next tick), `runs.sqlite` (the run log, append only, and the saved state of each run), `agents/<run>/<step>/` (the private MCP file and the brief of a running step, removed when the step ends), `worktrees/<project>/<run>/` (the run folder and the child worktrees of a run, outside the working copy), `gates/` (the output of a gate command while it runs), `machine-id` (the name of this installation in a claim stamp) and `refs/<project id>.sqlite` (the ref index, rebuilt on demand). The repository holds the `.shipyard/` files: `project.yaml`, `automation.yaml`, `workflows/` and `roles/` (the app seeds the last two at the first use of a project). Each connection secret lives in the OS keychain under `conn:<id>`; an MCP field under `conn:<server>/<field>`. `prefs.json` also holds `releaseUrl`, the address that the update check reads. `.shipyard/project.yaml` may name the tracker and forge connection ids and the tracker scope (`connections.trackerScope`).

The app answers `shipyard --mcp-relay <server-id>` (binary `shipyard`, crate `shipyard-cli`) on a socket in `relay/` of the app data folder. `SHIPYARD_DATA_DIR` replaces the folder.

## Project import

`shipyard_store::project_import::import(source, root)` reads a repository with the existing layout and writes Shipyard files into the project (command `project_import`, spec `projects` REQ-014, REQ-015). It reads the default paths only (Q-091).

| Source | Shipyard |
|---|---|
| folder name and `docs/delivery/tickets.config.json` (`projectKey`) | `.shipyard/project.yaml` (name, key, `connections.trackerScope` for Jira) |
| `docs/planning/team.json`, `docs/personas/personas.json` | `.shipyard/team.yaml` (the persona name is the role) |
| `docs/costing/<name>.json` | `docs/costing/<name>.yaml` |
| `docs/decisions/`, `docs/delivery/questions/`, `docs/openspec/` | same path, same text |

The import never replaces a file and never changes the source. A target that exists is a conflict (Q-090). A file that it cannot read or convert is skipped with a reason. A symlink and a file over 2 MiB are skipped.

## Sidecar

The MCP bridge entry starts the `shipyard` binary (crate `shipyard-cli`) next to the app binary (`cli_path` in `crates/shipyard-app/src/factory.rs`). A release build ships it as a Tauri `externalBin` sidecar:

```bash
pnpm tauri:release   # tauri build with crates/shipyard-app/tauri.release.conf.json
pnpm build:sidecar   # only the sidecar: crates/shipyard-app/binaries/shipyard-<triple>
```

`scripts/build-sidecar.mjs` builds the CLI in release mode for the target triple and copies it to `crates/shipyard-app/binaries/` (git ignores the folder). `tauri.release.conf.json` runs it as `beforeBuildCommand`. `tauri.conf.json` has no `externalBin`, so `pnpm build`, `pnpm tauri dev` and `cargo test` need no sidecar (Q-092). A dev build uses `shipyard` from the `PATH`.

## End-to-end tests

`pnpm test:e2e` builds the app with `VITE_MOCK_DEMO=0` and serves it on port 4174. One file covers each space, for example `e2e/work.spec.ts`. Run one file with `pnpm playwright test e2e/<name>.spec.ts`.

- `e2e/a11y.spec.ts` runs axe (`@axe-core/playwright`) on every tab of every space, in the light and the dark theme, with reduced motion. A violation fails the test. A new tab joins the run when you add it to `SPACES` in `src/features/shell/spaces.ts`.
- `e2e/design-system.spec.ts` covers the gallery: one page for each atomic layer, a focus ring on each layer button, the theme and language switch, and axe on each layer in both themes. The gallery exists in the dev build only. The test starts its own `vite` dev server on port 4175. It checks that the release build has no gallery route.
- `pnpm test:personas` walks the first hour of each profile (project manager, architect, developer, tester, business analyst, functional lead, junior) in the demo build. It uses `playwright.personas.config.ts` and `e2e/personas/*.persona.ts`, and `pnpm test:e2e` does not run it. Set `PERSONAS_OUT` to a folder: each profile writes one screenshot for each step and a log with the clicks and the result of each step (ok, confusing, dead end, error). A step that the app cannot do fails the run softly and the walk continues.

## Checks

```bash
pnpm run lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pnpm ipc:check
```

`pnpm ipc:check` fails when the committed bindings differ from the Rust commands. CI runs all checks on macOS and Linux (`.github/workflows/ci.yml`).

## Acceptance

The seed script makes a sample project with one file for each kind of artifact that the app reads. The live tests call the real command functions of the app against GitHub.

1. Sign in with the GitHub CLI: `gh auth login`.
2. Make or refresh the sample project and its private repository `me-cedric/shipyard-acceptance`:

```bash
node scripts/acceptance/seed.mjs --remote github
```

The script writes `~/Projects/shipyard-acceptance` (use `--dir <folder>` for another folder). It is safe to run twice: the second run changes nothing. Without `--remote` it makes no repository and no issue. With `--remote github` it also pushes the branch `main` and makes the label `agent`, the milestone `Release 1` and four issues. It reads no token. Git signs in through `gh auth git-credential`.

3. Run the live tests:

```bash
SHIPYARD_LIVE=1 GH_TOKEN=$(gh auth token) \
  cargo test -p shipyard-app --test live_github -- --test-threads=1 --nocapture
```

Without `SHIPYARD_LIVE=1`, each test prints `skipped` and passes, so CI stays green. Never write the token in a file or in a command argument.

Each test works on a copy of the sample project in a temporary folder. The tests cover the seed project (all readers), the issue tracker (list, create, label, assign, comment, move, mirror after a sync), the code host (branch, pull request, files, checks, comment, request changes, close), the spec archive in a pull request, and the publish of a local project to `me-cedric/shipyard-acceptance-publish`. A test closes the pull request and deletes the branch that it opened. The repositories and the issue `Live test issue` stay.

A machine behind a proxy that signs its own certificates needs `SHIPYARD_CA_BUNDLE=<certificate file>` in the same command. `SHIPYARD_SEED_DIR` names a sample project in another folder.

## Security scan

`.github/workflows/security.yml` runs Monday to Friday at 02:00 UTC and on demand (`workflow_dispatch`). It has four jobs:

- `deps`: `osv-scanner` on `Cargo.lock` and `pnpm-lock.yaml`, and `pnpm audit --prod`.
- `owasp`: Semgrep OSS with the OWASP, TypeScript, React, Rust and secrets rule sets. It needs no account.
- `secrets`: gitleaks on the full history. The report hides each secret value.
- `report`: writes one table to the run summary, and opens, updates or closes the issue "Security scan findings" (label `security`).

The run fails on a finding with CVSS 9.0 or more, a high or critical npm advisory, a Semgrep `ERROR`, or a secret. It also fails when a scan gives no report. To accept an advisory, add an `[[IgnoredVulns]]` entry with a reason and a review date to `.osv-scanner.toml`. Run the OSV scan on your machine with `osv-scanner scan --lockfile=Cargo.lock --lockfile=pnpm-lock.yaml --config=.osv-scanner.toml`.

Renovate opens security updates at once and labels them `security` (`renovate.json`).

## Icons

The app icons come from `docs/assets/logo.svg`:

```bash
pnpm tauri icon docs/assets/logo.svg -o crates/shipyard-app/icons
```

Keep only the desktop files that `bundle.icon` in `tauri.conf.json` lists.

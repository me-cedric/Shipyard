# Developer guide

## Requirements

- Node 24 or later, with pnpm 11 (`corepack enable`).
- Rust stable. On Linux, the Tauri system libraries: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`.

## Layout

| Path | Content |
|---|---|
| `crates/` | Rust workspace. Domain logic in `shipyard-core` has no I/O. |
| `crates/shipyard-app/` | Tauri shell: `tauri.conf.json`, `capabilities/`, `icons/`, commands in `src/commands/`. |
| `src/ui/` | Design system: `tokens`, `icons`, `atoms`, `molecules`, `organisms`, `templates`, `gallery`. |
| `src/features/<space>/` | One folder per space. A feature imports only `@/ui`, `@/lib` and its own folder. |
| `src/lib/ipc/` | Generated bindings and the mock layer. |
| `src/lib/i18n/` | English and French catalogues. `fr.ts` has the type of `en.ts`. |
| `e2e/` | Playwright smoke tests on the Vite build. |

## Run

```bash
pnpm install
pnpm dev          # UI in a browser on http://localhost:1420, with the mock IPC
pnpm tauri dev    # desktop app
```

The gallery is at `/dev/gallery` in the dev build only.

## IPC

1. Add a command in `crates/shipyard-app/src/commands/<feature>.rs` and register it in the specta builder in `src/lib.rs`. A command is `async`, takes `app: AppHandle` and returns `Result<T, String>`. Put the logic in a plain function over `&AppState`, so a unit test needs no Tauri runtime. A TypeScript call returns a result object: read it with `unwrap` from `@/lib/ipc`.
2. Run `pnpm ipc:gen`. It runs `cargo test --workspace` and writes `src/lib/ipc/bindings.ts`. Do not edit that file.
3. Add the mock handler in `src/lib/ipc/mock.ts`. A handler gets the arguments in order and returns the data. `pnpm typecheck` fails until each command has a handler. Tests start from an empty mock (`resetMock`) and read it with `mockState()`.

Outside Tauri, `src/main.tsx` installs the mock, so Vite, Vitest and Playwright run with no Rust. The mock folder picker returns `/mock/alpha`, `/mock/beta` and `/mock/gamma` in turn.

## App data

Machine state lives in the app data folder: `prefs.json` (theme, language, role), `registry.json` (projects, last view, overrides) and `refs/<project id>.sqlite` (the ref index, rebuilt on demand). The repository holds `.shipyard/project.yaml` only.

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

## Icons

The app icons come from `docs/assets/logo.svg`:

```bash
pnpm tauri icon docs/assets/logo.svg -o crates/shipyard-app/icons
```

Keep only the desktop files that `bundle.icon` in `tauri.conf.json` lists.

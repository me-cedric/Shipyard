---
status: accepted
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# PTY crate and terminal emulator for Code / Terminal
## Context and problem statement
Code / Terminal (`add-code` REQ-034 to REQ-036) needs a real shell in the app. The workspace holds no PTY crate and no terminal emulator package. The plan says to raise an ADR before adding them.
## Considered options
- `portable-pty` (Rust, from WezTerm) with `@xterm/xterm` and `@xterm/addon-fit` in the webview.
- A pipe to the shell with no PTY (no line editing, `zsh` does not load `.zshrc`, no colours).
- `tauri-plugin-pty` (smaller community, adds a plugin layer).
## Decision outcome
Chosen option: `portable-pty` with `@xterm/xterm` and `@xterm/addon-fit`, because the pair is proven and its code can be reused. A pipe breaks the shell of the person.
### Consequences
- `shipyard-app` depends on `portable-pty`. The frontend depends on `@xterm/xterm` and `@xterm/addon-fit`. The WebGL and web-links addons are not added.
- The terminal starts the login shell of the person in the project folder. The app never writes a secret to the terminal.
- The terminal process ends when its panel closes or the app quits.

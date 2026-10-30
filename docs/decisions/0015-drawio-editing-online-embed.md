---
status: proposed
date: 2026-10-30
decision-makers: [Cédric Meyer]
---
# draw.io editing: the online embed, with the read-only view offline
## Context and problem statement
Design / Diagrams shows draw.io files read-only (Q-040). A person who is not technical cannot change a diagram in Shipyard. The draw.io editor is a large web application. Shipyard must load it from the internet or ship a copy of it.
## Decision drivers
- A person edits and saves a draw.io file with one click on Save, as for Excalidraw and BPMN.
- The installer stays small. Shipyard adds no dependency.
- The editor gets no access to the app, to the files or to the IPC.
- The view works offline. Offline, it shows the diagram read-only.
## Considered options
- The online embed: an iframe of `https://embed.diagrams.net` in embed mode with `proto=json`. The app loads and saves the XML through `postMessage`.
- Vendor the draw.io web application (Apache 2.0) in the installer and serve it through a Tauri URI scheme.
- Keep the read-only view.
## Decision outcome
Chosen option: the online embed. It gives full editing with no new dependency and no increase of the installer. Offline, or when the editor does not answer, the view stays the read-only view of Q-040. A `.drawio.svg` file is saved as an SVG with its model (export format `xmlsvg`).
### Consequences
- The CSP adds `frame-src https://embed.diagrams.net`. No other origin can show in a frame.
- The view accepts a message only from the origin `https://embed.diagrams.net` and from its own iframe. The iframe sends the XML; it cannot call the IPC or read a file.
- The diagram text goes into the iframe. The embed edits in the browser and does not upload the file, but each open loads code from diagrams.net. A project with a no-internet rule uses the read-only view or opens the file outside.
- The save button of draw.io and its exit button are hidden. The Save button of the frame is the one click that writes, and it respects the read-only lock.
- If the embed becomes a problem, the vendored option replaces the iframe source and keeps the same message protocol.

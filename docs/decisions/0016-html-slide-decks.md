---
status: accepted
supersedes: ADR 0013 for slides
date: 2026-11-04
decision-makers: [Cédric Meyer]
---
# HTML slide decks in a sandboxed frame, with a PDF export
## Context and problem statement
Knowledge / Slides shows Markdown decks on reveal.js (ADR 0013). A Markdown deck has one look and no animated diagram, chart or step reveal. The owner wants rich motion, slide transitions and step reveals, with all motion off under reduced motion, an export to PDF with vector text, and one set of rules that every agent follows to write a deck.
## Decision drivers
- A deck is one file in the repository that opens in any browser with no network.
- A deck is code from the repository. It must not reach the app, the IPC, the files or the network.
- The PDF has one page per slide, with each step in its final state, and its text stays text.
- Every agent writes a deck the same way.
## Considered options
- One self-contained `.html` file per deck, written by an agent with a deck skill, shown in a sandboxed frame.
- Markdown plus a template: the app renders Markdown slides into a fixed HTML template.
- The reveal.js runtime with HTML slides inside the app.
## Decision outcome
Chosen option: one self-contained `.html` file per deck in the slides folder. All CSS and JavaScript are inline. Markdown plus a template gives one look and no per-slide diagram or chart. The reveal.js runtime runs deck code in the app page, with the IPC in reach.

The deck skill `slide-deck` ships in agent-compass, so `ac sync` installs it in each project. It is based on `zarazhangrui/frontend-slides` (MIT): its fixed 16:9 stage, its print block and its style presets, with the licence kept. It adds a reduced-motion block, step reveals that show without the script, animated SVG diagrams and charts (ideas from `nicobailon/visual-explainer`, MIT), the messages of the host frame, and grep checks.

The view shows a deck in an `iframe` with `sandbox="allow-scripts"` only. The frame must never get `allow-same-origin`: with it, a deck would share the origin of the app and reach the IPC and the storage. The frame has no origin: it cannot call the IPC, read the app storage or read a file. A `srcdoc` frame takes the policy of the app page, and that policy blocks inline scripts. So the app serves the deck from its own scheme `deck` (`deck://localhost/<path>`, `http://deck.localhost/<path>` on Windows), with the policy `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:`. The scheme gives only an `.html` file of the slides folder. The browser mock, which has no scheme, uses `srcdoc`.

The PDF export opens the Save as dialog, then prints the deck with its print style sheet. A hidden window with JavaScript off loads the deck from the `deck` scheme, and WebKit prints it to the chosen file on a 16:9 page with no margin (`NSPrintOperation`, macOS). No picture of a slide is taken: the text stays vector text.
### Consequences
- The CSP adds `deck: http://deck.localhost` to `frame-src`. No capability changes. The hidden print window has no IPC, because its JavaScript is off.
- `shipyard-app` depends on `objc2-app-kit`, `objc2-foundation` and `objc2-web-kit` on macOS. They are already in the tree through `wry`.
- The PDF export works on macOS only. Windows (WebView2 `PrintToPdf`) and Linux (the WebKitGTK print operation) return an error until they get their own call.
- The print window keeps JavaScript off for good: the deck prints from its HTML and CSS alone, so no deck code runs in a window that the app owns.
- The print view needs no script. A deck draws its content in HTML and SVG, not on a canvas. Each element has its final state as its base style.
- The PDF is done when the file ends with `%%EOF`. A very large deck can reach the 60 s limit.
- "Add a slide" appends a Planning or Costing `<section class="slide">` after the last slide, built from the data, with the variables of the deck template (no colour of its own).
- Markdown decks stay read only, with Present and a Convert that asks an agent for the HTML deck. The Markdown editor goes. reveal.js stays for Markdown decks until no project has one.
- A deck can still use the CPU of the person (an endless loop). The frame stops when the person leaves the deck.

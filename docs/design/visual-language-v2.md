# Visual language v2

ADR 0014. Goal: a workspace that feels alive and premium (Cabinet, Linear, Raycast, Pace UI), and stays dense and fast. The constitution still applies: no taglines, no helper text, no secondary labels; icon and noun labels; keyboard path, focus ring, contrast; French and English.

## 1. Tokens (`src/ui/tokens/tokens.css`)

| Token | v2 |
|---|---|
| Surfaces | `--surface-0` app background (near-black with a 2 % accent tint in dark; warm off-white in light), `--surface-1` panel, `--surface-2` raised card, `--surface-3` popover and dialog. Each level is lighter in dark mode, with a 1 px inner highlight (`inset 0 1px 0 rgb(255 255 255 / 4%)`). |
| Elevation | `--shadow-1` card at rest, `--shadow-2` hover and drag, `--shadow-3` popover, dialog. Soft, wide and low-opacity; in dark mode a highlight replaces most of the shadow. |
| Accent | One hue, with a gradient `--accent-gradient` (accent to accent + 40° hue) for the primary button, the active nav pill, progress and live runs, and `--accent-glow` (a 12 to 24 px blur at 25 %) for focus and live state. |
| Status | Four status hues with a soft tinted background each (`--success-soft` and the rest) for chips and lane headers. |
| Radius | 8 (controls), 12 (cards, panels), 16 (dialogs, hero panels), full (pills). |
| Type | Inter (Switzer when Q-001 clears) for text; Departure Mono for ids, numbers, keys and code. Page title 20/28 semibold, section 14/20 medium, body 13/20, meta 12/16. Numbers use tabular figures. |
| Motion | `motion` springs: `snappy` (stiffness 500, damping 32) for hover and press, `smooth` (300, 30) for panels and lists, `gentle` (180, 24) for page change. List items stagger 20 ms. Everything is off with `prefers-reduced-motion`. |
| Background | A faint grid or noise layer and a soft accent aurora at the top of the main area (CSS only, no image). |

## 2. Shell

- **ContextBar** (top, 44 px, always visible): project switcher with state dot, branch switcher, repo state (changes, ahead, behind) with Sync, the live factory pulse (active runs, needs-you count), search and palette trigger (⌘K), assistant (⌘J), notifications, theme. It replaces the project control in the sidebar.
- **Sidebar**: floating panel on `--surface-1` with radius 12, the active space as an accent pill with a spring layout animation (`layoutId`), a count badge per space (needs-you, changes, open pull requests), collapse to a 56 px rail with tooltips.
- **Tabs**: segmented control with an animated pill under the active tab.
- **Status bar**: thinner; the sync and commit actions stay unique there.

## 3. Shared components

| Component | Use |
|---|---|
| PageHeader | Icon, title, count, one primary action, an overflow menu, context chips (ref, path, branch). Every tab uses it. |
| StatStrip | 3 to 5 stat cards with a value, a delta and a sparkline. Home, Factory / Runs, Usage, Work / Plan, Code / Changes, Knowledge / Dashboards. |
| Panel | `--surface-1`, radius 12, header with title and count, optional toolbar. Replaces bare bordered blocks. |
| Card | `--surface-2`, hover lift (`--shadow-2`, translate -1 px), press scale 0.99, focus glow. |
| AnimatedIcon | Heroicons-animated style: a short stroke or rotate on hover and on state change (sync spins while running, bell rings once on a new item, check draws on success). |
| Progress, Sparkline, LiveDot | Run progress across steps, spend over time, a breathing dot for a live agent (the one loop that is allowed). |
| EmptyState v2 | Illustrated ghost layout of the real content, one primary action. |
| Toast, Dialog, Popover, Menu | `--surface-3`, blur backdrop, spring scale-in. |

## 4. Per space

- **Home**: StatStrip (needs you, my items, live runs, spend today), Inbox cards with the answer controls inline, activity timeline with avatars.
- **Factory / Runs**: lanes as Panels with tinted headers, run cards with a step Progress, a live agent avatar, cost bar against budget, PR and CI chips; the run view as a full detail page with the DAG (animated edges for running steps), a terminal-style event tail and the diff.
- **Agents map**: dark canvas with glowing nodes, animated edges for live messages, a legend chip row.
- **Work / Board**: cards with avatar, estimate, priority and run state; drag with spring; columns with WIP counts.
- **Design and Specs**: list-detail with a large preview canvas, file chips, backlinks panel; specs show the artifact progress (proposal, spec, plan, tasks) as a stepper.
- **Code**: diff with a sticky file tree, pull requests as rich rows with CI and review chips.
- **Knowledge**: graph with the same glow language, handbook in a reading layout (680 px measure).
- **Settings**: grouped Panels, each row a SettingsRow with the control on the right.

## 5. Rules for agents that build it

- Load the `minimalist-skill` (product UI) and the `soft-skill` (high-end visual design) taste skills before UI work. Never the landing-page skills.
- Use only tokens. A new primitive goes in `src/ui/`. Keep axe green in light and dark.
- Compare each page with the references; the Shipyard page must hold at least the same information and actions.

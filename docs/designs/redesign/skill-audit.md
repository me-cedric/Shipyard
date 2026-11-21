# UI skill audit of the redesign

An audit of the redesigned app against public design skills. Date: 2026-11-21. Branch: `uiux-skill-audit`, on `feature/app-ui-ux-redesign-df0d13`.

## Sources

Stars and last push on 2026-11-21 (`gh api repos/<owner>/<repo>`).

| Source | Stars | Last push | Picked |
|---|---|---|---|
| anthropics/skills | 198k | 2026-11-16 | No: `frontend-design` sets a visual direction for new work. It has few rules for a product app that has a design. |
| nextlevelbuilder/ui-ux-pro-max-skill | 152k | 2026-11-19 | Yes: `pro-rules.md`, states, contrast, icons, spacing rhythm. |
| Leonxlnx/taste-skill | 119k | 2026-11-08 | No: most references are for marketing sections. The project has its product-UI part as `minimalist-skill`. |
| pbakaus/impeccable (impeccable.style) | 114k | 2026-11-21 | Yes: `craft-floor.md`, `mode-operate.md`, the detector rules. |
| Nutlope/hallmark | 59k | 2026-11-11 | Yes: `interaction-and-states.md`, the eight states, fields, overlays. |
| emilkowalski/skills | 58k | 2026-11-15 | Yes: `review-animations/STANDARDS.md`, `ui-cheatsheet.md`. |
| vercel-labs/agent-skills | 35k | 2026-11-20 | Yes: `web-design-guidelines` (Web Interface Guidelines). It is the most exact list for a product UI. |
| jakubkrehel/make-interfaces-feel-better | 4k | 2026-11-18 | No: few stars; its rules are also in the emilkowalski skills. |
| benjitaylor/skills | 4k | 2026-11-05 | No: few stars. |
| uizze.com | not shown | not shown | No: a gallery and a review checklist. Its checks (states, color not alone, focus) are in the picked sources. |

## Rules, ranked

Most important first. Landing-page and marketing rules are not in this list.

1. Each control a person clicks has a hit target of 44 px or more. (ui-ux-pro-max, hallmark)
2. Each interactive element shows a visible focus ring with `:focus-visible`; no `outline: none` without a replacement. (vercel, hallmark)
3. Body text has a contrast of 4.5:1 or more, large text 3:1, in light and in dark. (ui-ux-pro-max, impeccable)
4. Color is never the only sign of a state. (ui-ux-pro-max, uizze, hallmark)
5. Motion follows the reduced-motion setting. (vercel, emilkowalski)
6. Each control has the states default, hover, focus, active, disabled, loading and error. (hallmark, impeccable)
7. A pressable element gives press feedback: a scale of 0.95 to 0.98 on `:active`. (emilkowalski, ui-ux-pro-max)
8. Menus, selects and dialogs enter with a strong ease-out, under 300 ms, with no bounce or overshoot. (emilkowalski, impeccable)
9. A popover grows from its trigger (`transform-origin`); a modal stays centered. (emilkowalski, vercel)
10. Tooltips after the first open at once, with no delay and no animation. (emilkowalski)
11. Transitions name their properties; never `transition: all`. (vercel)
12. Numbers in columns use `tabular-nums`. (vercel, emilkowalski)
13. Headings use `text-wrap: balance`; body text uses `text-wrap: pretty`. (vercel, impeccable)
14. Browser surfaces (text selection, focus ring, numerals) carry the theme, not the browser default. (impeccable)
15. An empty state names what is empty and gives one action. (hallmark, uizze)
16. Spacing follows a 4 px or 8 px rhythm; icons use one family and one stroke. (ui-ux-pro-max)
17. A loading text ends with `…`, not `...`. (vercel)
18. A destructive action has a confirmation or an undo. (vercel, hallmark)

## What the check found

The check used the frozen demo build on port 4481 with Playwright: 10 pages in light and 4 in dark. A probe measured hit targets, text contrast, text size and heading wrap. A read of `src/ui/` covered the tokens, atoms and molecules.

- Rules 1, 2, 3, 5, 9, 11, 12, 15, 16, 17 and 18: met. No control is lower than 44 px. The contrast probe found no real failure (the hits were `oklch()` colors that the probe could not read). No visible `...` text.
- Rule 4: met on the pages that the probe saw; status chips have a word.
- Rule 7: met by `Button` (`active:scale-[.98]`), not by `IconButton`.
- Rule 8: not met. `--ease-spring` (`cubic-bezier(0.34, 1.36, 0.64, 1)`) overshoots by about 10%. Menus, selects, dialogs, the notification centre and the segmented thumb use it.
- Rule 10: the tooltip provider skips the delay, but the tooltip still fades in.
- Rule 13: not met. Each heading had `text-wrap: auto`; the Today question broke into a long first line and a short last line.
- Rule 14: not met. Selected text used the system blue.

## Changes

| Change | File | Rule |
|---|---|---|
| `--ease-spring` is a strong ease-out, `cubic-bezier(0.23, 1, 0.32, 1)`, with no overshoot. It now matches the smooth spring of `motion.ts`, which settles with no visible bounce. | `src/ui/tokens/tokens.css` | 8 |
| `h1` to `h4` use `text-wrap: balance`; `p` uses `text-wrap: pretty`. | `src/ui/tokens/tokens.css` | 13 |
| `::selection` uses `--accent-subtle` and the text color of the theme. | `src/ui/tokens/tokens.css` | 14 |
| `IconButton` scales to 0.96 on `:active` and names its transition properties. | `src/ui/atoms/icon-button.tsx` | 7, 11 |
| A tooltip that opens at once (`data-instant`) has no fade. | `src/ui/atoms/tooltip.tsx` | 10 |

## Pictures

`scripts/screenshots.ts` ran on the build before and after the changes. Twelve pictures changed, all from the new wrap of headings and paragraphs (the pictures use reduced motion, so the motion changes do not show): `account-menu`, `factory`, `home`, `home-dark`, `home-light`, `home-product-owner`, `leave-page`, `permissions-moment`, `setup-project-health`, `specs`, `sync-card` and `tour`. Four other pictures (`settings-connections`, `settings-permissions`, `setup-logs`, `today-news`) also change from run to run with no code change, so they stay as they were. The pictures in `docs/assets/screenshots/redesign/` are the design source and do not change.

## Left out

- Placeholders that end with `…` (vercel): the change touches each locale file in four languages for a small gain.
- No pulse on status dots (impeccable): the live dot marks a run in progress, the design picture has it, and reduced motion stops it.
- Faster exit than entry for dialogs (emilkowalski): the gain is small and each popup class would change.
- Themed scrollbars (impeccable): `scrollbar-color` can turn off the overlay scrollbars of macOS.
- Title Case for buttons (vercel): the project writes sentence case in plain English (ASD-STE100).

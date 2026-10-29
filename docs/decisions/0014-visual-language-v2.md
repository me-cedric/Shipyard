---
status: accepted
date: 2026-10-30
decision-makers: [Cédric Meyer]
---
# Visual language v2: depth, motion and context
## Context and problem statement
The owner tried the first build next to Legacy. Verdict: Shipyard looks flat and too simple, and it is worse than Legacy. MASTER-PLAN section 8 asked for "borders not shadows", one accent and motion only on state change. The result has no depth, no page headers, no context bar and no motion. The references (Pace UI, 23rd, Rive, Cabinet, uselayouts, animated Heroicons, Fontshare, Departure Mono) are rich, layered and animated. The owner asked for a modern, rich, animated, next-generation look.
## Considered options
- Keep v1 and polish spacing.
- Visual language v2: layered surfaces with soft elevation, an accent gradient, a context bar, page headers, summary strips, spring motion and animated icons. The interface rules of the constitution stay: no taglines, no helper text, no secondary labels.
## Decision outcome
Chosen option: v2. The brief `docs/design/visual-language-v2.md` holds the tokens and the components. It replaces the "borders not shadows" and "nothing moves except state changes" lines of MASTER-PLAN section 8. Reduced motion still turns every animation off.
### Consequences
- New tokens: four surface levels, elevation shadows, accent gradient and glow, radius 8, 12 and 16, spring motion.
- New shared components: ContextBar, PageHeader, StatStrip, Panel, AnimatedIcon, Sparkline, Progress, LiveDot.
- Every space adopts the PageHeader and the Panel. Tests and the axe sweep stay green.

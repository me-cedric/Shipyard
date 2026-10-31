---
status: accepted
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# Design system: shadcn on Base UI, Switzer and Departure Mono
## Context and problem statement
The earlier UI mixed 3,000 lines of legacy CSS with Tailwind and used system fonts.
## Considered options
- shadcn on Radix.
- shadcn on Base UI, OKLCH tokens, Switzer and Departure Mono.
## Decision outcome
Chosen option: "shadcn on Base UI", because Base UI 1.x is stable and accessible, and the copy-in model keeps every component in `src/ui/`.
### Consequences
- Switzer licence for a bundled desktop font is open: see Q-001. Fallback: Inter.
- Departure Mono (SIL OFL) for ids, numbers and code.

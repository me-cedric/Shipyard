# Design system

## Why

The earlier tool has 490 titles, 336 hints and 216 descriptions, and each page builds its own controls. The result is text load and drift between pages.
Shipyard needs one set of components so that every space looks and acts the same, and so that the rules "no taglines, no helper text, no secondary labels" apply in one place.

## What Changes

- Add design tokens: OKLCH colours (12-step neutral, one accent, four status colours), a 4 px grid, the type scale 11/12/13/14/16/20, radius 4 and 6, borders instead of shadows, motion at 120 ms and 200 ms.
- Add the fonts: Switzer for text and Departure Mono for ids, numbers and code, with Inter as the fallback (Q-001, option 1, working assumption).
- Add the atoms: Button, IconButton, Input, Select, Checkbox, Switch, Badge, StatusDot, Avatar, Kbd, Tooltip, Skeleton.
- Add the molecules and organisms: CommandPalette, FilterBar, TicketRow, TicketCard, BoardColumn, RunStep, QuestionCard, ApprovalBar, RefChip, BacklinkList, Inspector, EditorFrame, SettingsRow, MemberRow.
- Add the templates: Shell, Board, List and detail, Editor, Settings.
- Add a gallery route in the dev build, one page for each atomic layer.
- Add the rules: icon and noun as labels, group headings with a count, status by shape and colour, ghost rows for empty states, tooltip with name and shortcut only, one primary action per view, motion only on a state change, `prefers-reduced-motion` respected.
- Add light and dark themes, a high-contrast option, and two densities.

## Impact

- Affected capability: `design-system`
- Consumes: nothing.
- Produces: the components of every UI capability (`shell`, `design`, `specs`, `work`, `factory`, `questions-loop`, `delivery`, `code`, `knowledge`, `assistant`, `extensions`, `projects`, `connections`). `RefChip` and `BacklinkList` show the refs of `refs`. `QuestionCard` serves `questions-loop`. `ApprovalBar` serves the approvals of `factory`. `RunStep` serves `factory`.
- Feature list: the themes, contrast, density, fonts and reduced-motion preferences.
- Affected code/docs: `src/ui/`, `docs/plan/MASTER-PLAN.md` section 8, ADR 0009, Q-001.

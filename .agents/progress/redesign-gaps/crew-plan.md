# Gaps: Crew and Plan screens

Design pictures: `docs/assets/screenshots/redesign/`. App captures: this folder (`*.jpg`). Viewport 1440 by 900, light theme, mock data.
Result: 0 match, 20 with gaps, 1 not found (93).
The shared shell (sidebar, top bar, Ask bar) is not judged here.

## Repeated in this group

1. `look` Page title. Design: one large bold title (about 44 px), no icon, on the same row as the section tabs. App: small title (about 20 px) with a purple gradient icon tile, on a row below the tabs. Source: `src/ui/molecules/page-header.tsx`.
2. `look` Section tabs. Design: segmented control at the top right, on the title row. App: tab strip at the top left, on its own row above the title. Source: the place layout in `src/app/router.tsx` (place route) and its tab strip component.
3. `look` Title text. Design: Crew sections keep "Crew"; sub-pages use their own sentence title ("Budgets", "Team", "How agents do", "Build"). App: correct on Plan Timeline and Estimates, but Plan People shows "People" (design: "3 people have too much work") and Plan Time shows "Time" (design: "My time").
4. `look` Cards. Design: white cards, radius about 20 px, no border, soft shadow, 24 px padding, rows 60 px high with a hairline between them. App: dense data tables with 28 px rows, grid lines, monospace numbers, grey header rows. Source: each page file below, and the shared table (`src/ui/` data table) that they use.
5. `look` Stat tiles. Design: no KPI tile rows, or three plain white tiles (Plan). App: tinted gradient tiles with monospace values on Spend, Estimates, Time, Timeline. Source: the stat tile component in `src/ui/`.
6. `look` Primary button. Design: black solid button. App: blue to purple gradient button (Save, Rebalance, Task, Entry, Send). Source: button `primary` variant in `src/ui/atoms/`.
7. `look` Controls in rows. Design: each setting is one row "label left, control right" with pill buttons, steppers (minus, value, plus) and segmented choices. App: stacked label over full-width input, native selects, native date inputs, checkboxes. Seen on 80, 85, 99, 101.
8. `look` Agent and person marks. Design: black rounded square with a letter for an agent, grey circle with initials for a person. App: agents have no mark. People have the circle only on Crew cards.
9. `look` Raw values. Design: plain words ("Planner", "Strong model", "17 Nov", first names). App: raw ids and formats (`planner`, `top`, `wf:feature`, `run:01M63…`, `ACME-2`, `11/17/2026`, `2026-11-02 → 2026-11-06`, `dev`).
10. `extra` Sub-pages. Design: a sub-screen is a full page with a back link ("< Spend", "< Rights", "< Estimates", "< Timeline", "< People", "< Recipes"). App: a right side panel (Plan), a modal (Excel import), an inline bar (seal) or no page at all (Budgets, How agents do, Team). Only the member page (101) is a full page.
11. `extra` Dotted page background and gradient tint behind the content. Design: flat pale grey page.

## 4 Crew

Design: `004-crew.jpg`. Route: `/crew/crew`. Capture: `crew.jpg`. Source: `src/features/crew/crew-page.tsx`.

- `look` Person card. Design: large avatar (56 px), name in bold 18 px, one line with the current work ("Token API, Export endpoint"), small status pill. App: small avatar, a line of raw facts ("dev · 5 days a week · api · rust · Day rate 520"), full-width status bar.
- `look` Status pill. Design: small rounded pill, orange text on pale orange or green on pale green. App: full-width yellow or green block.
- `look` Agent card. Design: black letter square, name, current work, pill ("Waits for you", "5 at work"). Only agents with work are shown (3). App: no mark, 7 agents, 4 with a grey "Idle" block that looks like a disabled input.
- `look` Spend card. Design: amount in about 40 px bold. App: 20 px.
- `extra` "Cards / Live" switch and the "+ Member" button on this screen. Design 004 shows only the "Agents on" toggle in a white pill at the right of the tabs. (Design 030 shows Cards / Live next to the tabs.)
- `look` Recipes list. Design: recipe name, large grey step pills in plain words ("You review the plan", "Pull request"), Edit button. App: tiny bordered chips with raw step names ("Pr").

## 30 Crew live work

Design: `030-live.jpg`. Route: `/crew/crew?view=live`. Capture: `live.jpg`. Source: `src/features/crew/live.tsx`.

- `look` Title. Design: "6 agents at work" as the page title. App: "Agents at work" with a count badge.
- `look` Row. Design: agent mark and name, a line to a grey feature block with the status pill inside ("Waits for you", "Blocked", "Budget reached"), a line to file and spec chips. Blue lines for active rows. App: plain text columns, status as grey text ("Approve 2 actions"), no lines, no blocks.
- `extra` Reference chips with raw ids and green dots (`wi:ACME-2`, `run:01M63HM9…`). Design: short chips (`spec:export`, `src/app.ts`).
- `look` Filter tabs. Design: four separate white pills, the active one solid blue. App: one joined segmented bar with a gradient active item.
- `extra` One run appears on two rows ("Add export endpoint" twice).

## 27 Crew Recipes

Design: `027-recipes.jpg`. Route: `/crew/recipes`, then `/crew/recipes?recipe=feature`. Captures: `recipes.jpg`, `recipe-tall.jpg`. Source: `src/features/crew/recipes.tsx`, `src/features/factory/workflows/workflow-form.tsx`.

- `missing` Step list. Design: the right card shows the recipe as a vertical chain of step rows (agent mark, step name, agent pill, model pill, "Waits for a person" row in orange, "Asks first"). App: the right card shows the full form of every step at once (see 80).
- `missing` Recipe actions "Rename", "Duplicate", "Delete" as buttons in the card header, and the footer "Add a step", "Edit as text", "Show what changed", "Save". App: a "Form / Text" switch, a chevron menu and a disabled Save in the header.
- `missing` Proposal card "Planner proposes a change to this recipe" with "Show the change", "Discard", "Apply". App: only a "Proposed" badge on the Bug card.
- `look` Recipe list item. Design: name and "5 steps". App: name, "Edit" link and step chips.
- `extra` "Roles" list (7 items) under the recipes, the `feature` slug, the `wf:feature` ref chip and the copy button in the header.
- `look` "New recipe" is a full-width button under the list in the design. App: "+ New" at the top right of the list.

## 80 Crew recipe step

Design: `080-recipestep.jpg`. Route: `/crew/recipes?recipe=feature` (no page for one step). Capture: `recipe-tall.jpg`. Source: `src/features/factory/workflows/workflow-form.tsx`.

- `missing` A page for one step: back link "< Recipes", title "Build", "Step 3 of the Feature recipe", "Show what changed", "Save". App: all steps stacked in one scroll.
- `missing` Card "Limits" for the step: "Tries after a failure", "Time limit", "Budget of the step", "Budget of the recipe", "Review rounds", "Runs beside other steps". App: only recipe limits (Stall timeout, Turn limit, Budget) at the top. Other fields may be behind "More".
- `missing` Rows "Name of the step", "What it does" (Plan / Open a pull request / Auto), "Skill", "Starts with a fresh memory", "May write" (Asks first / Alone), "Rules for the whole project", "Works in" (Shared folder / Own copy), "Repeat for each", "Child steps at once", "Child steps run side by side", "Stop when stuck after", "Most turns".
- `look` Four cards (Who, Limits, People, How it works) in two columns. App: one card with two columns per step, "People" inside the left column.
- `look` "Needs" and "Tools". Design: chips plus "Add". App: rows of checkboxes with raw names (`ask_question`, `spawn_subtask`).
- `look` "Step id" raw field. Design has no id field.

## 28 Crew Sessions

Design: `028-sessions.jpg`. Route: `/crew/sessions`. Capture: `sessions.jpg`. Source: `src/features/crew/sessions.tsx`, `src/features/factory/sessions/machine-sessions.tsx`, `src/features/factory/sessions/orca-sessions.tsx`.

- `missing` Dark live output panel on the right (session name, "Read only", "Take control", "Stop"). App has no output panel.
- `look` Left column. Design: a short list "On this machine" (agent mark, feature name, "Claude Code, sonnet", pill "Shown" or "Waits for you"). App: a full-width table of 44 sessions with Model, Run, Step, State, Started, Tokens, Cost and a Total row.
- `extra` Second table "This computer" with tokens and cost. Design has one list.
- `look` Orca sessions. Design: small card with "None" and "Connect". App: full-width table.
- `missing` Row "Sessions of the last 7 days" (link to ended sessions). App lists ended sessions in the same table.
- `extra` "Agents on" toggle in the header. Design has it on the Crew section only.

## 13 Crew Spend

Design: `013-spend.jpg`. Route: `/crew/spend`. Captures: `spend.jpg`, `spend-tall.jpg`. Source: `src/features/crew/spend.tsx`, `src/features/crew/budgets.tsx`.

- `missing` Main card: total in very large type ("$16.09 on 10 features"), "Limit $3.00", one bar per feature with a limit tick, orange bar when over. App: a "Usage" table with ticket ids, tokens, iterations and a small progress bar.
- `missing` Alert card "Builder stopped: Cache the project list reached its limit" with "Stop here" and "Raise to $5.00". App: a tile "Over budget 1".
- `missing` Card "Limits": "Each feature $3.00 Edit", "Warn at 80 % Edit", "All budgets >". App: card "Budgets" with "Edit" and one person row.
- `missing` Card "More" with links "Success rate", "Requests of one run", "Use of this machine". App puts all three on this page.
- `missing` Button "Stop all agents".
- `extra` Five KPI tiles (Spend today, Spend, Tokens, Success rate, Over budget), three machine tiles, "Spend by day" chart, "This computer" table, "Monthly budget" form, "Request tree" card, "Show prices" and "Agents on" toggles. The design moves these to 78 and 83.
- `look` Truncated cells: the Usage column shows "ACME-3 B.", the Tokens tile is cut ("53,500,("), chart axis labels are cut ("O.", "N.").

## 78 Crew how agents do

Design: `078-spendmore.jpg`. Route: none. The parts are on `/crew/spend`. Capture: `spend-tall.jpg`. Source: `src/features/crew/spend.tsx`, `src/features/factory/usage/request-tree.tsx`, `src/features/factory/usage/machine-usage.tsx`.

- `missing` The page itself: title "How agents do", back link "< Spend", three cards.
- `missing` Success rate card: large rate, a strip of one block per run (green merged, orange stopped or failed), legend, button "The runs". App: one tile "50 % 2/4".
- `missing` Requests card: nested rows (Run, Plan, Build, read ticket) with costs, and a "Tree / Flame" switch. App: card "Request tree" with a run select and "No spend yet" for the default run.
- `missing` Machine card: "Processor" and "Memory" bars and "3 sessions run >". App: token and spend tiles and a table by AI tool.

## 83 Crew budgets

Design: `083-budgets.jpg`. Route: none. "Budgets" on the Crew spend card links to `/crew/spend`. Capture: `budgets.jpg` (same as Spend). Source: `src/features/crew/budgets.tsx`, `src/features/crew/spend.tsx`.

- `missing` The page itself: title "Budgets", back link "< Spend".
- `missing` Card "Limits" with five rows: "Each feature", "Each day", "Each month", "Each person", "Each AI tool", each with a value and "Edit". App: card "Budgets" with one "Edit" and one row per person, and a separate "Monthly budget" form (AI tool select, amount, Save).
- `missing` Card "At the limit": "Warn at 80 % Edit" and "Then: Stop and ask / Go on".
- `missing` Chart card with the total and a "Day / AI tool / Model / Project" switch. App: "Spend by day" with a "30 days" select and a separate "By AI tool" select on another card.

## 29 Crew Rights

Design: `029-rights.jpg`. Route: `/crew/rights`, then button "Edit". Captures: `rights.jpg`, `rights-edit.jpg`. Source: `src/features/crew/rights.tsx`, `src/features/work/team-rights.tsx`.

- `missing` Left card "People": avatar, name, role button per person, "Add a person", "Days off", link "Team file, requests and log". App: a "Members" table with the same seven right columns and no role button in read mode.
- `missing` Right card: role chips (Product owner … Viewer), title "A developer can", ten rows in plain words (Flow and tickets, Specs, Design, Plan and estimates, Start and stop agents, Approve agent actions, Code and merge, Library, Budgets, Setup), each with a "No / See / Change" switch. App: a matrix of 9 roles by 7 areas (Work, Specs, Design, Knowledge, Code, Runs, Settings) with small book and pencil icons and no legend.
- `extra` Global "Edit" mode with Save and Cancel. In edit mode each cell is a select cut to "Read and ...". Design edits in place.
- `look` Role name "Business analyst" (design: "Analyst"). Areas use old names (Work, Knowledge, Runs, Settings).

## 84 Crew team file

Design: `084-team.jpg`. Route: `/crew/rights` (no page). Capture: `rights.jpg`. Source: `src/features/crew/rights.tsx` (`TeamBanners`, `JoinRequest`, `Migration`, `AuditTail` from `src/features/work/team-rights.tsx`).

- `missing` The page itself: title "Team", back link "< Rights". No link opens it.
- `missing` In the mock nothing of it shows: no "asks to join" card (role select, Refuse, Accept), no "Ask to join" card (person, role, line for the team file, "Copy the line", "Send the request"), no "Roles live in the team file" card ("Open the file", "Move the roles to the team file"), no "Changes of rights" list with "Older changes". The components are mounted above and below the matrix but render nothing with the mock team. Check them with a mock that has a join request and an audit log.

## 101 Crew one person

Design: `101-member.jpg`. Route: `/crew/crew?member=ada` (click a person card). Capture: `member.jpg`. Source: `src/features/crew/member.tsx`.

- Structure matches: full page, Who, Rights more or less than the role, Work, When, "Remove from the team", "Save".
- `look` Back link. Design: "< Rights" as a blue text link above the title. App: a bordered "< Crew" button.
- `look` Title. Design: large avatar with initials and the name in about 44 px. App: gradient icon tile and 20 px name.
- `look` Rows. Design: label left, control right, one row each. App: label above a full-width input.
- `missing` "Days in a week" stepper (app: text input "Capacity (days a week)"). Skills as chips with "Add" (app: text "api, rust"). Day rate "Sealed" pill with "Unlock" (app: plain number 520, always shown). Role as a pill button with the role name (app: select with raw `dev`).
- `missing` "Extra rights" as chips with "Change" (app: text input "Right changes (+right, -right)"). "Rights of each role" as a row with a chevron (app: plain bold text).
- `missing` "Away" rows with "Remove" and a button "Add days off" (app: "Absences" with a small plus icon). Dates as pill buttons (app: native `dd/mm/yyyy` inputs).

## 5 Plan

Design: `005-plan.jpg`. Route: `/plan/timeline`. Captures: `timeline.jpg`, `timeline-tall.jpg`. Source: `src/features/plan/timeline.tsx`, `src/features/plan/capacity.tsx`.

- `look` Warning banner. Design: one row: three avatars, "3 people have too much work", "Show", "Rebalance". App: a tall card with a "Planner" pill, three proposal rows with "Apply", a full-width gradient "Rebalance" and "Show" below. It takes 390 px and pushes the timeline down to 140 px.
- `look` Timeline. Design: white card, four week columns, feature group labels, one tall rounded bar per task with avatar and first name inside, orange for overloaded people and blue for the others. App: a dense gantt grid with day columns, weekend stripes, a capacity strip, today marker, milestone diamonds, thin bars with the name outside, green and yellow colours.
- `extra` Sheet select "MVP 1" and "Day / Week / Month" switch on this screen (the design has them on People only). Primary button "Send to the issue tracker" in the header (design: only "Dates and days off" and "Export").
- `look` Date in the title: "11/17/2026" (design: "17 Nov").
- `look` Tiles "Tasks", "Features", "Tasks with no owner": three equal white cards across the full width in the design. App: three narrow gradient tiles, left aligned.

## 99 Plan dates and days off

Design: `099-plansettings.jpg`. Route: `/plan/timeline`, button "Dates and days off", and a click on a task bar. Captures: `plansettings.jpg`, `taskbar.jpg`. Source: `src/features/plan/timeline.tsx` (`CalendarForm`, task form), `src/features/work/holiday-country.tsx`.

- `extra` Two right side panels (one for the calendar, one for a task). Design: one full page with back link "< Timeline" and five cards.
- `look` Working days. Design: seven day chips, blue when on. App: seven checkboxes in a column.
- `look` Task card. Design: "Who" with name pill and "Choose for me", "Start: Shipyard chooses / On a fixed day", "Fixed day" with "Clear the fixed day", "Order: Earlier / Later". App: select "Member: Automatic", native date input with a small cross, two small arrow icons.
- `missing` Card "Calendar of the plan": Release, Estimate sheet, "Go to: Today".
- `missing` Card "Share": "Export as a picture" and the link "Send the plan to the issue tracker".
- `look` Holidays. Design: row with name, day and "Remove", button "Add a holiday". App: native date input, plus icon, raw date `2026-11-11` with a bin icon.

## 31 Plan People

Design: `031-people.jpg`. Route: `/plan/people`. Capture: `people.jpg`. Source: `src/features/plan/people.tsx`, `src/features/plan/capacity.tsx`.

- `missing` Load grid: one row per person, one block per week, fill height for the load, orange when over. App: a text list per person with week pills ("Week of 11/2/2026 10 of 5 days"), task lines and raw date ranges.
- `missing` Right card "Planner proposes" with all proposals, "Apply" each and "Apply both". App: one proposal row inside each person block.
- `missing` Links "Days off and holidays" and "Hours for each person".
- `missing` "Day / Week / Month" switch, "Export" and "Send to the issue tracker" on this screen. App has only the sheet select.
- `look` Title "People" (design: "3 people have too much work"). Underlined warning links per person.

## 93 Plan send to the issue tracker

Design: `093-applyplan.jpg`. `not found`. Tried: `/plan/timeline`, button "Send to the issue tracker". The button is disabled in the mock (`disabled={!ctx?.tracker}` in `src/features/plan/timeline.tsx`). No route opens it. Source to review: `src/features/work/apply.tsx` (`ApplyFlow`).

- `look` Entry point. Design: the page hangs under People (back link "< People"). App: the button is on Timeline only.

## 14 Plan Estimates

Design: `014-estimates.jpg`. Route: `/plan/estimates`. Capture: `estimates.jpg`. Source: `src/features/plan/estimates.tsx`, `src/features/work/estimate-backlog.tsx`.

- `missing` Task list: features as headings with a day total, one row per task with a bar for its size and a stepper (minus, value, plus). App: a grid with checkbox, drag handle, Role, Days, Percent, Confidence, Ticket columns and a "Columns" button.
- `missing` Right cards "Split" (one bar, days per feature) and "By person" (avatar, name, days).
- `missing` Tab "Costing" and button "New sheet". "Lot: all" button (app: sheet select "MVP 1" and a gear button).
- `look` Buttons in words: "Import from Excel", "Open the seal", "Seal", "Ask an agent to estimate". App: three icon-only buttons (lock, download, gear), and "Ask an agent to estimate" looks disabled.
- `extra` Five KPI tiles (Days, Cost, Price, Margin, Margin %) with "Unrated", search field, filter chips (design, dev, lead, qa, Low confidence, No ticket), count badge "6", primary "+ Task".
- `look` Tab name "Backlog" (design: "Tasks").

## 69 Plan estimate sheets

Design: `069-estsheets.jpg`. Route: `/plan/estimates`, tabs Summary, Spread, Portfolio. Captures: `est-summary.jpg`, `est-spread.jpg`, `est-portfolio.jpg`. Source: `src/features/plan/estimates.tsx`, `src/features/work/sheet-menu.tsx`.

- `look` Summary. Design: one card with a thick bar per feature, an "All" row and a "Not sealed" pill. App: thin gradient bars, a second card "Task" and a table "By profile" with "Unrated" links.
- `missing` The design shows Summary, Spread (week bars) and Portfolio (project, release pill, days) together on one page. App shows one per tab.
- `look` Portfolio. Design: project name, release pill, days. App: a table with raw slugs (`mvp-1`), Cost, Price, Margin in "€0", a Total row and a profile table.
- `extra` KPI tiles row on each tab, warning line "Unrated: design, dev, lead, qa".
- `missing` Header buttons in words: "Lot: all", "New sheet", "Import from Excel", "Export", "Open the seal", "Seal".

## 72 Plan Costing

Design: `072-costing.jpg`. Route: none. No "Costing" tab on `/plan/estimates`. Nearest parts: the KPI tiles, the "By profile" table, the seal bar (`est-seal.jpg`). Source: `src/features/plan/estimates.tsx`, `src/features/work/seal.tsx`, `src/features/work/sheet-menu.tsx` (`ProfileTable`).

- `missing` The view itself: title "What MVP 1 costs", tab "Costing".
- `missing` People card: one row per person with days, "rate a day", "days a week", skills, and an "Agents" row with the spend and a "Spend" button. App: a table by profile (dev, qa, design, lead) with "Unrated" links.
- `missing` Money card: Cost, Margin (editable), Price (large), Currency. App: five tiles, no currency control.
- `missing` Seal card: state pill "Open", one passphrase field, "Lock", "Unlock", note "Sealed sheets cannot change". App: an inline bar in the toolbar with two passphrase fields, "Seal" and a cross.

## 85 Plan one estimate

Design: `085-estimaterow.jpg`. Route: `/plan/estimates`, double click on a task. Capture: `est-row2.jpg`, sheet menu in `est-sheetmenu.jpg`. Source: `src/features/work/estimate-forms.tsx` (`TaskForm`, `SheetForm`), `src/features/work/sheet-menu.tsx`.

- `extra` Right side panel "Task". Design: full page with back link "< Estimates" and the task name as the title.
- `missing` "Best / Likely / Worst" steppers always shown. App: one "Days" field, a unit select and a checkbox "Three-point estimate".
- `look` "How sure: Low / Medium / High" switch (app: select "Confidence: Not set"). Role, Feature as pill buttons (app: text input `dev`, select). Ticket as a link with "Change" (app: empty text field).
- `missing` Card "This is true only if": one block per assumption, field "New assumption" and "Add". App: one text area "Assumptions".
- `missing` Button "Ask an agent to estimate" on the task.
- `missing` Card "Many tasks at once": "3 tasks selected", "Set the role", "Move to a feature".
- `missing` Card "This sheet" with rows Rename, Duplicate, Freeze, Seal, Delete and a line of text each. App: a small menu behind the gear icon (Rename, Duplicate, Freeze, Delete).
- `look` Delete is an unlabelled bin icon next to Save.

## 94 Plan import from Excel

Design: `094-excelimport.jpg`. Route: `/plan/estimates`, download icon button ("Import"). Capture: `est-import.jpg`. Source: `src/features/work/excel-dialog.tsx`.

- `extra` Small modal over a blurred page. Design: full page with back link "< Estimates" and title "Import an estimate from Excel".
- `missing` Three numbered rows: "1. File" with "Choose another", "2. Lot in the file", "3. Name of the sheet in Shipyard". App: file path, a count line and a field labelled "File name".
- `missing` Card "Rows that the file gives" with a "Read" pill and one row per feature with its task count. App: one line "1 features, 2 tasks".
- `missing` Card "Rows that Shipyard refuses" with the row, the reason and "Not imported".
- `missing` Choice card "The sheet … exists": "Make a new sheet", "Replace it", "Cancel". App: "Close" and "Replace mvp-1" only.

## 32 Plan Time

Design: `032-time.jpg`. Route: `/plan/time`. Captures: `time.jpg`, `time-tall.jpg`. Source: `src/features/plan/time.tsx`, `src/features/plan/week-grid.tsx`.

- `look` Header row. Design: week stepper "Week of 16 Nov", person pill, "Fill from my work", "Read the month from the issue tracker", black "Save". App: month stepper and a second week stepper, member select, "Read the month", checkbox "Reduce remaining", gradient "+ Entry", grey text "Missing: Time tracking".
- `missing` Month strip: one square per day of the month, shaded by hours, with "Keep a receipt" and "Lower what is left". App: a calendar card "Hours per day" lower on the page.
- `look` Week grid. Design: ticket name, a wide "Note" field, five day fields (Mon to Fri), "Hours" total, link "Add a ticket". App: ticket ids (`ACME-1`, "No ticket"), seven day fields with placeholder "Hours", no note field, warning triangles next to cells.
- `missing` Rows "Time of the team >" and "Send the hours to the issue tracker" with the "Asks first" pill.
- `missing` "Fill from my work" and "Save" buttons.
- `extra` Four KPI tiles (Duration, To send, In issue tracker, Only in issue tracker) and the entries table with Send, Edit, Delete per row.

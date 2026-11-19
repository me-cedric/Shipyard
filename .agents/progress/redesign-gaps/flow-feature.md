# Gaps: Flow, feature and pull request screens (group b)

Design pictures: `docs/assets/screenshots/redesign/`. Captures: this folder. App: `http://localhost:4190`, mock project, light theme, 1440 px.
Marks: `look`, `missing`, `extra`. The shared shell (sidebar, top bar, Ask bar) is out of scope.
Limit: the mock project has no issue tracker linked. The app has no ticket text, no owner and no ticket fields in this state.

## Repeated in this group

1. `extra` Section switch above the page. Design: the switch (Flow, List, Done, Health or Now, History, Branches, Terminal) is in the title row, at the right. On a feature, a pull request, New feature and the impact pages the design shows no switch. App: the switch is a separate row above every page, also on detail pages. Source: `src/app/router.tsx` (`PlaceLayout`), `src/features/shell/`.
2. `look` Page title. Design: one large bold title (about 44 px), no icon. App: a small title (about 20 px) with a gradient icon tile at its left (Flow, Impacts, Code, Health). Source: the shared page header in `src/ui/`, used by `src/features/flow/flow-page.tsx`, `src/features/code/impacts.tsx`, `src/features/code/now.tsx`, `src/features/code/quality.tsx`.
3. `look` Feature header. Design: a back link "Flow" (or the parent name), then the large title, then a stage line that spans the full width with connectors, all on the page background. App: a white card that holds "Back", a clipboard icon, the ticket key in mono, a small title, a stage row with no connectors packed at the left, and the section switch. Source: `src/features/flow/feature/feature-page.tsx` (`Title`, `Frame`, `FeatureView`).
4. `extra` Ticket key before a title (`ACME-2`) and in story lines ("ACME-2 moved to Working"). Design: no key anywhere, plain sentences ("Work started."). Source: `src/features/flow/feature/feature-page.tsx` (`Title`), `src/features/flow/feature/story.tsx`.
5. `look` Primary button. Design: flat near-black fill, white text, radius about 10 px. App: blue to violet gradient fill. The same gradient is on the selected filter pill ("All") and on progress bars. Source: the button and segmented tokens in `src/ui/`.
6. `look` Cards. Design: white cards with radius about 20 px, no border, soft shadow, 24 px padding, large spacing. App: radius about 8 px, 1 px border, 12 px padding, dense rows with a header bar and a count chip ("Checks 3", "Commits 1", "Diff 2"). Source: the card and panel components in `src/ui/`.
7. `missing` Agent and person avatars. Design: a black square letter tile for an agent (B, P, R) and a round initials chip for a person, on cards, rows and side cards. App: a small chip icon and the recipe name ("Build", "Fix"), or nothing. Source: `src/features/flow/feature-card.tsx` (`Who`), `src/features/flow/feature/side.tsx`, `src/features/flow/feature/agent-card.tsx`.
8. `look` State pills. Design: soft pills with no icon (green Pass, orange Fail, grey None). App: square chips with a dot or a diamond and a border ("CI passing", "Changes requested", "Never run"), or a dot plus right-aligned grey text ("Failing"). Source: the status badge in `src/ui/`, `src/features/code/status.ts`.
9. `look` Text actions. Design: blue text links for the secondary step ("All 10 events", "Open", "Full log", "Open the test plan"). App: outline buttons ("All 10 events", "Requests and sessions", "Open"). Source: `src/features/flow/feature/story.tsx`, `src/features/flow/feature/side.tsx`.
10. `look` Page background. Design: flat pale grey. App: a dotted grid with a violet gradient at the top. Source: shell styles (report to the shell reader).

## 2 Flow

Design: `002-flow.jpg`. Route: `/flow/flow`. Capture: `002-flow.jpg`.

- `extra` "Agents on" switch next to the title. Design: none. Source: `src/features/factory/agents-toggle.tsx`, `src/features/flow/flow-page.tsx`.
- `extra` Second row with "Search runs", a "Ticket" field and "Start run". Design: none on the board. Source: `src/features/flow/flow-page.tsx`.
- `look` The filter All, Needs me, Mine is in the second row. Design: in the title row, left of the view switch. Source: `src/features/flow/flow-page.tsx`.
- `look` "New feature" gradient button at the far right, alone. Design: black "+ New" at the end of the title row. Source: `src/features/flow/flow-page.tsx`.
- `extra` An "Open" button inside each card that needs a person. Design: the whole card is the target, no button. Source: `src/features/flow/feature-card.tsx`.
- `look` Card content order. Design: title, then one line with the avatar and the state pill or the state text. App: the pill first, then the title, then an icon and the recipe name. Source: `src/features/flow/feature-card.tsx`.
- `look` Columns. Design: grey rounded columns that end after the last card. App: columns stretch to the full page height and scroll inside. Source: `src/features/flow/flow-page.tsx`.
- `look` "Add an idea". Design: a dashed tile under the last Idea card. App: a solid button at the bottom of the column. Source: `src/features/flow/flow-page.tsx`.
- `look` Column count in mono type. Design: the count in the text face, grey. Source: `src/features/flow/flow-page.tsx`.

## 3 One feature

Design: `003-feature.jpg`. Route: `/flow/feature/wi%3AACME-2`. Capture: `003-feature.jpg`.

- `missing` Decision card head: the agent tile, "Builder is ready", the question "Send it for review?" and the one-line summary. App: only the action chips ("Change the status of ACME-2", "Open a pull request for ACME-2"), no head, no question. Source: `src/features/flow/feature/story.tsx`, `src/features/flow/feature/stop-card.tsx`.
- `look` Decision buttons. Design: "Not yet" and the black "Send for review" at the right of the question, "Each step" as a blue link at the right of the checkbox line. App: "Approve all", "Each step", "Not yet" in a row at the bottom left. The card has no orange outline in this state. Source: `src/features/flow/feature/story.tsx`.
- `missing` Story card. Design: a white card with the heading "Story", a time column and one sentence per line. App: bare lines on the background, no heading, no times. Source: `src/features/flow/feature/story.tsx`.
- `extra` "Requests and sessions" button under the story. Design: it is in Chat, under "For developers". Source: `src/features/flow/feature/story.tsx`.
- `look` Agent card. Design: label "Agent", the tile, the agent name and the runner, a full-width cost bar with "$1.84 of $3.00" and "Step 3 of 5", then three buttons "Talk to Builder", "Pause", "Stop". App: a state chip "Working", "Talk" plus a chevron menu, four icon rows (step, cost, age "20d 13h", runner). Source: `src/features/flow/feature/agent-card.tsx`.
- `look` Brief, Changes, People side cards. Design: a small grey label, a blue link to the spec, an open question pill, "2 files +5 -2" with a blue "Open" at the right, the owner with an avatar and the role. App: bold headings, an outline "Open" button on its own line, "No spec yet", People shows only the recipe name. Source: `src/features/flow/feature/side.tsx`.

## 10 Feature, Brief

Design: `010-brief.jpg`. Route: `/flow/feature/wi%3AACME-2?section=brief` (no spec), `/flow/feature/change%3Aadd-auth` (with a change). Captures: `010-brief.jpg`, `010b-change.jpg`.

- `missing` Open question card: who asks, the pill "Open question", the question as a heading, answer buttons and a free answer field. App: none in Brief (the question shows in Story only). Source: `src/features/flow/feature/parts.tsx` (`Brief`).
- `missing` "What it must do": one row per requirement with a tick and a test pill, then "Add a requirement", "Edit as text", "Test plan". App: an empty state "No spec yet" with "Write the spec", or the old change editor (file list at the left, form at the right). Source: `src/features/flow/feature/parts.tsx` (`Brief`), `src/features/specs/change-detail.tsx`.
- `missing` Right column: the Design card ("Link a screen", "Design to code"), the Tickets card with "Split into more tickets", the Linked card. App: no right column. Source: `src/features/flow/feature/parts.tsx` (`Brief`).
- `extra` With a change: a second back arrow, a second title with an icon tile and "0/5", warning triangles in the file list, the ref chip `change:add-auth`. Source: `src/features/specs/change-detail.tsx`.

## 11 Feature, Changes

Design: `011-changes.jpg`. Route: `/flow/feature/wi%3AACME-5?section=changes`, `/code/pull-requests/github-demo-142`. Captures: `011-changes.jpg`, `011b-pull.jpg`.

- `look` Merge summary. Design: one card "3 steps before the merge" with three bars (Checks, Comments, Approvals) and a black "Fix with an agent". App: a "Merge status" panel with a header bar, a sentence row, a small "Merge" split button, then the three bars. Source: `src/features/code/merge-box.tsx`.
- `missing` "Fix with an agent" on the merge summary. Source: `src/features/code/merge-box.tsx`.
- `extra` A second title block under the feature header: the pull request title with `#142`, the author, branch chips, "+1 -0", an "Open" chip and a menu. Design: the branch names show once, under the merge button. Source: `src/features/code/pull-header.tsx`.
- `extra` Spec picker "add-auth" with "Archive in this pull request", and the Commits panel with a full commit hash. Design: one link "1 commit, all files". Source: `src/features/code/merge-box.tsx`, `src/features/code/pull-page.tsx`.
- `extra` File tree with "Filter files", "Files: 1", "Expand all", "Collapse all", "0 / 1 viewed". Design: the changed file is open in place with its code, the thread under it, a "Reply" field and "Solved". The full list is on the page "changed files" (screen 90). Source: `src/features/code/pull-files.tsx`.
- `extra` With a run: a "Diff 2" panel above the pull request, so the files show two times. Source: `src/features/factory/runs/run-changes.tsx`, `src/features/flow/feature/parts.tsx` (`Changes`).
- `missing` Right column: the Review card (reviewer, state pill, "Review with an agent", "Write the description"), the Checks card, the merge card (Merge, Squash, Rebase switch, a full-width "Merge", the branch line, "Impact report"). App: one column, no right column. Source: `src/features/code/pull-page.tsx`, `src/features/code/pull-sidebar.tsx`.

## 12 Flow, List

Design: `012-flowlist.jpg`. Route: `/flow/list`. Capture: `012-flowlist.jpg`.

- `extra` The empty state "No issue tracker linked" with "Connect an issue tracker" sits above the list and pushes it down. Design: the list starts under the filters. Source: `src/features/flow/flow-page.tsx`.
- `extra` "Agents on", "Search runs", a "Ticket" field with "Start run", a lone "+" button, "From a ticket", "New change". Design: one field "Bring a ticket by its key" with "Bring", and "+ New". Source: `src/features/flow/flow-page.tsx`, `src/features/flow/list-controls.tsx`.
- `look` Filters. Design: three pill buttons "Owner: all", "Label: all", "Agent: all". App: four native selects "All statuses", "All assignees", "All labels", "All runs". Source: `src/features/flow/list-controls.tsx`.
- `look` Rows. Design: 60 px rows in one rounded card, a coloured stage pill, the avatar with the name, the state at the right (orange pill when a person must act). App: 44 px rows, the stage as plain grey text, an icon with the recipe name, the need as plain text in a fourth column, no right alignment. Source: `src/features/flow/feature-card.tsx` (`FeatureRow`).

## 17 Flow, Health

Design: `017-quality.jpg`. Route: `/flow/health`. Capture: `017-health.jpg`.

- `missing` The top action card "Builder can fix both" with "Show the findings" and "Fix with an agent". The mock has no failing gate, so the capture does not prove its absence in the failing state. Check `src/features/code/quality.tsx`.
- `extra` Four metric tiles (Security score, Scanners run, Findings, Coverage) and an "Export" button in the title row. Design: none; "Security score" and "Export the list of parts (SBOM)" are buttons in the bottom row. Source: `src/features/code/quality.tsx`.
- `extra` A full-width panel "Software parts list (SBOM)". Source: `src/features/code/quality.tsx`.
- `look` Gates. Design: one grid of square tiles, five per row, each with a state icon tile, the name, a pill, "Open" or "Run" and an info button. Checks and scanners are in the same grid, failing ones first with an orange outline. App: two panels "Checks 4" and "Scanners 4" with three wide cards per row, the name in mono, the command line, "Never run" chips, a terminal icon. Source: `src/features/code/quality.tsx`, `src/features/code/quality-live.tsx`.
- `missing` Bottom row "Run all", "Set up the scanners", "Security score", "Export the list of parts (SBOM)", and the card "Commands of the gates" with "Edit". App: "Set up checks" in the panel header, no "Run all" seen. Source: `src/features/code/quality.tsx`, `src/features/code/quality-setup.tsx`.

## 21 Feature, Design

Design: `021-fdesign.jpg`. Route: `/flow/feature/wi%3AACME-2?section=design`. Capture: `021-fdesign.jpg`.

- `missing` The whole section. Design: a Screens card with "Link a Figma screen" and "Design to code", a Diagrams card with "Add a diagram", an agent card ("The code has no ... screen yet", "Not needed", "Build it"), Design tokens, Decisions. App: an empty state "No design cited" with no action. With cited docs the app shows link groups only. Source: `src/features/flow/feature/parts.tsx` (`Design`).

## 22 Feature, Checks

Design: `022-fchecks.jpg`. Route: `/flow/feature/wi%3AACME-5?section=checks`, `/code/pull-requests/github-demo-142?section=checks`. Captures: `022-fchecks.jpg`, `022b-pullchecks.jpg`.

- `missing` The top card "2 of 3 checks fail" with "Run again" and "Fix with an agent". App: one line "CI failing". Source: `src/features/flow/feature/parts.tsx` (`Checks`).
- `missing` The first line of the error and "Full log" under a failing check. App: the check name as a link and "Failing". Source: `src/features/flow/feature/parts.tsx` (`Checks`).
- `missing` The Test plan card (scenarios with pills, "Open the test plan"). Source: `src/features/flow/feature/parts.tsx` (`Checks`).
- `missing` "Quality gates of this change" with the rows "Secrets, code scan, dependencies" and "Docs that this change makes stale". App: only the row "Impacts on other code", as a separate card. Source: `src/features/flow/feature/parts.tsx` (`Checks`).
- `extra` A "Gates 5" panel with the recipe steps (Grill, Plan, Build, Review, Pr). Design: none in Checks; the recipe is in Chat. Source: `src/features/flow/feature/parts.tsx` (`Checks`).
- `look` One column, full width. Design: two columns. Source: `src/features/flow/feature/parts.tsx` (`Checks`).

## 23 Feature, Chat

Design: `023-fchat.jpg`. Route: `/flow/feature/wi%3AACME-2?section=chat`. Capture: `023-fchat.jpg`.

- `missing` The whole section. App: a blank page under the header, no message, no composer, no empty state. `Chat` skips the empty state when the feature has a ticket key, and then draws nothing in the mock. Design: message bubbles with agent tiles, an approval in a bubble ("Reject", "Approve"), "Show the change", a typing row, a composer with "+", "Stop", "Send". Source: `src/features/flow/feature/parts.tsx` (`Chat`, line 286).
- `missing` Right column: the Recipe card with the steps, and "For developers" with "Live terminal of this agent", "Requests and cost", "All 10 events". Source: `src/features/flow/feature/parts.tsx` (`Chat`).

## 24 Feature, plan review

Design: `024-fplan.jpg`. Route: `/flow/feature/wi%3AACME-4`. Capture: `024-fplan.jpg`.

- `extra` The section switch (Story, Brief, ...). Design: none in the plan review. Source: `src/features/flow/feature/feature-page.tsx`.
- `look` Plan card. Design: an orange outline, the Planner tile with "has a plan", the heading "Is this plan right?", numbered step rows each with an edit button. App: a plain card with the plan as rendered Markdown (a paragraph and bullet lists), no heading, no step rows, no edit. Source: `src/features/flow/feature/parts.tsx` (`PlanReview`), `src/features/flow/feature/story.tsx`.
- `look` Decision row. Design: inside the card: "What to change", "Send back", black "Approve the plan". App: "Approve plan" is in the right side card; "Note" and "Reject plan" are outside the card, under it. Source: `src/features/flow/feature/parts.tsx` (`PlanReview`), `src/features/flow/feature/agent-card.tsx`.
- `missing` The link "Files that the plan changes". Source: `src/features/flow/feature/parts.tsx` (`PlanReview`).
- `missing` Side cards "After you approve" (next agent, cost bar, step) and "Agent may do alone" (Push the branch, Open the pull request, Move the ticket, each "Asks first", "Change in Setup"). App: the agent card, Brief and Changes. Source: `src/features/flow/feature/side.tsx`.
- `extra` The pill "! Needs you" in the stage row, the raw log line "the plan waits for a person" and the story lines. Design: the stage dot only. Source: `src/features/flow/feature/feature-page.tsx`, `src/features/flow/feature/story.tsx`.

## 25 New feature

Design: `025-newfeature.jpg`. Route: `/flow/new`. Capture: `025-newfeature.jpg`.

- `missing` The back link "Flow". Source: `src/features/flow/new-feature.tsx`.
- `look` The question is a small bold label. Design: the large page title. Source: `src/features/flow/new-feature.tsx`.
- `look` The text box is about 65 px high. Design: about 160 px. Source: `src/features/flow/new-feature.tsx`.
- `look` Kind. Design: three separate pills, the selected one blue. App: one grey segmented control. Source: `src/features/flow/new-feature.tsx`.
- `look` Who writes the spec. Design: three large cards with an avatar tile and a bold label, the selected one with a blue outline. App: one grey segmented control. Source: `src/features/flow/new-feature.tsx`.
- `missing` "Add a document". Source: `src/features/flow/new-feature.tsx`.
- `missing` The "Limit" field ("$3.00") next to the recipe. Source: `src/features/flow/new-feature.tsx`.
- `look` Recipe. Design: an inline label and a pill select. App: a label above a native select that shows a raw id ("bootstrap"). Source: `src/features/flow/new-feature.tsx`.
- `look` "Create". Design: a large black button. App: a small gradient button, washed out while disabled. Source: `src/features/flow/new-feature.tsx`.
- `missing` Ticket rows with a kind pill and "Start an agent" above "Find a ticket". App: only the field. The mock has no ticket, so the rows are not proven absent. Source: `src/features/flow/new-feature.tsx`.

## 26 Ticket

Design: `026-ticket.jpg`. Not found.

Tried: `/flow/feature/wi%3AACME-9` (Story), `/flow/feature/wi%3AACME-9?section=brief` (shows "No spec yet"), `/flow/list` then "From a ticket" (an empty select), "Connect an issue tracker" (opens `/setup/project?page=connections`). The mock project has no issue tracker, so `TicketDetail` draws nothing. Captures: `026-ticket-brief.jpg`, `026-fromticket.jpg`, `081b-blocked.jpg`.

Gaps seen without ticket data:

- `missing` The fields column (Kind, Owner, Release, Estimate, Due, Priority, Labels, Linked spec, Recipe, "Give it to agents", "Agents may pick it up") as one card of rows at the right of the feature page. The app puts ticket fields in Brief (`TicketDetail`) and in the list rows (`TicketFacts`). Source: `src/features/work/ticket-detail.tsx`, `src/features/flow/ticket-facts.tsx`, `src/features/flow/feature/parts.tsx` (`Brief`).
- `missing` "Edit the title" in the title row, the Ticket card ("Edit the text", "Open in the issue tracker"), the Comments card, the pill "In sync with the issue tracker". Source: `src/features/work/ticket-detail.tsx`.
- `look` Blocked stage. Design: an orange dot and the label "Build, blocked". App: a blue dot and a separate pill "x Blocked". Source: `src/features/flow/feature/feature-page.tsx`.
- `look` Blocked card. Design: the agent tile with "Builder cannot go on", the cause as a heading, "Answer to Builder", "Take it over", "Unblock" in one row. App: a pill "Blocked", the cause, "Last lines", a line of attempt counts, a field, then "Reply on the ticket" and "Unblock" on the next row; no "Take it over". Source: `src/features/flow/feature/stop-card.tsx`.
- `extra` The section switch. Design: none on the ticket page. Source: `src/features/flow/feature/feature-page.tsx`.

## 50 Feature, Impacts

Design: `050-impacts.jpg`. Route: `/flow/impacts`, and Checks then "Impacts on other code". Captures: `050-impacts.jpg`, `050b-checks-impacts.jpg`.

- `missing` The whole design layout. Design: the back link "Checks", the feature title, the heading "What this change touches", "Compare My changes with main", an action card ("2 docs go stale with this change", "Full impact report", "Show the 2 docs", "Fix the stale docs with an agent"), three columns (Files changed, Code that depends on them, Specs and docs that go stale), and "Features that share these files". App: the old Impacts page: Docs chain, Delivery notes, Past reports, Assignments at the left; Axes with seven bars, Stale refs, Actions, Digest at the right; a branch select and "Analyze". Source: `src/features/code/impacts.tsx`.
- `extra` The Axes panel with mono levels ("low", "none") and the "Analyze" button. Source: `src/features/code/impacts.tsx`.
- `look` At `/flow/impacts` the page has no feature title and no back link. Source: `src/app/router.tsx`, `src/features/code/impacts.tsx`.

## 53 Code, Pull requests

Design: `053-pullrequests.jpg`. Route: `/code/now` (the list is under the commit area). Capture: `053-codenow.jpg`.

- `look` The list is the lower half of Now, under the staged files, the diff, the commit box and Stashes. Design: a page of its own with the back link "Code" and the title "Pull requests". Source: `src/features/code/now.tsx`, `src/features/code/pull-requests.tsx`.
- `missing` The right review panel: the selected pull request, the branch line, Approve, Ask for changes, Comment, a Message box, "Submit review", the Reviewer card ("Review with an agent", "Write the description"), "Open on the code host". App: no selection, a row opens the pull request page. Source: `src/features/code/pull-requests.tsx`, `src/features/code/submit-review.tsx`, `src/features/code/agent-review.tsx`.
- `look` Rows. Design: 68 px rows with the author avatar, the title and one pill. App: 45 px rows with `#42`, two chips (CI, review), a "Draft" chip and a mono date. Source: `src/features/code/pull-lists.tsx`.
- `look` Groups. Design: three cards "Open, 4", "Merged" with "All merged pull requests", "Closed". App: one "Open 9" panel with a tinted header, and one folded line "Merged and closed". Source: `src/features/code/pull-lists.tsx`.
- `look` Button label. Design: "New pull request", black, next to the filter. App: "+ Open pull request", gradient, in the heading row. Source: `src/features/code/pull-requests.tsx`, `src/lib/i18n/code.ts`.
- `extra` Two tiles "Product health" and "Files" under the list. Source: `src/features/code/now.tsx`.

## 67 Flow, Done

Design: `067-done.jpg`. Route: `/flow/done`. Capture: `067-done.jpg`.

- `extra` Two lists. App: a "Finished" feature list, then a runs table (Ticket, State, Workflow, Steps, Cost, Ended, Pull request) with a "Columns" button. Design: one list with the columns Feature, End, Who, Cost. Source: `src/features/flow/flow-page.tsx`.
- `missing` The end filter All, Merged, Done, Failed, Cancelled. App: All, Needs me, Mine only. Source: `src/features/flow/flow-page.tsx`.
- `missing` "Start again" on a failed row. Source: `src/features/flow/flow-page.tsx`.
- `look` Search. Design: "Find a finished feature". App: "Search runs", plus the "Ticket" field, "Start run" and "Agents on". Source: `src/features/flow/flow-page.tsx`.
- `look` The table is an old dense grid with the key in mono, step counts in mono and a tall empty frame. Design: 60 px rows in one rounded card, an end pill, the avatar with the name. Source: `src/features/flow/flow-page.tsx`.

## 73 Feature, impact report

Design: `073-impactplan.jpg`. Not found as a page of its own.

Tried: `/flow/impacts`, and Checks then "Impacts on other code" on `/flow/feature/wi%3AACME-5?section=checks`. Both show the old Impacts page; no link "Full impact report" or "Impact report" exists (no match in `src/`). Capture: `050b-checks-impacts.jpg`.

- `missing` The report page: the back link "What this change touches", "Past reports", "Write the report again", "Copy the brief", five size tiles (Code, Specs, Docs, Tests, People), the Action plan with a checkbox and an owner per line and "Add a line", the Digest card, the Delivery notes card with "Copy". App: the same data is spread in the old page (Actions list, Assignments with "Copy brief", Digest, Past reports, Delivery notes). Source: `src/features/code/impacts.tsx`, `src/features/code/assignments.tsx`, `src/features/code/delivery-notes.tsx`.

## 74 Code, new pull request

Design: `074-newpull.jpg`. Steps: `/code/now`, then "Open pull request". Capture: `074-newpull.jpg`.

- `look` A small modal dialog over a blurred page. Design: a full page with the back link "Pull requests" and the title "New pull request", two columns. Source: `src/features/code/open-pull.tsx`.
- `missing` The rows Into (shown as a pill), Draft (a switch), Labels, Reviewers, Merge with (Merge, Squash, Rebase). App: a free "Base" field, three bare label words (feat, bug, docs), the word "Draft" with no visible switch. Source: `src/features/code/open-pull.tsx`.
- `missing` The card "Before the push" (uncommitted files with "Commit them" and "Leave them"; the base ahead with "Update my branch" and "Push as it is"). Source: `src/features/code/open-pull.tsx`, `src/features/code/push-target.tsx`.
- `missing` The card "1 doc goes stale" with "Update it" and "Leave it, because". Source: `src/features/code/open-pull.tsx`, `src/features/code/docs-update.tsx`.
- `missing` The card "This project is only on this computer" with "Publish to the code host". Source: `src/features/code/open-pull.tsx`, `src/features/code/origin-panel.tsx`.
- `missing` "Close the pull request" and "Mark as ready". Source: `src/features/code/open-pull.tsx`.
- `look` "Write with an agent" is above the title field. Design: "Write it for me" at the right of the Description label. Source: `src/features/code/pr-ai.tsx`.

## 81 Feature, when an agent stops

Design: `081-runactions.jpg`. Routes: `/flow/feature/wi%3AACME-6` (limit), `/flow/feature/wi%3AACME-1` (question), `/flow/feature/wi%3AACME-9` (blocked). Captures: `081c-budget.jpg`, `081a-question.jpg`, `081b-blocked.jpg`. The picture shows all stop cards side by side; the app shows one per feature.

- `extra` The line "The run stopped. The log gives no reason." as the heading of the limit card and of the question card. Design: the amount ("$3.04 of $3.00") or the question is the heading. Source: `src/features/flow/stop-action.ts`, `src/features/flow/feature/stop-card.tsx`.
- `extra` A "Message to the agent" field on the limit card, and a second cost bar. Design: the stepper and "Add budget" only. Source: `src/features/flow/feature/stop-card.tsx`.
- `look` Limit card. Design: the stepper and a wide black "Add budget" fill the card width. App: both small, at the left. Source: `src/features/flow/feature/stop-card.tsx`.
- `look` Question card. Design: the question, one "Answer" field and "Reply". App: a nested bordered box with an "Open" chip, numbered radio options and "Send", plus a "Reply" button outside the box. Source: `src/features/flow/feature/stop-card.tsx`.
- `extra` A second card under the question card ("Post a comment on ACME-1", "Do not ask again", "Approve", "Each step", "Not yet"). Design: one decision at a time. Source: `src/features/flow/feature/story.tsx`.
- `missing` The card "Reply on the ticket" with the pill "Goes to the issue tracker" and "Send". App: a button "Reply on the ticket" in the blocked card only. Source: `src/features/flow/feature/stop-card.tsx`.
- `missing` The two link rows "Blocked: the agent cannot go on" and "Stopped and cancelled features". Source: `src/features/flow/feature/story.tsx`.
- Not captured: Failed ("What happened", "Try again"), Finished outside Shipyard ("Keep it open", "Close as done"), Paused by a person ("Stop it", "Resume"). No mock feature is in these states on the board.

## 90 Feature, changed files

Design: `090-pullfiles.jpg`. Steps: `/code/pull-requests/github-demo-142?tab=files`, then "Expand all". Capture: `090-pullfiles.jpg`.

- `look` Not a page of its own. Design: the back link "Changes", the title, then the files. App: the file list is the bottom of the Changes section, under the header, the merge panel and Commits. Source: `src/features/code/pull-page.tsx`, `src/features/code/pull-files.tsx`.
- `extra` The file tree column with "Filter files". Design: one "Find a file" field at the right of the progress bar. Source: `src/features/code/pull-files.tsx`.
- `look` Progress. Design: "1 of 3 seen" with a wide bar at the left. App: "0 / 1 viewed" with a short bar at the right, plus "Files: 1" and "Collapse all". Source: `src/features/code/pull-files.tsx`.
- `look` File row. Design: a checkbox with the word "Seen" at the left, the path, "+1" or an "Open" button at the right. App: a chevron, an "M" badge, the path in small mono, a comment chip, "+1 -0", an unlabelled checkbox at the right. Source: `src/features/code/pull-files.tsx`.
- `look` Diff. Design: one line-number column, no hunk header. App: two line-number columns and the raw header `@@ -1,2 +1,3 @@`. Source: `src/features/code/viewer.tsx`.
- `look` Comments. Design: one field "Comment on this file" with "Send" under the code. App: a thread box inside the diff with the file and line, dates, "Reply" and "Resolve". Source: `src/features/code/pull-thread.tsx`, `src/features/code/inline-comment.tsx`.
- `missing` The picture file view with Before and After side by side. Not proven: the mock has no picture file. Source: `src/features/code/preview.tsx`.

## 97 Feature, files of the change

Design: `097-changefiles.jpg`. Steps: `/flow/feature/change%3Aadd-auth`, then "Spec / sessions". Capture: `097-changefiles.jpg`.

- `look` Not a page of its own. Design: the back link "Brief" and the feature title. App: the editor sits inside Brief, under the feature header, with a second title and a second back arrow. Source: `src/features/specs/change-detail.tsx`, `src/features/flow/feature/parts.tsx` (`Brief`).
- `look` File switch. Design: a horizontal switch Proposal, Spec, Plan, Checklist, Tasks. App: a left list with warning triangles and names such as "Spec / sessions". Source: `src/features/specs/change-detail.tsx`.
- `look` Progress. Design: "3 of 5 files done" with a bar at the right of the title. App: "0/5" in mono next to a faint bar. Source: `src/features/specs/change-detail.tsx`.
- `look` Actions. Design: "Check", "Archive" and the black "Next step: split into tickets" in the title row. App: "Validate", "Split into work items", "Archive", "Save" inside the editor header, next to the file name and the ref chip. Source: `src/features/specs/change-detail.tsx`.
- `look` Reading. Design: a card with a state pill ("Draft"), a Read and Text switch and "Edit"; the spec shows as sentences. App: a form with Title, Purpose and a Requirements box that shows raw Markdown (`###`, `**WHEN**`). The switch is Form and Text. Source: `src/features/specs/change-detail.tsx`.
- `missing` Right column: "State of each file" with a pill per file, "Open markers" with "Go to it", "With no link" with "Link it", "Problems found". Source: `src/features/specs/change-detail.tsx`.

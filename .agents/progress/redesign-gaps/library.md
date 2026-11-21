# Library group: gaps between the design and the built app

Design pictures: `docs/assets/screenshots/redesign/`. Captures: this folder (`<name>.jpg`). App at `http://localhost:4190`, mock data, light theme, 1440 by 900.
Tags: `look`, `missing`, `extra`.

Result: 0 screens match. 20 screens have gaps. 4 screens are not found as a page of their own (75, 77, 86, 95 exist only as a part of another page, see each section).

## Repeated in this group

Only the home of Library (6) and Reports (71) were rebuilt. Each other page is the old tab view with a back link on top.

1. `look` Page title. Design: a large bold title (about 44 px), no icon, no count. App: a gradient icon square, a 20 px title and a count badge. Source: `src/ui/molecules/page-header.tsx`, `src/ui/templates/list-detail.tsx`.
2. `look` Cards. Design: white cards, radius about 20 px, no border, soft shadow, 24 px padding, bold 15 to 20 px text. App: thin bordered panels, radius about 8 px, dense 13 to 14 px text. Source: `src/ui/templates/list-detail.tsx`, `src/features/design/tab.tsx`, `src/features/knowledge/list-tab.tsx`, `src/ui/molecules/panel.tsx`.
3. `look` Primary action. Design: a black pill button, top right, with a plain verb label ("New change", "Ask for a change", "New decision"). App: a purple gradient button with a plus sign and a noun ("+ Model", "+ ADR", "+ Contract", "+ Table", "+ Screen"). Source: `src/features/design/tab.tsx`, `src/features/knowledge/list-tab.tsx`, each page file.
4. `extra` Ref chips and file chips. Design: no ref token on the page (one `spec:export` row with Copy on Map only). App: a mono ref chip with a status dot, a copy icon and a file name chip in each detail header (`model:system`, `adr:0001`, `doc:docs/...`, `system.c4`). Source: `src/ui/molecules/ref-chip.tsx`, `src/features/design/tab.tsx`, `src/features/knowledge/list-tab.tsx`.
5. `extra` Full-width "Search" row under the header on Architecture, Decisions, API, Data, Flows, Screens, Handbook, Documents, Slides. Design: no search, or one small "Find a ..." field in the list column or the header. Source: `src/ui/templates/list-detail.tsx`.
6. `look` List column. Design: one white card for each item, the selected card with a blue outline and a light blue fill, status pills under the name. App: one bordered box with flat rows, the selected row with a lilac fill. Source: `src/ui/templates/list-detail.tsx`.
7. `look` Mode switch (Read/Text, Picture/Both/Text, Form/Text). Design: in the page header row or the detail card header, beside an "Edit" button. App: a row of its own under the detail header, a greyed "Save" button, no "Edit". Source: `src/features/design/tab.tsx`, `src/features/specs/file-editor.tsx`, `src/features/knowledge/list-tab.tsx`.
8. `missing` Right column of linked cards ("Linked", "Used by", "Linked to", "Other test plans"). App has none; links show only as ref chips or a "Backlinks" box. Source: each page file.
9. `missing` Agent actions as named buttons ("Ask for a change", "Draw it for me", "Write the scenarios for me", "Ask an agent to update it", "Write a spec from the code"). App has "Generate scenarios" and "Build a tile for me" only.
10. `look` Page names. Design: Specs, Project rules, Map, Network flows, "N open questions", "Learn this project". App: Capabilities, Constitution, Graph, Flows, Questions, Learn. Source: `tabLabel` in `src/features/shell/spaces.ts` and `src/lib/i18n/en.ts` (and the other locales).
11. `look` Background. Design: flat pale grey. App: dotted grid with a lilac gradient at the top. Belongs to the shell reader; noted once.

## 6 Library

Design: `006-library.jpg`. Route: `/library/home`. Capture: `home.jpg`.

- `missing` "Pinned" card with a pinned page and "Unpin". Source: `src/features/library/library-home.tsx` (`src/features/knowledge/pinned.tsx` exists).
- `missing` "Opened last" card: rows with a kind pill, a name, "Pin" and a chevron. Source: `src/features/library/library-home.tsx`.
- `missing` Chips "What is tested", "Answers", "Glossary". Source: `DOORS` in `src/features/library/library-home.tsx`.
- `look` Chip labels: design "Specs", "Map", "Network flows", "Project rules", "Learn, 0 of 10". App: "Capabilities", "Graph", "Flows", "Constitution", "Learn". The app also shows both "3 open questions" and "Questions"; the design shows one chip.
- `look` Chip order in door 1: design puts the attention chip last; app puts it first.
- `look` Door title: design about 30 px bold; app 16 px semibold. Door icon tile: design 56 px; app 48 px. Door height: design equal 275 px cards; app cards shrink to content. Source: `src/ui/molecules/door.tsx`.
- `look` Icons: design uses a hierarchy icon (How) and scales (Why); app uses a share icon and two arrows.

## 15 Library, Map

Design: `015-map.jpg`. Route: `/library/graph` (Knowledge). Capture: `graph.jpg`.

- `look` Design: six light group cards (Specs, Decisions, Features, Questions, Architecture, Glossary) with white name chips and "N more" chips. App: a black canvas with a force graph of small dark nodes and lines. Source: `src/features/knowledge/graph.tsx`, `src/ui/organisms/graph-canvas.tsx`.
- `missing` Right column: selected item card (kind pill, name, "Open", "Explain"), "Linked to" card, ref row with "Copy". The app shows nothing until a node is opened.
- `extra` Search field, 14 kind filter chips with counts, zoom buttons, a pane toggle icon.
- `look` Knowledge/Code switch: design at the top right; app beside the title.

## 16 Library, Architecture

Design: `016-reader.jpg`. Route: `/library/architecture`, then "Both". Captures: `architecture.jpg`, `arch-both.jpg`.

- `look` Design: full-width reader, picture left and text right, model names as chips ("system", "New model") under the title. App: list column plus detail; in "Both" the text is left and the picture right. Source: `src/features/design/architecture.tsx`, `src/features/design/tab.tsx`.
- `missing` "Edit" and "Ask for a change" buttons in the header.
- `look` Picture: design draws white and blue rounded nodes with a label pill on a grey panel. App draws grey outlined boxes with 10 px text and a "Landscape view" caption.
- `look` Default mode: design "Both"; app "Picture". The first capture of "Picture" was empty at 400 ms (not checked if this is load time or a defect).
- `extra` Line numbers and syntax colour in the text pane, four zoom buttons (design has three).

## 33 Library, Specs

Design: `033-specs.jpg`. Route: `/library/capabilities`, then click `auth`. Captures: `capabilities.jpg`, `cap-detail.jpg`.

- `look` Design: one page with the spec list left and the open spec right. App: a grid of small cards with a progress bar, then a second page with a "Back" button. Source: `src/features/specs/capabilities.tsx`.
- `missing` Header buttons "Check against the code", "Write a spec from the code", "New change".
- `missing` Requirement rows with a tick circle and a state pill ("Built, tested", "Not built"). App shows a table Id / Requirement / Backlinks.
- `missing` Cards "Changes in progress" (with "Archive"), "Linked", "Check the specs" (Syntax, Links, "Check").
- `missing` "1 open question" pill on a spec card; Read/Text/Files switch with "Edit" (app has Read/Text and tabs Spec/Plan/Checklist/Tasks).
- `extra` Two back controls stacked ("Library" and "Back"). Requirement ids (`REQ-001`) in mono.

## 34 Library, Questions

Design: `034-questions.jpg`. Route: `/library/questions`. Capture: `questions.jpg`.

- `look` Design: title "3 open questions"; open items as large cards with an orange outline on top; closed items as rows in one "Closed" card. App: one grid of equal small cards, open and closed mixed. Source: `src/features/specs/questions.tsx`, `src/ui/molecules/question-card.tsx`.
- `missing` Inline "Answer" field and "Answer" button on each open card.
- `missing` "Add the answer to the spec" button on an answered row.
- `look` Filters: design has one row of kind chips (All, Questions, Risks, Assumptions, Dependencies, Decisions, Issues, Mine). App has a search field and three dropdowns (kinds, statuses, owners).
- `extra` Ids (`Q-012`) in mono, coloured top border, lowercase kind and status tags. "Export" sits in the filter row; the design puts it in the header.

## 35 Library, Test plan

Design: `035-testplan.jpg`. Route: `/library/test-plans`, click `Login`, click "Open the plan". Captures: `test-plans.jpg`, `plan-open.jpg`, `plan-detail.jpg`.

- `look` Design: the page opens on one plan ("Test plan: export") with scenario cards left and two cards right. App: opens on a summary (four stat tiles, accordion rows, "Scenario lint"); the plan is two clicks deep. Source: `src/features/specs/test-plans.tsx`, `src/features/specs/plan-board.tsx`.
- `missing` Header buttons "What is tested", "Add a scenario", "Write the scenarios for me", "Run"; the pill "The text has no errors".
- `missing` On each scenario card: a result pill (Pass, Not run) and "Edit". App cards show a raw tag (`@spec:auth#REQ-001`).
- `missing` Right cards "Requirements" (Tested, No test yet) and "Other test plans".
- `look` Plan detail in the app is a narrow centred column with no title; a loose ref chip sits at the bottom left.

## 36 Library, Project rules

Design: `036-rules.jpg`. Route: `/library/constitution`. Capture: `constitution.jpg`.

- `look` Design: one numbered card for each rule. App: a markdown document with headings and bullets in one panel. Source: `src/features/specs/constitution.tsx`.
- `missing` "Add a rule" button; black "Edit" button (app has a Read/Edit switch).
- `missing` Right cards "Who can change the rules" (with "Change the rights"), "Who follows the rules", "Earlier versions".
- `extra` File path chip `docs/openspec/constitution.md`; lock icon in the header.

## 37 Library, Decisions

Design: `037-decision.jpg`. Route: `/library/decisions`. Capture: `decisions.jpg`.

- `missing` Approval block on a proposed decision: "Grace proposes", a "Reason" field, "Refuse" and "Accept", orange outline. App shows an editable form (Title, Status dropdown, People, two text areas). Source: `src/features/design/decisions.tsx`.
- `look` Design shows Context, Decision, Consequences as read-only grey blocks. App shows input fields; it has no Consequences field.
- `look` The proposed decision is first in the design list with "Waits for you". App keeps number order and opens `0001`.
- `missing` "Used by" card. Pill "No spec uses it" (app shows "Unused").
- `extra` Timeline dots and line, ids and dates in mono, a stray "Unused" filter label under the title.

## 38 Library, Diagrams

Design: `038-diagrams.jpg`. Route: `/library/diagrams`. Capture: `diagrams.jpg`.

- `look` Design: grid of preview cards (picture, name, format pill) plus a right column for the selected one. App: opens in List mode with the Excalidraw editor embedded in the detail panel. Source: `src/features/design/diagrams.tsx`.
- `missing` Format buttons "New: Excalidraw, draw.io, Mermaid, BPMN" (app has one "+ Diagram"). "Draw it for me".
- `missing` Right column: "Open" and "Edit", card "In the open diagram" (Zoom, Fit the window, Change the format, Ask for a change), card "Used by".
- `look` Grid/List switch: design defaults to Grid at the top right; app defaults to List beside the title.

## 39 Library, API

Design: `039-api.jpg`. Route: `/library/api`. Capture: `api.jpg`.

- `look` Design: left list holds the endpoints (method pill and path); the right shows one endpoint. App: left list holds contract files; the right lists all endpoints as thin rows. Source: `src/features/design/api.tsx`.
- `missing` Endpoint detail: summary title, parameter row with value pills, link to the feature.
- `missing` "Try it" card (value switch, "Server address", "Send", dark answer box).
- `missing` Picture/Text switch, "Edit", "Ask for a change", the `openapi.yaml` row.

## 40 Library, Data

Design: `040-data.jpg`. Route: `/library/data`. Capture: `data.jpg`.

- `look` Design: left list holds the tables (name, column count) and a file button; the right is a grey canvas with table cards (blue header, "Key" and "Link" pills) and zoom buttons. App: left list holds model files; tables are small grey boxes with types and "PK"; relations are text lines. Source: `src/features/design/data.tsx`.
- `missing` "Find a table", zoom and fit buttons, "Edit", "Ask for a change".
- `look` Picture/Both/Text switch: design in the header; app in the detail panel.

## 41 Library, Network flows

Design: `041-flows.jpg`. Route: `/library/flows`. Captures: `flows.jpg`, `flows-bricks.jpg`.

- `look` Design: a plain list From / To / Why with a line between the two ends and a sentence. App: the full technical table (source, destination, VLAN, subnet, protocol, port, action) with edit and delete icons. Source: `src/features/design/flows.tsx`, `src/ui/organisms/flow-matrix.tsx`.
- `missing` Card "Bricks and hosts" (small grid, "Open the full matrix"). Card "Linked" (Architecture, Connections in Setup).
- `look` Header: design has Flows/Bricks switch, "Edit as text", "Add a flow". App has "+ Table" in the header, "Export" under the title, the switch and "+ Flow" inside the panel.
- `extra` File list column with one item (`network`), three "All" dropdowns.

## 42 Library, Screens

Design: `042-screens.jpg`. Route: `/library/screens`. Capture: `screens.jpg`.

- `look` Design: grid of screen preview cards with "Built" or "Not built". App: a text list (Design doc, Home, Checkout) and an empty detail panel ("No tokens yet"). Source: `src/features/design/screens.tsx`.
- `missing` Banner "Figma is not connected" with "Not now" and "Connect Figma" (`src/features/design/figma-panel.tsx` does not show).
- `missing` Screens/Tokens switch, "Add a screen", "Design to code".
- `missing` Right cards "Colours" and "Type sizes" with "All tokens" (`src/features/design/tokens.tsx`).
- `extra` "Broken link" tag, Picture/Both/Text switch on the design doc.

## 43 Library, Handbook

Design: `043-handbook.jpg`. Route: `/library/handbook`. Capture: `handbook.jpg`.

- `look` Design: page tree with page and folder icons in a card. App: text groups "architecture (1)", "operations (1)" with no icons. Source: `src/features/knowledge/pages.tsx`, `src/features/knowledge/list-tab.tsx`.
- `missing` "Manual of Shipyard" card with the `F1` key.
- `missing` Footer of the page: "Grace changed this page", "History", "Ask an agent to update it".
- `look` "Pages that link here": design puts it as a card under the tree. App puts a "Backlinks" box under the text.
- `look` Search: design "Find a page" in the header. App: a full-width row.

## 44 Library, Documents

Design: `044-documents.jpg`. Route: `/library/documents`. Capture: `documents.jpg`.

- `extra` Four stacked rows before the content: "Export", "Search in the text", three download buttons (Architecture dossier, Functional documentation, Quality sheet), "Search". The design moved these to Reports. Source: `src/features/knowledge/documents.tsx`, `src/features/knowledge/documents-parts.tsx`.
- `look` Detail header breaks: the title is cut ("Client bri..."), the Read/Both/Text switch wraps to two lines. Design has Read/Text and "Edit".
- `missing` Format pill on each list card (Markdown, Word, PDF). "Add a file".
- `missing` Cards "Planner can use this document" ("Turn into slides", "Turn into a spec") and File ("Show in folder", "Download as Word, PDF").
- `extra` "Rename" and "Delete" in the detail header.

## 45 Library, Slides

Design: `045-slides.jpg`. Route: `/library/slides`, click `Kickoff`. Captures: `slides.jpg`, `deck.jpg`.

- `look` Design: deck cards left and the open deck right in one page. App: a grid of decks; a click switches to a list, an empty slide area and the Inspector pane. Source: `src/features/knowledge/slides.tsx`.
- `missing` Slide stage with "1 of N" pager, thumbnail strip, "Speaker notes".
- `missing` "Edit", "Export PDF", "Planning slide", "Costing slide", "Turn into a web deck", "Make a deck from a document". App has "Convert" and "Present".
- `missing` "N slides" line on the deck card (app shows a small count badge on one card only).

## 46 Library, Learn

Design: `046-learn.jpg`. Route: `/library/learn`. Capture: `learn.jpg`.

- `look` Path steps: design is one card with slim rows (number circle, name, kind pill, stage pill). App draws one bordered box for each step with a ref chip. Source: `src/features/knowledge/learn.tsx`, `src/features/knowledge/learn-paths.tsx`.
- `missing` "Start" on the current step; the stage pills (Reading, Course, Certification); a highlighted current step.
- `missing` Cards "Experts" and "Team progress". Header: person picker and "New path". "Add a word" in Glossary.
- `look` Progress: design "0 of 10" with a wide bar on top. App "0/10" with a short bar at the right.
- `extra` Ref chips in each step and each glossary word; feed dates in mono and feed summaries. Kind names "ADR", "Model" (design: "Decision", "Architecture").

## 47 Library, Dashboards

Design: `047-dashboards.jpg`. Route: `/library/dashboards`. Capture: `dashboards.jpg`.

- `missing` Dashboard switch Delivery / Quality / Agents / Reports. App has one dashboard and "New dashboard". Source: `src/features/knowledge/dashboards.tsx`.
- `missing` Milestone picker ("MVP 1"), "Edit", "Export the report". Card "More numbers" (Spend of the agents, Quality gates, Plan and load of people).
- `extra` Six edit icons on each tile in read mode (move left, move right, settings, remove, width, lock). The design shows them only in edit mode. Source: `src/ui/organisms/tile-card.tsx`.
- `extra` "Everyone" dropdown, "Add tile" in read mode. Greyed tile "Source off: quality".
- `look` "Build a dashboard for me" is the black primary button in the design. App: an outlined "Build a tile for me".
- `look` Tile: design is a bold title over a chart area of fixed height. App tiles differ in height and show a number, a sparkline and bars.

## 71 Library, Reports

Design: `071-reports.jpg`. Route: `/library/reports`. Capture: `reports.jpg`.

- `missing` Card "Written for you" with three rows (Architecture dossier, Functional documentation, Quality sheet), each with a date, "Open" and "Write it". App shows them as plain export cards. Source: `src/features/reports/reports-page.tsx`.
- `missing` Link rows "Dashboards" and "Pages that link to a report".
- `look` Format switch: design PDF / Word / Excel / Markdown. App: All / Word / Excel / Picture.
- `look` "Change request" card: design has "Fill the form" and "Export". App has "Fill the form" only. "Work done": design "Export"; app "Fill the form".
- `look` Card set: design has 10 (with Costing, Timeline picture). App has 14 (adds Gantt chart, Image (PNG), Sheet workbook with "Open Plan" or "Open Estimates" buttons; no Costing). Names differ: "Dossier" / "Complete dossier", "Questions and risks" / "RAID register", "Estimate workbook" / "Estimates".
- `extra` Header icon square.

## 75 Library, Map of the code

Design: `075-codemap.jpg`. Not found as designed. Tried `/library/graph`, then button "Code". Capture: `graph-code.jpg`.

- `look` Design: folder cards, file cards inside, symbol chips inside. App: the same black canvas with three large folder nodes. Source: `src/features/knowledge/graph.tsx`, `src/features/knowledge/graph-clusters.ts`.
- `missing` Map/Table switch, "Index again", filter chips "Orphans" and "Stale".
- `missing` Right column: symbol card (kind, name, file, "Explain", "Open in the editor"), "Who calls it", "What it calls", "Specs and decisions that use it".
- `extra` Search field and a "file 4" filter chip.

## 77 Library, flow matrix

Design: `077-flowmatrix.jpg`. Not found as a page. Tried `/library/flows` (Flows and Bricks), searched `src/features` for "matrix". The table inside `/library/flows` is the only matrix (`src/ui/organisms/flow-matrix.tsx`). Capture: `flows.jpg`.

- `missing` A page "Flow matrix" with a back link to Network flows.
- `missing` Filter chips All / Allowed / Denied / "Not in the code" and "Find a host". App has three unnamed "All" dropdowns and "Search".
- `missing` "Check against the code". Attention card "1 flow is denied and the code uses it" with "Show it" and "Ask for the change".
- `look` Columns: design From, To, Network zone, Protocol, Port, Allowed, with names of bricks and hosts. App: 10 columns with IP ranges; Name and brick columns are empty.
- `extra` Edit and delete icons on each row.

## 86 Library, edit a dashboard

Design: `086-dashedit.jpg`. Not found as a state. Tried `/library/dashboards`, "New dashboard", read `src/features/knowledge/dashboards.tsx`: there is no edit mode. Capture: `dashboards.jpg`.

- `missing` Edit mode with the dashboard name as title, a back link to Dashboards, "Rename", "Pin to Today", "Done".
- `missing` "Add a tile" card with kind chips (Number, Bars, Line, List, Flow stages, Spend, Health). App has one "Add tile" button.
- `look` Tile in edit mode: design shows a drag handle and the words "Settings" and "Remove" with a dashed outline. App shows six small icons, always.

## 95 Library, what is tested

Design: `095-coverage.jpg`. Not found as a page. Tried `/library/test-plans` and its open rows; no chip on `/library/home`; `src/features/specs/plan-board.tsx` holds the coverage rows. Captures: `test-plans.jpg`, `plan-open.jpg`.

- `missing` A page "What is tested" with a back link to Test plans and a chip on the home of Library.
- `missing` Five cards by state (Passing, Failing, Not covered, Partial, Blocked), each with a count and rows of requirement and spec. App groups by plan in an accordion.
- `missing` Filter chips Partial and Blocked (app has All, Not covered, Failing). "Last run" date, "Write the missing tests", "Run the tests".
- `look` "Check of the scenarios" card with named checks and a "None" pill. App: "Scenario lint 0" with "No lint finding".
- `extra` Four stat tiles on top; ref chips on each requirement row.

## 96 Library, report forms

Design: `096-changerequest.jpg`. Route: `/library/reports`, click "Fill the form" on Change request. Capture: `report-form.jpg`.

- `look` Design: a full page "Change request" with a back link to Reports. App: a small modal dialog over a blurred page. Source: `src/features/reports/forms.tsx`.
- `look` Field names: design "From version", "To version", "People who approve". App: "Base ref", "Head ref", "Approvers".
- `missing` People picker with avatars and "Add" (app has a text field). Format switch "Word and Markdown / PDF". Button "Write the report" (app: "Export").
- `missing` Result card: "Written" pill, file path, "Show in the folder", "Open".
- `missing` Right cards "Other reports that ask first" (with "Fill"), "Reports with no form", "Parts of the complete dossier".

# Library

Library holds the pages that describe the project: what it must do, how it is built, why it is so, and what the team learns and shares. Each item is a file of the project.

Library opens on four doors. Each door names what you look for, and holds one chip for each page. Click a chip to open its page. When something waits for you, an orange chip comes first and gives the count: the open questions, or the decisions that wait for an answer. A chip marks a page whose source changed later. A page that your role cannot see has no chip.

Library has no section switch. On each page of Library, click Library at the top to go back to the doors.

The chips What is tested, Answers and Glossary open the page that holds them. The chip Learn shows how many steps of the path you finished. Under the doors, the cards Pinned and Opened last list pages: Pin keeps a page in Pinned, and Unpin removes it. Opened last also keeps the items that have a ref (a spec, a decision, a diagram, a document): each row shows a chip for its kind, its name and Pin.

## Read and change an item

1. Open a page, then select an item. Or click the main action of the page to create one. Select an item to see, in the inspector, the items that cite it.
2. An item with a picture opens on the picture alone. One switch at the top has three choices: Picture, Both (the text and the picture side by side) and Text. A document has Read, Both and Text. Shipyard keeps your choice. It shows the text by itself for a new file, when somebody changed the file at the same time, and for an error that names a line.
3. Change the text or the drawing, then click Save. The app writes the whole file or nothing.

- Search: the lists have a Search box. It uses the same search as the Ask bar.
- More: the menu at the end of the header row of a page holds the controls that the page does not show: Copy the reference, Copy the file name, Rename, Delete and some filters.
- Delete: choose Delete in the More menu of the page, or open the menu of an item (right-click) and choose Delete. The app names the file and asks once. The file then goes to the Trash.
- Rename: the More menu and the item menu have Rename. Type the new name; the extension stays. Review lists each file and line whose links change. Rename then moves the file and rewrites those links in one step. If a write fails, every file stays as it was.
- Ask the assistant: the last group of the item menu. Pick a prompt for this kind of item and your role. It fills the message box with the item, its file, its spec, its ticket and the items that cite it. Nothing is sent until you send it.
- When somebody changes the file at the same time, the app tells you. Choose Reload to take their version, or Keep mine.
- A read-only project refuses the save, the delete and the rename.

## What it must do

### Specs

Specs lists what the product does today. Pick a spec on the left to read it on the right, with each requirement and its state. The cards Changes in progress (with Archive for a finished change), Linked and Check the specs (syntax and links) sit beside it. The switch Read, Text, Files has Edit. The buttons Check against the code and Write a spec from the code hand a prepared request to the assistant. A change to a spec starts as a proposal: see the page Flow, List and The feature page, Brief.

### Test plans

Test plans opens on one plan: one card for each scenario, with its steps, a result pill and Edit. The cards Requirements and Other test plans sit beside it. Write the scenarios for me and Run hand a prepared request to the assistant. A plan with no scenario opens in its text. A finding of the check opens the plan in its text, at its line.

What is tested opens from its chip in the door What it must do, at the address `/library/test-plans/coverage`, with the link Test plans back. It shows filter chips, one card for each state (for example Passing) with its count and its rows, the check of the scenarios, Write the missing tests and Run the tests.

### Questions

Questions is the register of open points: risks, assumptions, issues, dependencies and questions. The title gives the count of open items. Each open item is a card with an Answer field and the button Answer; an empty answer writes nothing.

- One row of chips filters by kind, and Mine shows your own. The filters by text, state and owner are in the More menu. Export is in the header.
- Click New question to add one. Pick the owner from the team.
- Answered items sit in one Closed card. After you answer a question of a spec, Add the answer to the spec copies the answer into the spec.

## How it is built

### Map

Map draws the items of the project in groups, with the links between them. Filter by kind. The More menu holds the views Map, Table and Graph, and the filters Orphans and Stale.

- An item that nothing cites shows as an orphan.
- An item whose source changed later shows as stale.
- Select an item to open it in the inspector.

With the source Code, the map shows the folders of the code. A line between two folders is thicker when more calls go between their files. Select a folder to see its files, then select a file to see its symbols and what calls them or what they call. Show all goes back to the map. Index starts the code index server when it is off, builds the index, and stops the server again. If the program ends with an error, the page names the program, its exit code and its last lines: fix the cause, then click Index again. The symbol card has Explain and Open in the editor, and Specs and decisions that use it opens the inspector. Orphans shows the files that no call reaches or leaves. The switch Knowledge and Code sits at the top, and Code has the address `/library/graph?source=code`.

A file whose spec changed after its last change shows the chip Stale.

### Architecture

Architecture shows the architecture models of the project as views. The views are drawn from the text of the model. Chips under the title pick the model, and New model adds one. The switch Picture, Both, Text, with Edit, sits in the header; in Both the picture is on the left and the text on the right.

A diagram or a picture, in Architecture and in Screens, fits its frame and sits in the centre when it opens. To move it:

- Pan: drag it, or use a sideways gesture on the trackpad. A vertical wheel scrolls the page.
- Zoom: pinch, or hold Ctrl or Cmd and turn the wheel.
- Keyboard: click the frame to focus it, then press the arrow keys to pan, + or - to zoom and 0 to fit.
- Fit brings the whole diagram back into the frame.

### Diagrams

Diagrams holds the drawings of the project: Excalidraw, Mermaid, draw.io and BPMN. A grid or a list shows each diagram with its format. Click a diagram, then Open or Edit; Change the format and Used by are on its card. Draw it for me hands a prepared request to the assistant, and one New button for each format adds a diagram. Draw in the editor, then save.

### Screens

Screens shows the screens of the product and the design tokens of your project. They come from the design doc (CSS in a code block), from a `tokens.css` file, from a `*.tokens.json` file or from a Tailwind 4 `@theme` block, grouped by file. With no token the page says No tokens yet; click Add tokens to the design doc, edit the block, then save. The page never shows the tokens of Shipyard. Each screen is a card with Built or Not built. The switch Screens and Tokens shows the tokens. Design to code opens the open screen, else the first, in the inspector, where Write plan is.

- A `.fig` file shows the preview that Figma keeps in it.
- To read Figma, add the token of your Figma account once. It goes to the keychain of your computer.
- Then paste the address of a Figma project and click List the files. Each file shows its preview and its design tokens.

### API

API shows the API contracts. Open a contract to read its routes. Try a route against a server of the contract. The list shows the endpoints of all the contracts. Try it: pick a server, a method and a path, then click Send; the answer shows in the dark box under it.

The card of an endpoint links to the change that cites the contract.

### Data

Data shows the data models: the tables and the links between them. Find a table filters the list. The picture marks keys and links, and the switch Picture, Both, Text shows the `.dbml` text.

### Network flows

Network flows lists the network flows as a table: from where, to where, the port and the protocol. Add, change or remove a row, then save. Each row has From, To and Why. The switch Flows and Bricks and the card Bricks and hosts show the other views. Open the full matrix opens `/library/flows/matrix`: a page with the link Network flows back, filter chips, Find a host and one row for each flow (Allow or Deny), with Edit and Remove in the row menu. Add a flow is in the More menu of the matrix, and Edit as text opens the file.

Check against the code scans the code for the hosts that it calls. A row says Not in the code when no code calls its host, and a card names each flow that is denied while the code uses it, with Show it and Ask for the change.

## Why it is so

### Decisions

Decisions holds the decision records (ADRs). Each record gives one decision, the options and the reasons.

- Click New decision to write one. A form asks for each part.
- A proposed decision shows first, with Waits for you. Type a Reason, then click Accept or Refuse; an empty reason is refused. The card Used by lists what cites the decision.

### Project rules

Project rules shows one numbered card for each rule that every change must follow. Edit changes the text, and Add a rule adds one at the end. The card Who can change the rules links to Crew / Rights (Change the rights), and Who follows the rules lists the agent roles.

Earlier versions lists the commits that changed the file. Read shows an old version; Restore writes its text into the file and commits nothing, so you can still undo it. Restore asks first, and refuses when the file has changes that are not in a commit.

## Learn and share

### Learn

Learn helps a new person find their way.

- Path: one card with the steps in reading order (the architecture, the decisions, then the specs). Each step has a number, its kind and a title; Start opens the next step. A step that you open counts as done. A bar and N of M show your progress.
- Glossary: the words that the specs define. A term opens its spec.
- Learning paths: courses, certifications and readings, with the experts of the team who can help. Pick a person, then tick the steps that this person finished. The team progress table shows each person and each path. Team progress sits in the right column: one row for each person, with a bar and N of M.
- Feeds: the news feeds of the project. Paste the RSS or Atom address of a site, then click Subscribe. The app reads each feed and keeps a copy for one hour.

Experts is a card with the people of the team file and their topics. Add a word writes a word and its meaning into `docs/glossary.md`, and the glossary reads that file beside the specs. A step can have a second pill: Reading, Course or Certification.

### Handbook

Handbook shows the page tree on the left, with Find a page, and the open page. Pages that link here lists the pages that cite it, and Ask an agent to update it hands a prepared request to the assistant. Switch to Edit to change a page: the switch Read, Both, Text shows the page as you read it, the page beside its text, or the text alone. Click New page to add one. The Manual row, with F1, opens the manual.

History, on a page, lists the commits that changed it in the same way, and the page says who changed it last.

### Documents

Documents lists the documents of the project, with a pill for the format. Open one with Read, Both or Text, then click Edit to change it. Search in the text, Rename and Delete are in the More menu. The card File has Show in folder and Export. The card Planner can use this document has Turn into slides and Turn into a spec: each hands a prepared request to the assistant. Export the architecture dossier and the functional documentation as Word files, and a client sheet as an Excel file. Each export opens a Save as dialog with the name filled in and the folder of your last save; Cancel exports nothing. After a save, Show in folder and Open work on the new file.

A Word file has a cover page, a contents list (Word fills the page numbers when it asks to update the fields), the Mermaid diagrams of the project as pictures, and page numbers. A LikeC4 or draw.io file shows as a picture when a PNG with the same name sits next to it, and as its path when not. An Excel sheet has a styled header row that stays on screen.

Add a file copies any file that you choose into the documents folder. A Word file stays a Word file.

### Slides

Slides holds the presentations of the project. Each deck is one HTML file in `docs/slides/`, with its animations and its steps. The decks sit as cards on the left, and the open deck on the right with a pager and a strip of thumbnails.

- New deck: type a name. The assistant opens with a request for an agent to write the deck. Read the request, then send it.
- Click a deck to show it. The arrow keys, Space, Home and End move through the slides and the steps.
- Present shows the deck on the full screen. Press Escape to stop.
- Export PDF: pick the file in the Save as dialog. Each slide becomes one page. This works on macOS only.
- An older deck written as text shows read only. Click Convert to ask an agent to rewrite it as an HTML deck.
- To delete a deck, open the menu of the deck, then click Delete. The file goes to the Trash.

A deck that is written in Markdown has Edit, Export PDF and Speaker notes. A speaker note is a `Note:` block after a slide. Export PDF works on macOS only.

### Dashboards

Dashboards shows one dashboard at a time; the switch at the top of the page picks it. Its tiles are read only. Edit opens the edit page of the dashboard, Export the report opens Reports, and Build a dashboard for me hands a prepared request to the assistant. New dashboard is in the More menu. More numbers links to Crew / Spend, Flow / Health and Plan. The tiles that you pin show at the top of Dashboards. A tile whose source is off says so.

The edit page has the address `/library/dashboards/<name>/edit`, the link Dashboards back, Rename and Done. Add a tile shows one chip for each kind of tile. Each tile has a drag handle, Settings and Remove; Move left, Move right and the size are in Settings. Show as table gives the numbers behind a chart.

Build a tile for me asks an agent to propose a tile from your words. You do not need to know the kinds of tiles.

1. Open the edit page of the dashboard (Edit), then click Build a tile for me, beside Add a tile.
2. Type what the tile must show, in plain words. For example: the open questions for each owner.
3. Budget (USD) is the limit of the agent: the agent stops at the budget, or after 2 minutes. Its last reply can pass the budget by a small amount. The budget starts at 2 dollars. Less budget and More budget change it by 1 dollar.
4. Click Build. While the agent works, Stop ends it. The work also shows in Crew / Sessions, and its Stop does the same.
5. Look at the Proposed tile. Accept adds it to the dashboard and saves. Discard drops it.

The agent only reads the project. The dashboard does not change until you click Accept. If the page says that the budget is spent, add budget, then click Build again. A dashboard that you cannot change has no Build a tile for me.

Each tile has a chart: Number, Bars, Line, List, Flow stages, Spend or Health. The kind of data picks the first chart; change it in the menu of the tile. Pin to Today, on the edit page, shows the dashboard as one card on Today. A picker of releases sits beside Edit and keeps only the tickets of the release in the tiles of the issue tracker.

### Reports

Reports lists each file that Shipyard can make for a person who does not use Shipyard: a client, a manager, an auditor. Each report is a tile. Format, at the top, shows All the reports, or only the Word files, the Excel files or the pictures. Written for you holds three documents, each with Open and Write it. One link goes to Dashboards.

- Export: Shipyard opens the Save as dialog. Pick the folder, then save.
- Fill the form: Change request and Work done open a form page (below), then write the file.
- Open Plan or Open Estimates: the report needs a choice that you make on that page. The link opens the page; export from there.

A report shows only when your role can see the page that holds its export. The Network flows report shows when the project has a flow file. When no report is left, Reports has no chip. The Export menu of each page still works.

A form page has the address `/library/reports/change-request` or `/library/reports/work-done`, and the link Reports back. Fill in the fields (a change request asks From version, To version and People who approve: Add shows the team with a check box for each person), then click Write the report. An empty required field gives an error line and writes nothing. After the write, the card Written shows each file with its path, Show in folder and Open. Cards on the right list the other reports that ask first, the reports with no form (All reports) and the parts of the complete dossier.

The format switch also offers PDF (macOS only) and Markdown; each text report can be written as Markdown. A written report shows its date and its person, Pages that link to a report lists the pages that cite it, and Complete dossier asks the title, the client and the date before it writes.

### Manual

Manual is this guide. Open it with Manual in the account menu, with F1, with the Ask bar or with the Manual chip of Library. It comes with the app, in the language of the interface, and works without a project. Type a word in the search field to find every section that has it. Open the manual for this page, in the Ask bar, opens the page of the place and the section that you see.

The manual has one page for each place, in the order of the rail, and it opens on Start. Each page has a picture. F1 opens the manual for every role, also for a role that does not see Library: the manual is help. Under a page, Ask about this page puts a question about the page in the assistant, Shortcuts opens the keyboard shortcuts, and Handbook of the project opens the handbook of the project.

A link in the text of a page, such as `adr:0003`, opens a card that explains it. The card says whether the item is in the project, and what it is linked to. Open and Explain with an agent sit side by side. More shows the other actions, and Copy the ref copies the name of the item.

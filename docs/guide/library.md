# Library

Library holds the pages that describe the project: what it must do, how it is built, why it is so, and what the team learns and shares. Each item is a file of the project.

Library opens on four doors. Each door names what you look for, and holds one chip for each page. Click a chip to open its page. When something waits for you, an orange chip comes first and gives the count: the open questions, or the decisions that wait for an answer. A chip marks a page whose source changed later. A page that your role cannot see has no chip.

Library has no section switch. On each page of Library, click Library at the top to go back to the doors.

## Read and change an item

1. Open a page, then select an item. Or click the main action of the page to create one. Select an item to see, in the inspector, the items that cite it.
2. An item with a picture opens on the picture alone. One switch at the top has three choices: Picture, Both (the text and the picture side by side) and Text. A document has Read, Both and Text. Shipyard keeps your choice. It shows the text by itself for a new file, when somebody changed the file at the same time, and for an error that names a line.
3. Change the text or the drawing, then click Save. The app writes the whole file or nothing.

- Search: the lists have a Search box. It uses the same search as the Ask bar.
- Delete: open the menu of an item (right-click) and choose Delete, or click Delete in the inspector. The app names the file and asks once. The file then goes to the Trash.
- Rename: the item menu has Rename. Type the new name; the extension stays. Review lists each file and line whose links change. Rename then moves the file and rewrites those links in one step. If a write fails, every file stays as it was.
- Ask the assistant: the last group of the item menu. Pick a prompt for this kind of item and your role. It fills the message box with the item, its file, its spec, its ticket and the items that cite it. Nothing is sent until you send it.
- When somebody changes the file at the same time, the app tells you. Choose Reload to take their version, or Keep mine.
- A read-only project refuses the save, the delete and the rename.

## What it must do

### Specs

Specs lists what the product does today, with the requirements of each spec. A change to a spec starts as a proposal: see the page Flow, List and The feature page, Brief.

### Test plans

Test plans lists the test scenarios. Each scenario names the requirements that it checks. A plan opens on Read: one card for each scenario, with its steps and its tags. Click Edit to change its text. A plan with no scenario opens in its text. A finding of the check opens the plan in its text, at its line.

### Questions

Questions is the register of open points: risks, assumptions, issues, dependencies and questions.

- Filter by kind, state and owner.
- Click New question to add one. Pick the owner from the team.
- After you answer a question of a spec, one click copies the answer into the spec.

## How it is built

### Map

Map draws the items of the project and the links between them. Filter by kind. A table view lists the same items.

- An item that nothing cites shows as an orphan.
- An item whose source changed later shows as stale.
- Select an item to open it in the inspector.

With the source Code, the map shows the folders of the code. A line between two folders is thicker when more calls go between their files. Select a folder to see its files, then select a file to see its symbols and what calls them or what they call. Show all goes back to the map. Index starts the code index server when it is off, builds the index, and stops the server again. If the program ends with an error, the page names the program, its exit code and its last lines: fix the cause, then click Index again.

### Architecture

Architecture shows the architecture models of the project as views. The views are drawn from the text of the model.

A diagram or a picture, in Architecture and in Screens, fits its frame and sits in the centre when it opens. To move it:

- Pan: drag it, or use a sideways gesture on the trackpad. A vertical wheel scrolls the page.
- Zoom: pinch, or hold Ctrl or Cmd and turn the wheel.
- Keyboard: click the frame to focus it, then press the arrow keys to pan, + or - to zoom and 0 to fit.
- Fit brings the whole diagram back into the frame.

### Diagrams

Diagrams holds the drawings of the project: Excalidraw, Mermaid, draw.io and BPMN. Draw in the editor, then save.

### Screens

Screens shows the screens of the product and the design tokens of your project. They come from the design doc (CSS in a code block), from a `tokens.css` file, from a `*.tokens.json` file or from a Tailwind 4 `@theme` block, grouped by file. With no token the page says No tokens yet; click Add tokens to the design doc, edit the block, then save. The page never shows the tokens of Shipyard.

- A `.fig` file shows the preview that Figma keeps in it.
- To read Figma, add the token of your Figma account once. It goes to the keychain of your computer.
- Then paste the address of a Figma project and click List the files. Each file shows its preview and its design tokens.

### API

API shows the API contracts. Open a contract to read its routes. Try a route against a server of the contract.

### Data

Data shows the data models: the tables and the links between them.

### Network flows

Network flows lists the network flows as a table: from where, to where, the port and the protocol. Add, change or remove a row, then save.

## Why it is so

### Decisions

Decisions holds the decision records (ADRs). Each record gives one decision, the options and the reasons.

- Click New decision to write one. A form asks for each part.
- Accept or reject a proposed decision with one click.

### Project rules

Project rules holds the rules of the project that every change must follow.

## Learn and share

### Learn

Learn helps a new person find their way.

- Path: the architecture, the decisions, then the specs, in reading order. A step that you open counts as done.
- Glossary: the words that the specs define.
- Learning paths: courses, certifications and readings, with the experts of the team who can help. Pick a person, then tick the steps that this person finished. The team progress table shows each person and each path.
- Feeds: the news feeds of the project. Paste the RSS or Atom address of a site, then click Subscribe. The app reads each feed and keeps a copy for one hour.

### Handbook

Handbook holds the pages of the project handbook. Read a page with its contents on the side, or switch to Edit to change it. In Edit, the switch Read, Both, Text shows the page as you read it, the page beside its text, or the text alone. Click New page to add one.

### Documents

Documents lists the documents of the project. Search their text, rename them, delete them, and read a Word file. Export the architecture dossier and the functional documentation as Word files, and a client sheet as an Excel file. Each export opens a Save as dialog with the name filled in and the folder of your last save; Cancel exports nothing. After a save, Show in folder and Open work on the new file.

A Word file has a cover page, a contents list (Word fills the page numbers when it asks to update the fields), the Mermaid diagrams of the project as pictures, and page numbers. A LikeC4 or draw.io file shows as a picture when a PNG with the same name sits next to it, and as its path when not. An Excel sheet has a styled header row that stays on screen.

### Slides

Slides holds the presentations of the project. Each deck is one HTML file in `docs/slides/`, with its animations and its steps.

- New deck: type a name. The assistant opens with a request for an agent to write the deck. Read the request, then send it.
- Click a deck to show it. The arrow keys, Space, Home and End move through the slides and the steps.
- Present shows the deck on the full screen. Press Escape to stop.
- Export PDF: pick the file in the Save as dialog. Each slide becomes one page. This works on macOS only.
- An older deck written as text shows read only. Click Convert to ask an agent to rewrite it as an HTML deck.
- To delete a deck, open the menu of the deck, then click Delete. The file goes to the Trash.

### Dashboards

Dashboards holds boards of tiles: work, runs, questions, quality and more. Add or remove a tile, change its settings, then save. Show as table gives the numbers behind a chart. Drag a tile to another column, or use its Move left and Move right buttons. The tiles that you pin show at the top of Dashboards. A tile whose source is off says so.

Build a tile for me asks an agent to propose a tile from your words. You do not need to know the kinds of tiles.

1. Click Build a tile for me, beside Add tile.
2. Type what the tile must show, in plain words. For example: the open questions for each owner.
3. Budget (USD) is the limit of the agent: the agent stops at the budget, or after 2 minutes. Its last reply can pass the budget by a small amount. The budget starts at 2 dollars. Less budget and More budget change it by 1 dollar.
4. Click Build. While the agent works, Stop ends it. The work also shows in Crew / Sessions, and its Stop does the same.
5. Look at the Proposed tile. Accept adds it to the dashboard and saves. Discard drops it.

The agent only reads the project. The dashboard does not change until you click Accept. If the page says that the budget is spent, add budget, then click Build again. A dashboard that you cannot change has no Build a tile for me.

### Reports

Reports lists each file that Shipyard can make for a person who does not use Shipyard: a client, a manager, an auditor. Each report is one card. Format, at the top, shows All the reports, or only the Word files, the Excel files or the pictures.

- Export: Shipyard opens the Save as dialog. Pick the folder, then save.
- Fill the form: Change request and Work done ask for a few values first, then make the file.
- Open Plan or Open Estimates: the report needs a choice that you make on that page. The link opens the page; export from there.

A report shows only when your role can see the page that holds its export. The Network flows report shows when the project has a flow file. When no report is left, Reports has no chip. The Export menu of each page still works.

### Manual

Manual is this guide. Open it with Manual in the account menu, with F1, with the Ask bar or with the Manual chip of Library. It comes with the app, in the language of the interface, and works without a project. Type a word in the search field to find every section that has it. Open the manual for this page, in the Ask bar, opens the page of the place and the section that you see.

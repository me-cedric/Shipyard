# Knowledge

Knowledge turns the files of the project into pages, documents, slides and lessons.

## Library

Library is the place of the pages that describe the project. It opens on four doors. Each door names what you look for, and holds one chip for each page:

- What it must do: Capabilities, Test plans and Questions.
- How it is built: Graph, Architecture, Diagrams, Screens, API, Data and Flows.
- Why it is so: Decisions and Constitution.
- Learn and share: Learn, Handbook, Documents, Slides, Dashboards, Reports and Manual.

Click a chip to open its page. When something waits for you, an orange chip comes first and gives the count: the open questions, or the decisions that wait for an answer. Click it to go to them. A page that your role cannot see has no chip.

Library has no section switch. On each page of Library, click Library at the top to go back to the doors.

## Graph

Graph draws the items of the project and the links between them. Filter by kind. A table view lists the same items.

The Code graph opens as a map of folders. A line between two folders is thicker when more calls go between their files. Select a folder to see its files, then select a file to see its symbols and what calls them or what they call. Show all goes back to the map. On the Code graph, Index starts the code graph server when it is off, builds the index, and stops the server again. If the program ends with an error, the page names the program, its exit code and its last lines, then gives one action: read the lines, fix the cause, then click Index again.

- An item that nothing cites shows as an orphan.
- An item whose source changed later shows as stale.
- Select an item to open it in the inspector.

## Handbook

Handbook holds the pages of the project handbook. Read a page with its contents on the side, or switch to Edit to change it. In Edit, the switch Read, Both, Text shows the page as you read it, the page beside its text, or the text alone. Click New page to add one.

## Manual

Manual is this guide. Open it with Manual in the account menu, with F1, with the Ask bar or with the Manual chip of Library. The address `/knowledge/manual` shows it too. It comes with the app and works without a project. Type a word in the search field to find every page that has it. Open the palette and choose Open the manual for this page to come to the help of the page that you see.

## Documents

Documents lists the documents of the project. Search their text, rename them, delete them, and read a Word file. Export the architecture dossier and the functional documentation as Word files, and a client sheet as an Excel file. Each export opens a Save as dialog with the name filled in and the folder of your last save; Cancel exports nothing. After a save, Show in folder and Open work on the new file. A Word file has a cover page, a contents list (Word fills the page numbers when it asks to update the fields), the Mermaid diagrams of the project as pictures, and page numbers. A LikeC4 or draw.io file shows as a picture when a PNG with the same name sits next to it, and as its path when not. An Excel sheet has a styled header row that stays on screen.

## Reports

Reports lists each file that Shipyard can make for a person who does not use Shipyard: a client, a manager, an auditor. Each report is one card. Format, at the top, shows All the reports, or only the Word files, the Excel files or the pictures.

- Export: Shipyard opens the Save as dialog. Pick the folder, then save.
- Fill the form: Change request and Work done ask for a few values first, then make the file.
- Open Plan or Open Estimates: the report needs a choice that you make on that page. The link opens the page; export from there.

A report shows only when your role can see the page that holds its export. The Network flows report shows when the project has a flow file. When no report is left, Reports has no chip.

The Export menu of each page still works as before.

## Slides

Slides holds the presentations of the project. Each deck is one HTML file in `docs/slides/`, with its animations and its steps.

- New deck: type a name. The assistant opens with a request for an agent to write the deck. Read the request, then send it.
- Click a deck to show it. The arrow keys, Space, Home and End move through the slides and the steps.
- Present shows the deck on the full screen. Press Escape to stop.
- Export PDF: pick the file in the Save as dialog. Each slide becomes one page. This works on macOS only.
- An older deck written as text shows read only. Click Convert to ask an agent to rewrite it as an HTML deck.
- To delete a deck, open the menu of the deck, then click Delete. The file goes to the Trash.

## Learn

Learn helps a new person find their way.

- Path: the architecture, the decisions, then the specs, in reading order. A step that you open counts as done.
- Glossary: the words that the specs define.
- Learning paths: courses, certifications and readings, with the experts of the team who can help. Pick a person, then tick the steps that this person finished. The team progress table shows each person and each path.
- Feeds: the news feeds of the project. Paste the RSS or Atom address of a site, then click Subscribe. The app reads each feed and keeps a copy for one hour.

## Dashboards

Dashboards holds boards of tiles: work, runs, questions, quality and more. Add or remove a tile, change its settings, then save. Show as table gives the numbers behind a chart. Drag a tile to another column, or use its Move left and Move right buttons. Pin a tile to see it in Home, My work.

Build a tile for me asks an agent to propose a tile from your words. You do not need to know the kinds of tiles.

1. Click Build a tile for me, beside Add tile.
2. Type what the tile must show, in plain words. For example: the open questions for each owner.
3. Budget (USD) is the limit of the agent: the agent stops at the budget, or after 2 minutes. Its last reply can pass the budget by a small amount. The budget starts at 2 dollars. Less budget and More budget change it by 1 dollar.
4. Click Build. While the agent works, Stop ends it. The work also shows in Crew / Sessions, and its Stop does the same.
5. Look at the Proposed tile. Accept adds it to the dashboard and saves. Discard drops it.

The agent only reads the project. The dashboard does not change until you click Accept. If the page says that the budget is spent, add budget, then click Build again. A dashboard that you cannot change has no Build a tile for me.

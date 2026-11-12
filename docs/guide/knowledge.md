# Knowledge

Knowledge turns the files of the project into pages, documents, slides and lessons.

## Graph

Graph draws the items of the project and the links between them. Filter by kind. A table view lists the same items.

On the Code graph, Index starts the code graph server when it is off, builds the index, and stops the server again. If the program ends with an error, the page names the program, its exit code and its last lines, then gives one action: read the lines, fix the cause, then click Index again.

- An item that nothing cites shows as an orphan.
- An item whose source changed later shows as stale.
- Select an item to open it in the inspector.

## Handbook

Handbook holds the pages of the project handbook. Read a page with its contents on the side, or switch to Edit to change it. Click New page to add one.

## Manual

Manual is this guide. It is not a tab: open it with Manual in the account menu, with F1 or with the palette. The address `/knowledge/manual` shows it too. It comes with the app and works without a project. Type a word in the search field to find every page that has it. Open the palette and choose Open the manual for this page to come to the help of the page that you see.

## Documents

Documents lists the documents of the project. Search their text, rename them, delete them, and read a Word file. Export the architecture dossier and the functional documentation as Word files, and a client sheet as an Excel file. Each export opens a Save as dialog with the name filled in and the folder of your last save; Cancel exports nothing. After a save, Show in folder and Open work on the new file. A Word file has a cover page, a contents list (Word fills the page numbers when it asks to update the fields), the Mermaid diagrams of the project as pictures, and page numbers. A LikeC4 or draw.io file shows as a picture when a PNG with the same name sits next to it, and as its path when not. An Excel sheet has a styled header row that stays on screen.

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

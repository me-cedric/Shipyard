# Getting started

Shipyard helps a team deliver a software project: the design, the specs, the work, the agents, the code and the knowledge. Everything stays in the files of the project, so the team shares it with git.

## The window

- The left bar holds the spaces: Home, Design, Specs, Work, Factory, Code, Knowledge and Settings.
- The tabs of a space sit at the top of the page.
- The inspector on the right shows the item that you select.
- The status bar at the bottom shows the project, the sync state and the commit control.
- The assistant opens on the side. Ask it a question about the project. Each conversation is a tab, and a dot marks a tab with a new reply.
  - Under the message box, one bar has the attach button, one button with the model and the effort (it opens the models of the AI tool, the effort levels and the models of the other AI tools), the permission, the context ring and Send.
  - In Agent mode the permission is Edit with approval, Auto (accepts edits) or Bypass permissions. Bypass skips every approval of Claude Code or Codex: Shipyard asks you the first time in each project, shows it in red while it is on, and refuses it in a read-only project and while the agents switch is off.
  - Type `/` at the start of a message to list the commands of the selected AI tool. The text goes to the AI tool as you typed it.
  - Each conversation keeps one agent session, so a later message continues the earlier work.
- In Settings, then Me, choose the side of the bar and of the drawers, the accent colour, the date format, a narrow top bar and your picture.

The window opens at the size where you closed it. To keep the data of the app next to the app (on a USB key, for example), put an empty file named `portable` next to the app.

## The menu bar item

- The Shipyard icon sits in the menu bar (the system tray on Windows and Linux). A dot on the icon means that something needs you.
- A click opens a small panel: the spend of today and of the month, the active runs with Stop, the Needs you count with its first items, the agents switch, the sync state, the project and Open Shipyard.
- The panel asks for the same click as the app for each action that writes.
- In Settings, then Me, turn the menu bar item off.

## Open a project

1. Go to Home, then Projects.
2. Click Open a folder and choose the folder of your project. Or create a new project.
3. When the folder is not a project yet, click Make it a project.

## Find your way

- Press Ctrl+K (Cmd+K on a Mac) to open the palette. Type the name of a page, an item or an action.
- In the palette, type a few words to search the text of your documents, decisions, specs, questions, tickets and designs. Case and accents do not matter ("decision" finds "décision"), every word must match, and the last word can be a start. Results group by kind, show a short extract with the words marked, and put a page that many items cite first. Choose Ask the assistant to put those items as context in the message box of the assistant. Nothing is sent until you send it. The document that you open from a result marks the words.
- Design and Knowledge lists have a Search box that filters the list with the same search.
- Press Ctrl+1 to Ctrl+8 to go to a space.
- Open the palette and choose Open the manual for this page to read the help of the page that you see.
- Press Ctrl+[ and Ctrl+] (Cmd on a Mac), or click Back and Forward in the top bar, to move between the views that you opened.
- Click the ? button or press F1 to read the help of the page that you see.
- Click the sidebar button at the left end of the top bar to hide or show the sidebar.
- Under 1100 px, the files, terminal and theme buttons sit in the More menu.
- Click Sync to sync. Click the arrow joined to it to Fetch only or to Push.
- When an error has a button that opens a setting, click it. The page opens on the exact row, moves the focus to its control and marks it for 2 seconds.
- Hold Ctrl (Cmd on a Mac) and turn the mouse wheel on a diagram or an image to zoom. Drag to move it. Use Full screen for a large view.
- Press Ctrl+= and Ctrl+- to change the text size, and Ctrl+0 to go back to 16 px. Settings / Me has the same choice.
- Press Ctrl+Shift+K to see all the keyboard shortcuts.

## Your role

In Settings, then Me, choose your role. The role sets the space that opens first. A junior starts in Knowledge, Learn. A project manager starts in Work, Board.

## Safe by default

- The app never sends a change to an issue tracker or a code host without your click.
- A token goes to the keychain of your computer. The app never shows it again.
- A project with a read-only profile takes no change.

## Words

| Word | Meaning |
|---|---|
| Ref | The short name of an item, such as `adr:0003` or `wi:ACME-12`. Click a ref to open its item. |
| Issue tracker | The tool that holds the tickets: Jira, GitHub, GitLab, Azure DevOps or Linear. |
| Code host | The server that holds the code: GitHub or GitLab. |
| Run | One job of an agent on one ticket. |
| Spec | A text that says what the product must do. |
| ADR | A decision record: one decision, its options and its reasons. |
| MCP server | A tool that an agent can call, such as Jira or Figma. |

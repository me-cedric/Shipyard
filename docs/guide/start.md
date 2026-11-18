# Getting started

Shipyard helps a team deliver a software project: the design, the specs, the work, the agents, the code and the knowledge. Everything stays in the files of the project, so the team shares it with git.

## The window

- The left bar holds the six places and Setup: Today, Flow, Plan, Crew, Library, Code and Setup. Each page of before sits in one place, and its old address still opens it.
- The sections of a place sit at the top of the page, in one switch. Library has no switch: it opens on four doors, and each of its pages has a Library link that goes back to them.
- The inspector on the right shows the item that you select.
- The status bar at the bottom shows the project, the sync state and the commit control, with the count of changed files beside Commit.
- The top bar holds Back and Forward, Sync, the bar Ask or tell Shipyard, the Files and Terminal buttons and the account menu.
  - Sync shows how many commits you are ahead and behind.
  - Ask or tell Shipyard is the one bar for a question, a place and an action. Press Ctrl+K (Cmd+K on a Mac) to move to it. Go to opens a place, a project, an item or a search result. Do starts an action or a prompt for the page that you see. Ask what blocks, what stopped or what needs you: the answer names each feature and gives its action. Any other text goes to the assistant when you press Enter.
  - What needs you, the news and the live runs and sessions are in Today. A dot on Today in the menu marks unread news, and a live mark shows while a run or a session works.
  - The account menu (your picture) holds Settings / Me, Theme (Light, Dark, System), Manual, Shortcuts, What's new and Replay the tour.
- The assistant opens on the side. Ask it a question about the project. Each conversation is a tab, and a dot marks a tab with a new reply.
  - Under the message box, one bar has the attach button, one button with the model and the effort (it opens the models of the AI tool, the effort levels and the models of the other AI tools), the permission, the context ring and Send.
  - In Agent mode the permission is Edit with approval, Auto (accepts edits) or Bypass permissions. Bypass skips every approval of Claude Code or Codex: Shipyard asks you the first time in each project, shows it in red while it is on, and refuses it in a read-only project and while the agents switch is off.
  - Type `/` at the start of a message to list the commands of the selected AI tool. The text goes to the AI tool as you typed it.
  - Each conversation keeps one agent session, so a later message continues the earlier work.
- In Settings, then Me, choose the side of the bar and of the drawers, the accent colour, the date format, a narrow top bar and your picture.

The window opens at the size where you closed it. To keep the data of the app next to the app (on a USB key, for example), put an empty file named `portable` next to the app.

## The menu bar item

- The Shipyard icon sits in the menu bar (the system tray on Windows and Linux).
- A click opens a small panel: the spend of today and of the month, the active runs with Stop, the things that need you, the same list as Today, the reminder to log time, the agents switch, the sync state, the project and Open Shipyard.
- The panel asks for the same click as the app for each action that writes.
- In Settings, then Me, turn the menu bar item off.

## The tour

- The tour does not open at the first launch. It opens once, when you open your first project. It has six steps: the loop, open a project, connect the issue tracker and the code host, choose the AI tool, the permissions, and the first run on a ticket.
- Click Next and Back, or press the Left and Right arrow keys. Close ends the tour at any step. It does not open again by itself.
- To see it again, choose Replay the tour in the account menu or in the Help menu, or type Replay the tour in the Ask bar, or go to Setup, then This computer, then Permissions.
- The last step opens this manual.

## Permissions

Shipyard asks for a permission of the system only after you click Allow. The tour and Setup / This computer show each one with its state: On, Off, Not asked, Not needed or Unknown.

| Permission | macOS | Windows | Linux |
|---|---|---|---|
| Notifications | Allow shows the system prompt. Off opens System Settings. | Send a test, and Open System Settings. | Send a test. |
| Documents, Desktop and Downloads | Allow lets macOS ask for each folder. Off opens Privacy & Security / Files and Folders. | Not needed. | Not needed. |

Shipyard does not ask for Full Disk Access, the camera, the microphone or the location. A project on a removable or network volume gets the prompt of macOS when it opens.

## First launch

The first-run page asks for your role. Pick it, then click Continue. Then open a folder, clone a repository or start a new project. With no project open, every space shows this same choice: Open a folder, Clone a repository and New project.

On Home, then Today, one Get started checklist lists the next steps in order: project, AI tool, models, issue tracker, code host, team, permissions, first decision, first spec, first assigned ticket and first run. Each item has one action that names the real next step, such as Install, Sign in, Choose or Connect. Setup / Start shows the same steps, one question at a time. On Today it hides when nothing is left to do.

## Open a project

1. Click the project name in the top bar, then Projects.
2. Click Open a folder and choose the folder of your project. Or click New project (see New project below).
3. When the folder is not a project yet, click Make it a project.

## New project

Click New project on the Projects page, or on the first-run page or the no-project page. The creator has five steps: Project, Brief, Team, Remote and Start. Each step has defaults. Create is on from the first step when the name and the parent folder are set.

1. Project: the name, the key (from the name, you can edit it), the parent folder and the stack: Node, Rust, Python, Java, Go or Other. The stack sets the gates of the project file and the ignore rules of `.gitignore`. The folder must be empty or new: Create refuses a folder that holds files.
2. Brief: the vision, the users and the scope, as text that you edit. They go to `docs/brief.md`. Also choose the docs language and the pull request language. Both default to the language of the interface. The agents write specs, diagrams, documents and pull request text in these languages. Code, identifiers, code comments and commit messages stay in English.
3. Team: you are the first member, with a role. Add or remove members with a name and a role.
4. Remote: Local only (the default), an existing remote address, or a new private repository on a code host connection (GitHub or GitLab). A public repository is not offered. Also choose an issue tracker connection and its scope.
5. Start: the list of the files that Create writes, with their text. Nothing is written before you click Create. Then choose a start:
   - A Factory run of the `bootstrap` workflow: a plan that waits for your approval, a build, a review and a pull request. It needs a code host connection.
   - Starter issues: one issue for each line of the scope. You see, edit and remove each one first. They need an issue tracker connection. Shipyard creates the issues only when you click Create issues, and a second click creates no copy.
   - Later.

   The default is the run when it is possible, else the issues, else later.

Create makes the repository, writes the files, makes the first commit and opens the project. For a new repository, it then makes the repository on the code host, sets `origin` and pushes. When the code host refuses, the local project stays open and the error shows.

## Find your way

- Press Ctrl+K (Cmd+K on a Mac) to move to the Ask bar. Type the name of a page, an item or an action, then use the arrow keys and Enter. Escape closes it.
- In the Ask bar, type a few words to search the text of your documents, decisions, specs, questions, tickets and designs. Case and accents do not matter ("decision" finds "décision"), every word must match, and the last word can be a start. Results group by kind, show a short extract with the words marked, and put a page that many items cite first. Choose Ask the assistant to put those items as context in the message box of the assistant. Nothing is sent until you send it. The document that you open from a result marks the words.
- Design and Knowledge lists have a Search box that filters the list with the same search.
- Press Ctrl+1 to Ctrl+7 to go to a place.
- Go to the Ask bar and choose Open the manual for this page to read the help of the page that you see.
- Press Ctrl+[ and Ctrl+] (Cmd on a Mac), or click Back and Forward in the top bar, to move between the views that you opened.
- Press F1, or choose Manual in the account menu, to read the help of the page that you see.
- Click the sidebar button at the left end of the top bar to hide or show the sidebar.
- Under 1100 px, the Files and Terminal buttons sit in the More menu.
- Click the Terminal button to open or close the terminal drawer. Terminal and Manual are not tabs. The Ask bar and the menu of the window keep their entries.
- Click Sync to sync. Click the arrow joined to it to Fetch only or to Push.
- When an error has a button that opens a setting, click it. The page opens on the exact row, moves the focus to its control and marks it for 2 seconds.
- Hold Ctrl (Cmd on a Mac) and turn the mouse wheel on a diagram or an image to zoom. Drag to move it. Use Full screen for a large view.
- Press Ctrl+= and Ctrl+- to change the text size, and Ctrl+0 to go back to 16 px. Settings / Me has the same choice.
- Press Ctrl+Shift+K to see all the keyboard shortcuts.

## Your role

In Settings, then Me, choose your role. The role sets the space that opens first. A tech lead starts in Flow. A project manager starts in Flow.

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

Hover a marked word in the checklist, in the tour or on an empty page, or move the keyboard focus to it. One sentence explains it, with a link to the manual. The marked words are issue tracker, code host, AI tool, model, spec, decision, run and pull request.

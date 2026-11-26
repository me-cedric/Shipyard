# Getting started

Shipyard helps a team deliver a software project: the features, the plan, the people and the agents, the specs, the design and the code. Everything stays in the files of the project, so the team shares it with git.

## The window

- The left bar holds the seven places: Today, Flow, Plan, Crew, Library, Code and Setup. This manual has one page for each place.
- The sections of a place sit at the top of the page, in one switch. Library has no switch: it opens on four doors, and each of its pages has a Library link that goes back to them.
- The inspector on the right shows the item that you select.
- The sidebar also holds the project name at its top and your account at its foot.
  - The project name opens a menu with your projects and the Projects page.
  - Your account opens the account menu, beside the rail. The account row shows your name and your initials.
- The top row of each page holds the sidebar button, Back and Forward, the bar Ask or tell Shipyard, the sync mark, and the Assistant and Terminal buttons, which open the assistant panel and the terminal from any page. The window has no top bar and no status bar.
  - The sync mark shows the state of the repository. Click it to see the changed files, the branch, Sync and Commit. See the page Code, Sync. A role that has no access to Code sees no changed files and no Commit there.
  - Ask or tell Shipyard is the one bar for a question, a place and an action. See the page The Ask bar.
  - The account menu holds your name and role with Change (Setup / Me), Theme (Light, Dark, System), Language, Manual, Shortcuts, What is new, Show the tour again, Check for an update, About Shipyard with the version, and Health. Shortcuts and What is new open as dialogs.
- Under 1100 px, the Files and Terminal buttons sit in the More menu.

The window opens at the size where you closed it. To keep the data of the app next to the app (on a USB key, for example), put an empty file named `portable` next to the app.

## The menu bar item

- A click opens a small panel. The header names the project and the sync state (In sync, or Sync failed). Then come the things that need you (the same list as Today), Working now with two runs, All n in its heading row for the rest, each run with Stop, the reminder to log time, Agents with the spend of today and of the month and the agents switch, Sync, and Open Shipyard. The footer stays at the bottom while the middle scrolls.
- A click opens a small panel: the spend of today and of the month, the active runs with Stop, the things that need you (the same list as Today), the reminder to log time, the agents switch, the sync state, the project and Open Shipyard.
- The panel asks for the same click as the app for each action that writes.
- In Setup, then Me, turn the menu bar item off.

## First launch

The first-run page shows at the first launch only. It asks one question: which role fits you? Pick one tile (Product owner, Project manager, Architect, Tech lead, Business analyst, Developer, Tester, Designer, Viewer or Other), then click Continue. The viewer tile says "I only look". Then open a project, clone a repository or start a new project, or pick a recent project. After that, when no project is open (for example after Close project), one card says No project is open, with New project and Open a project. See the page Projects.

On Today, one small setup card names the next step of the list: project, AI tool, models, issue tracker, code host, team, permissions, first decision, first spec, first assigned ticket and first run. Each step has one action that names the real next step, such as Install, Sign in, Choose or Connect. Continue on the card opens Setup / Start, which shows the same steps, one question at a time. On Today the card hides when nothing is left to do.

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

## Your role

In Setup, then Me, choose your role. The role sets the page that opens first and the panels on Today. See the page Crew, Rights.

| Role | First page |
|---|---|
| Product owner | Flow / List |
| Project manager | Plan / Timeline |
| Architect | Library / Decisions |
| Tech lead | Flow |
| Business analyst | Library / Specs |
| Developer | Flow |
| Tester | Library / Test plans |
| Designer | Library / Screens |
| Viewer (I only look) | Today |

When your role cannot see its first page, Today opens. With no role, Today opens.

## Find your way

- Press Ctrl+K (Cmd+K on a Mac) to move to the Ask bar. Type the name of a page, an item or an action, then use the arrow keys and Enter.
- Press Ctrl+1 to Ctrl+7 to go to a place.
- Press F1, or choose Manual in the account menu, or choose Open the manual for this page in the Ask bar, to read the help of the page that you see. The manual opens on the page of the place, at the section that you were on.
- Press Ctrl+[ and Ctrl+] (Cmd on a Mac), or click Back and Forward in the top row, to move between the pages that you opened.
- Click the sidebar button at the left end of the top row to hide or show the sidebar.
- Choose Terminal or Files in the bar Ask or tell Shipyard to open or close the terminal drawer or the files drawer.
- An address of an older version still works: it opens the page that holds the same function now.
- When an error has a button that opens a setting, click it. The page opens on the exact row, moves the focus to its control and marks it for 2 seconds.
- Hold Ctrl (Cmd on a Mac) and turn the mouse wheel on a diagram or an image to zoom. Drag to move it. Use Full screen for a large view.
- Press Ctrl+= and Ctrl+- to change the text size, and Ctrl+0 to go back to 16 px. Setup / Me has the same choice.
- Press Ctrl+Shift+K to see all the keyboard shortcuts.
- Each button, field and switch is 44 px high or more. The pages work in a window of 960 by 600 px with no sideways scroll.

## Safe by default

- The app never sends a change to an issue tracker or a code host without your click.
- A token goes to the keychain of your computer. The app never shows it again.
- A project with a read-only profile takes no change.

## Words

| Word | Meaning |
|---|---|
| Place | One entry of the left bar, such as Flow or Library. |
| Feature | One thing to build. Flow shows it once, with its ticket, its spec, its agent work and its pull request. |
| Recipe | The steps that an agent follows on a feature: plan, work, review, then a pull request. |
| Crew | The people and the agents of the project. |
| Ref | The short name of an item, such as `adr:0003` or `wi:ACME-12`. Click a ref to open its item. |
| Issue tracker | The tool that holds the tickets: Jira, GitHub, GitLab, Azure DevOps or Linear. |
| Code host | The server that holds the code: GitHub or GitLab. |
| Run | One job of an agent on one ticket. |
| Spec | A text that says what the product must do. |
| ADR | A decision record: one decision, its options and its reasons. |
| MCP server | A tool that an agent can call, such as Jira or Figma. |

Hover a marked word in the checklist, in the tour or on an empty page, or move the keyboard focus to it. One sentence explains it, with a link to the manual. The marked words are issue tracker, code host, AI tool, model, spec, decision, run and pull request.

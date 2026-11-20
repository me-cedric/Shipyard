# The Ask bar

Ask or tell Shipyard, in the top row of each page, is the one bar for a question, a place and an action. Press Ctrl+K (Cmd+K on a Mac) to move to it. Type, then use the arrow keys and Enter. Escape closes it.

## Go to

Go to opens a place, a section, a project, an item or a search result.

Type a few words to search the text of your documents, decisions, specs, questions, tickets and designs. Case and accents do not matter ("decision" finds "décision"), every word must match, and the last word can be a start. Results group by kind, show a short extract with the words marked, and put a page that many items cite first. The document that you open from a result marks the words.

Choose Ask the assistant to put those items as context in the message box of the assistant. Nothing is sent until you send it.

## Do

Do starts an action or a prompt for the page that you see. Examples: New feature, Start an agent on a ticket (it opens the page New feature), Sync now, Open the manual for this page, Replay the tour. An action that your role cannot use does not show.

## Ask

Ask what blocks, what stopped or what needs you. The answer names each feature and gives its action: Reply, Unblock, Add budget, Try again, Resume or Close as done. Reply opens one field in the answer: type the text, then click Send. Go to and Do sit under the answer, and Open the full assistant opens the page Ask.

Any other text goes to the assistant when you press Enter.

## The assistant

The assistant opens on the side. Ask it a question about the project. Each conversation is a tab, and a dot marks a tab with a new reply. The answer shows how it found the result under How I found this.

- Under the message box, one bar has the attach button, one button with the model and the effort (it opens the models of the AI tool, the effort levels and the models of the other AI tools), the permission, the context ring and Send.
- In the mode Do the permission is Edit with approval, Auto (accepts edits) or Bypass permissions. Bypass skips every approval of Claude Code or Codex: Shipyard asks you the first time in each project, shows it in red while it is on, and refuses it in a read-only project and while the agents switch is off.
- Type `/` at the start of a message to list the commands of the selected AI tool. The text goes to the AI tool as you typed it.
- Each conversation keeps one agent session, so a later message continues the earlier work.
- The changed files sit in the answer, each with a preview and Undo. Undo drops the changes that the assistant made to that file, after you confirm. Without Undo, the changes stay.
- Select a text in a page to send it to the assistant, or to an agent with Send to an agent.

## The page Ask

The full assistant is the page Ask, at `/ask`. Open the full assistant in the Ask bar, or the side panel, opens it. Small bar goes back to the side panel.

- The page has three columns: the conversations on the left, the thread with the message box in the middle, and the tools on the right.
- The tools are This screen (what the assistant can see, with Add), The assistant may (Edit files alone, and Run commands alone for an AI tool that has it) and Panel (the side and the width of the side panel).
- With Codex as the AI tool, a card asks: Codex asks: trust this folder? Not now hides the card for this visit. Trust this folder adds the folder to the Codex config file. What this writes shows the exact change, and nothing is written before you click.

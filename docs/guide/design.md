# Design

Design keeps the architecture of the project: diagrams, decisions, API contracts, data models, network flows and screens. Each item is a file of the project. Select an item to see, in the inspector, the items that cite it.

## Create or change an item

1. Open the tab, then select an item. Or click the main action of the tab to create one.
2. Change the text or the drawing. The preview follows.
3. Click Save. The app writes the whole file or nothing.

## Delete an item

Open the menu of an item (right-click) and choose Delete, or click Delete in the inspector. The app names the file and asks once. The file then goes to the Trash. A read-only project refuses the delete.

## Rename an item and ask the assistant

The item menu has Rename. Type the new name; the extension stays. Review lists each file and line whose links change. Rename then moves the file and rewrites those links in one step. If a write fails, every file stays as it was. A read-only project refuses the rename. The last group of the menu is Ask the assistant: pick a prompt for this kind of item and your role. It fills the message box with the item, its file, its spec, its ticket and the items that cite it. Nothing is sent until you send it.

When somebody changes the file at the same time, the app tells you. Choose Reload to take their version, or Keep mine.

## Diagrams

Diagrams holds the drawings of the project: Excalidraw, Mermaid, draw.io and BPMN. Draw in the editor, then save.

## Architecture

Architecture shows the architecture models of the project as views. The views are drawn from the text of the model.

A diagram or a picture, in Architecture and in Screens, fits its frame and sits in the centre when it opens. To move it:

- Pan: drag it, or use a sideways gesture on the trackpad. A vertical wheel scrolls the page.
- Zoom: pinch, or hold Ctrl or Cmd and turn the wheel.
- Keyboard: click the frame to focus it, then press the arrow keys to pan, + or - to zoom and 0 to fit.
- Fit brings the whole diagram back into the frame.

## Decisions

Decisions holds the decision records (ADRs). Each record gives one decision, the options and the reasons.

- Click New decision to write one. A form asks for each part.
- Accept or reject a proposed decision with one click.

## API

API shows the API contracts. Open a contract to read its routes. Try a route against a server of the contract.

## Data

Data shows the data models: the tables and the links between them.

## Flows

Flows lists the network flows as a table: from where, to where, the port and the protocol. Add, change or remove a row, then save.

## Screens

Screens shows the screens of the product and the design tokens of your project. They come from the design doc (CSS in a code block), from a `tokens.css` file, from a `*.tokens.json` file or from a Tailwind 4 `@theme` block, grouped by file. With no token the page says No tokens yet; click Add tokens to the design doc, edit the block, then save. The page never shows the tokens of Shipyard.

- A `.fig` file shows the preview that Figma keeps in it.
- To read Figma, add the token of your Figma account once. It goes to the keychain of your computer.
- Then paste the address of a Figma project and click List the files. Each file shows its preview and its design tokens.

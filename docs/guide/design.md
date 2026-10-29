# Design

Design keeps the architecture artifacts of the project in the repository. Each artifact has a ref and shows its backlinks in the inspector.

| Tab | Content |
|---|---|
| Diagrams | Excalidraw, Mermaid, draw.io and BPMN diagrams. |
| Architecture | Architecture models, drawn from their text. |
| Decisions | ADRs. Accept or reject an ADR, or add a comment. |
| API | API contracts. |
| Data | Data models. |
| Flows | Network flows, as tables. |
| Screens | Screens and the design tokens of the project. |

## Edit an artifact

1. Open the tab and select an artifact, or click the primary action to create one.
2. Edit the text. The preview updates.
3. Save. The app writes the file in full or not at all.

If the file changes on disk, the editor says so. Choose Reload or Keep mine.

## Tokens

Screens shows the colour tokens of the app, by family with a count. It reads `src/ui/tokens/tokens.css` and changes no file. A Figma comparison needs a Figma connection.

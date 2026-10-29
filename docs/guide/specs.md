# Specs

Specs holds the OpenSpec changes of the project and the RAID register.

| Tab | Content |
|---|---|
| Changes | The changes with the status of each artifact: missing, draft or done. |
| Capabilities | The settled capabilities, with their requirements. |
| Questions | The RAID register. Filter by kind, status and owner. |
| Test plans | Gherkin test plans. Each scenario cites requirements by ref. |
| Constitution | The constitution of the project. |

## Write a change

1. In Changes, click New change. The app uses the `shipyard-delivery` schema.
2. Edit each artifact in its editor.
3. Validate the change. Each finding shows on its artifact, with its line.

## Questions

A question is one file in `docs/delivery/questions/`. The app refuses an unknown kind, an unknown status and a duplicate id. Each `[NEEDS CLARIFICATION]` marker links to its question.

After you answer a spec question, one click writes the answer into the `### Clarifications` heading of the spec.

## Split a change

A person or the `spec-split` workflow drafts epics and stories. The PM reviews the draft. The apply to the tracker needs one click.

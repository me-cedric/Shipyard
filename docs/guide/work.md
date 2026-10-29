# Work

Work shows the tickets of the project tracker and the plan of the team. It reads a local mirror, so it works offline.

| Tab | Content |
|---|---|
| Backlog | Tickets grouped by status. Filter by status, assignee, label and run state. |
| Board | One column for each status. Move a card with the pointer or the keyboard. |
| Plan | A Gantt chart from a sheet, the team and a calendar. |
| Estimates | One sheet for each lot, in four views. |
| Team | The members of `.shipyard/team.yaml`. |
| Time | Time entries by member and month. |

## Tickets

- Import: the app shows the count first. It writes nothing until you confirm.
- Assign: pick a member. The ranking by skill and capacity is a suggestion only.
- Mark for the agent: one click adds the pickup label.
- Move a card: the app sends the transition. If the tracker refuses, the card returns and shows the reason.

## Estimates and plan

The app computes price, cost and margin from the day rates. It never stores a total. Seal the project with a passphrase to hide the day rates in the files. Without the passphrase, the app shows a locked state.

## Apply and time

Apply to the tracker shows the rows to create or update first. A second apply creates no duplicate. A time entry needs a member that the team resolves. The app sends a worklog only after your click.

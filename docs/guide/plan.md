# Plan

Plan holds the schedule, the load of the people, the estimates and the time. The switch has four sections: Timeline, People, Estimates and Time. Timeline, People and Estimates share one estimate sheet: the sheet stays in the address.

## Timeline

Timeline draws the schedule of a lot as a Gantt chart, from an estimate sheet, the team and the calendar. The title gives the day that the release ends.

- Dates and days off sets the working days and the public holidays.
- Export the chart as a picture.

When a person has too much work, one card names the problem and lists proposals: a task goes to a person of the same role with room, or it starts later. Apply does one proposal. Rebalance does each of them.

## People

People shows each person with the load against the capacity of each week, the tasks and their dates. A person with too much work has the proposals there too. Send to the issue tracker opens a page with a preview first: New, Changed and Stays the same, each with its count. Nothing goes to the issue tracker before you click Apply.

## Estimates

Estimates holds one sheet for each lot. Each row has a low, a likely and a high estimate. The app computes the price, the cost and the margin from the day rates. One switch shows the sheet as Backlog, Summary, Spread, Portfolio or Costing.

- Duplicate, rename, freeze or delete a sheet from its menu.
- Seal the project with a passphrase to hide the day rates in the files.
- Ask an agent to estimate: select tasks, then click it. The agent proposes a Best, a Likely and a Worst value with its assumptions. A value enters the sheet only when you click Accept. Discard drops the proposal. The agent shows in Crew / Sessions while it works. Stop ends it, and the sheet keeps its values. The action is off on a sealed sheet and on a frozen sheet.

## Time

A week grid shows a row for each ticket and a column for each day. Type the hours in a cell to add or change an entry. Empty the cell to delete the entry, after you confirm. A cell with two entries or more shows the sum: change them in the list of the month.

Under the grid, the month lists the time that each person spent. The app sends a time entry to the issue tracker only after your click.

Click Read the month to read the worklogs of the month from the issue tracker, beside your entries. This changes nothing.

A role with fewer than three members with a day rate shows no cost. With one or two rates, a cost would show the rate of a person.

## Pages

A sub-page has its own address and a back link. Estimates also keeps its sheet in the address.

- Timeline: `/plan/timeline`. Dates and days off are at `?page=dates`.
- People: `/plan/people`. Send to the issue tracker is at `?page=send`.
- Time: `/plan/time`.
- Estimates: `/plan/estimates`. The views are `?tab=summary` (sheets) and `?tab=costing`. One estimate opens at `?task=<id>` and the import from Excel at `?page=import`. Search, filters, columns and the actions of the sheet are in the More menu.

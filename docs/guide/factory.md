# Factory

The factory runs agents on tickets. Each run follows a workflow.

| Tab | Content |
|---|---|
| Runs | Six lanes with counts. Open a run to see its graph, events, diff and cost. |
| Workflows | The workflows and roles of `.shipyard/`. Edit and save them. |
| Agents map | The workflows, roles and skills as a graph. |
| Sessions | The agent sessions, and the kill switch. |
| Usage | Tokens and money by day and member, against budgets. |

## Runs

- Start a run from a ticket key.
- Approve a plan, answer a question, unblock or cancel a run from its view.
- A draft pull request sits in In review. A clear pull request with green checks sits in Ready to merge.

## Safety

- Four write switches are off by default. A write with its switch off becomes an approval in the Inbox.
- A budget alert shows at 80 percent. The run pauses at 100 percent.
- The global kill switch cancels every active run and stops pickup.
- A broken workflow file shows its error and its line. The last valid version keeps running.

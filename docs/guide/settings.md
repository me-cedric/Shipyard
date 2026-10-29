# Settings

| Tab | Content |
|---|---|
| Project | Paths, the default workflow, per-project overrides, automation and the Legacy import. |
| Connections | Trackers, forges, MCP servers, agent runners and model providers. |
| Agents and rules | The compass entries, with an Upgrade action. |
| Extensions | The catalog, plugins and child projects. |
| Team | The team of the project. |
| Me | Your settings. They apply in every project. |
| Health | The findings of the project, each with one fix. |

## Connections

A connection stores its secret in the OS keychain. The app never shows a secret again. Each tracker shows six capability flags. A test names the missing scope or permission. Removing a connection lists the projects that use it first.

## Legacy import

In Project, choose a Legacy repository. The app writes Shipyard files into the project. It never replaces a file and never changes the source. A file that exists is a conflict. A file that the app cannot read is skipped with a reason.

## Agents and rules

The app never changes the pinned compass version by itself. Apply writes an entry and keeps each file that exists. A selection in Upgrade chooses absent entries only. Stale entries update together.

## Extensions

A plugin imports as data. The review lists each file and setting. The app writes only the items that you accept. A deploy to a child project makes a branch and a commit in a local clone. It never pushes.

## Me

Me holds the theme, the density, the contrast, the language, the role and the release address. It also turns each notification source on or off. After a newer version appears, the notification centre shows its changes once. The app installs nothing.

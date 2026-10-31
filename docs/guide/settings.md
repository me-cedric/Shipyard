# Settings

Settings holds the settings of the project, your connections and your own choices.

## Project

Project holds the folders of the project, the default workflow, the automation switches and the project import. Settings that are rarely changed sit under Advanced.

Agent review of each pull request is one choice: Off, Draft or Post. Draft keeps a review for you to read and post. Post adds a comment review by itself and never approves. The choice goes to .shipyard/automation.yaml.

## Connections

Connections links the app to your tools.

- Issue trackers and code hosts: Jira, GitHub, GitLab, Azure DevOps and Linear. Click Add, choose the product, then paste a token. The app opens the page that makes the token. A test runs when you save.
- MCP servers: the tools that agents can call. They are grouped by category. Click Add the recommended set to turn on the servers that suit the project. Click Test on a server, or Test all, to see if each one works and how many tools it gives.
- Agent runners and model providers: the agent programs on this computer and the model services.

- GitLab tools: sign in to GitLab with the browser. The GitLab tools switch then adds the GitLab MCP server of that code host for the assistant. It uses the same sign-in and no other token. A connection that signed in before shows Sign in again once. The server needs GitLab 18.3 or later and access to MCP for your group or instance.

A token goes to the keychain of your computer. The app never shows it again.

## Agents and rules

Agents and rules holds the rules and the skills of the agents, from the compass.

1. Click Install the contract to write the agent rules into the project.
2. Under Objectives, pick what you want: for example Code quality or Specs first. Click Apply. The app turns on the skills that suit the project.
3. Under External skills, each source shows its state: Current, Update ready or Edited. Click Refresh external skills to take the updates. Click Reinstall to put back the original files of one source.

The app keeps each file that a person changed, unless you reinstall.

## Extensions

Extensions holds the catalog, the plugins and the child projects.

- Catalog: ready-made parts. Click Deploy to add one to the project.
- Plugins: a plugin is a .zip file. The app reads it as data and lists each file and each setting. It writes only the items that you accept. Click Settings on an installed plugin to fill its settings in a form, then save.
- Child projects: other projects that take the same rules. Clone a child, then click Deploy. The app makes a branch and a commit in the clone. It never pushes.

## Me

Me holds your own settings: theme, density, contrast, language, role and notifications. They apply in every project.

## Health

Health lists the problems of the project. Each problem has one button that fixes it.

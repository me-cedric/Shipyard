# Settings

Settings holds the settings of the project, your connections and your own choices.

## Project

Project holds the folders of the project, the default workflow, the automation switches and the project import. Settings that are rarely changed sit under Advanced.

Agent review of each pull request is one choice: Off, Draft or Post. Draft keeps a review for you to read and post. Post adds a comment review by itself and never approves. The choice goes to .shipyard/automation.yaml.

## Connections

Connections links the app to your tools.

- Issue trackers and code hosts: Jira, GitHub, GitLab, Azure DevOps and Linear. Click Add, choose the product, then paste a token. The app opens the page that makes the token. A test runs when you save.
- MCP servers: the tools that agents can call. They are grouped by category. Click Add the recommended set to turn on the servers that suit the project. Click Test on a server, or Test all, to see if each one works and how many tools it gives. Each server has an Allow list: All tools, Read only (the tools that the server marks as read only, else none) or Custom, where you tick the tools. A tool that is not on the list is hidden from the agents and refused when called.
- Outside agents: Shipyard can serve its tools to an agent that you start yourself. Turn the server on, choose the tool groups, then look at Agent tools. It lists Claude Code, Codex, Gemini and VS Code when it finds them, each as Wired, Out of date or Not wired. Click Wire to see the file as it would be written. The file changes only when you click Write the file, and the rest of the file stays. After you change the port, a wired tool shows Out of date: click Update. The Allow list has two presets, All tools and Read only, and you can pick tools one by one. The skills of the project are MCP prompts and the files of the project are MCP resources, while Read files is on.
- Custom MCP server: choose Custom in Add, or paste the JSON (`mcpServers`) of a server in Paste JSON. A secret value goes to the keychain, not to a file. A secret in the arguments is refused: move it to the variables.
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
- Plugins: a plugin is a .zip file. The app reads it as data and lists each file and each setting. It writes only the items that you accept. Click Settings on an installed plugin to fill its settings in a form, then save: the files that the new values change show in the review. To write a plugin, click New plugin (it copies a sample and opens it as a project), edit it, click Try in this project to see the review of a folder, and click Package to make the .zip. A fault in manifest.json shows with its line; click it to open that line. A plugin can add skills and rules, and can use {{config.<key>}} in text files.
- Child projects: other projects that take the same rules. Clone a child, then click Deploy. The app makes a branch and a commit in the clone. It never pushes.

## Me

Me holds your own settings: theme, density, contrast, language, role and notifications. They apply in every project. Motion is As the system or Reduce, and the Focus ring shows With the keyboard or Always, 2 or 3 px wide; a preview beside them shows the choice at once.

Each source of notifications has its own switch, on by default. The sources are: a question, an approval, a run that needs you, a failed sync, an update, a moved remote branch, a run that ends, the checks of your pull requests, a failed scan that you did not start, and an agent review draft that is ready to post. A switch that is off stops the entry in the centre and the system notice. Click an entry to open its run, pull request, Quality page or draft. The system shows a notice for a failed run, failed checks and a review draft, and for the older sources, while the window is in the background.

## Health

Health lists the problems of the project. Each problem has one button that fixes it.

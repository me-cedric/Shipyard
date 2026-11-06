# Settings

Settings holds the settings of the project, your connections and your own choices.

## Project

Project holds the folders of the project, the default workflow, the automation switches and the project import. Settings that are rarely changed sit under Advanced.

The docs language and the pull request language set the language of the specs, documents and pull request text of the agents. Code and comments stay in English. A change applies to the next agent brief and pull request only. Existing docs stay as they are.

Agent review of each pull request is one choice: Off, Draft or Post. Draft keeps a review for you to read and post. Post adds a comment review by itself and never approves. The choice goes to .shipyard/automation.yaml.

The `docs` list of the project file says which docs follow which code. Each rule has `code` (path patterns) and `feeds` (doc folders or paths), and an optional `name`. Without the list, the specs feed the other doc folders.

```yaml
docs:
  - name: crates
    code: ["crates/*/Cargo.toml"]
    feeds: [models]
```

## Connections

Connections links the app to your tools.

- Issue trackers and code hosts: Jira, GitHub, GitLab, Azure DevOps and Linear. Click Add, choose the product, then paste a token. The app opens the page that makes the token. A test runs when you save.
- MCP servers: the tools that agents can call. They are grouped by category. Click Add the recommended set to turn on the servers that suit the project. Click Test on a server, or Test all, to see if each one works and how many tools it gives. Each server has an Allow list: All tools, Read only (the tools that the server marks as read only, else none) or Custom, where you tick the tools. A tool that is not on the list is hidden from the agents and refused when called.
- Outside agents: Shipyard can serve its tools to an agent that you start yourself. Turn the server on, choose the tool groups, then look at Agent tools. It lists Claude Code, Codex, Gemini and VS Code when it finds them, each as Wired, Out of date or Not wired. Click Wire to see the file as it would be written. The file changes only when you click Write the file, and the rest of the file stays. After you change the port, a wired tool shows Out of date: click Update. The Allow list has two presets, All tools and Read only, and you can pick tools one by one. The skills of the project are MCP prompts and the files of the project are MCP resources, while Read files is on.
- Custom MCP server: choose Custom in Add, or paste the JSON (`mcpServers`) of a server in Paste JSON. A secret value goes to the keychain, not to a file. A secret in the arguments is refused: move it to the variables.
- AI tools and model providers: the AI coding tools on this computer and the model services.

- GitLab tools: sign in to GitLab with the browser. The GitLab tools switch then adds the GitLab MCP server of that code host for the assistant. It uses the same sign-in and no other token. A connection that signed in before shows Sign in again once. The server needs GitLab 18.3 or later and access to MCP for your group or instance.

A token goes to the keychain of your computer. The app never shows it again.

## Agents and rules

Agents and rules holds the rules and the skills of the agents, from the compass.

1. Click Install the contract to write the agent rules into the project.
2. Under Objectives, pick what you want: for example Code quality or Specs first. Click Apply. The app turns on the skills that suit the project.
3. Under External skills, each source shows its state: Current, Update ready, Edited or Not in this project. A source that you installed for yourself (your skill folders or an agent plugin) and that the project does not hold shows On your computer: Install adds it to the project for the team. Click Refresh external skills to take the updates. Click Reinstall to put back the original files of one source.

The app keeps each file that a person changed, unless you reinstall.

### AI tools

The top of the page lists each coding tool that the app knows: Claude Code, Codex, GitHub Copilot, OpenCode and Gemini CLI (the `agy` program counts as Gemini CLI). Each row shows the name, the version, the state and one action.

- Signed in: the tool is ready. The row has no action.
- Signed out: click Sign in. The terminal drawer opens and runs the login of the tool. Finish in the browser. The state changes when the login ends. For Codex, click Use a code instead to sign in with a code.
- Not checked: Copilot, OpenCode and Gemini CLI have no status command that the app can read. Click Sign in. When a run of one of these tools fails because it is not signed in, the row shows Signed out.
- Not installed: click Install.

The app asks the tool for its state and never reads its token files or its keychain entries.

### AI providers

Under the tools, one row lists each provider.

- OpenRouter: click Sign in. The browser opens. Approve there, and the app stores the key in the keychain. Click Cancel to stop the wait. The wait ends after 10 minutes.
- Ollama, LM Studio, vLLM and LiteLLM: the app looks on this machine only. A runtime that answers shows a row with Add. Add makes a provider with no key.
- OpenAI, Anthropic, Mistral, Google AI Studio and Azure OpenAI: click Get a key to open the key page of the provider. Click Paste key, paste the key and click Save (or press Enter). The app tests the key first. A key that fails is not stored, and the row shows the reason and what to do. Azure OpenAI also asks for the address of your resource.

A key goes to the keychain only. It never goes to a file, a log or an address.

## Extensions

Extensions holds the catalog, the plugins and the child projects.

- Catalog: ready-made parts. Click Deploy to add one to the project.
- Plugins: a plugin is a .zip file. The app reads it as data and lists each file and each setting. It writes only the items that you accept. Click Settings on an installed plugin to fill its settings in a form, then save: the files that the new values change show in the review. To write a plugin, click New plugin (it copies a sample and opens it as a project), edit it, click Try in this project to see the review of a folder, and click Package to make the .zip. A fault in manifest.json shows with its line; click it to open that line. A plugin can add skills, rules and themes, and can use {{config.<key>}} in text files. A theme goes to the theme library of this computer (see Theming).
- Child projects: other projects that take the same rules. Clone a child, then click Deploy. The app makes a branch and a commit in the clone. It never pushes.

## Me

Me holds your own settings: theme, density, contrast, language, role and notifications. They apply in every project. The theme is Light, Dark, OLED, System, "System, OLED when dark" or a theme that you imported. Theme files imports a theme with a preview, and exports the current theme; see the Theming page. The language is English, French, German, Spanish or a language that you imported. Language files imports a language file: Shipyard lists each fault, or shows how many texts it translates before Add. Export English writes every text in English, as the start of a new language: change the code, the name and the texts. A text that a language file does not translate shows in English, and Mark untranslated text shows each one with a mark. A plugin can add a language too. Motion is As the system or Reduce, and the Focus ring shows With the keyboard or Always, 2 or 3 px wide; a preview beside them shows the choice at once.

Each source of notifications has its own switch, on by default. The sources are: a question, an approval, a run that needs you, a failed sync, an update, a moved remote branch, a run that ends, the checks of your pull requests, a failed scan that you did not start, and an agent review draft that is ready to post. A switch that is off stops the entry in the centre and the system notice. Click an entry to open its run, pull request, Quality page or draft. The system shows a notice for a failed run, failed checks and a review draft, and for the older sources, while the window is in the background.

Permissions shows the notifications and the Documents, Desktop and Downloads folders with their state and one action (see Getting started, Permissions), and Replay the tour.

## Health

Health lists the problems of the project. Each problem has one button that fixes it.

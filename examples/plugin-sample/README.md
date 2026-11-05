# Sample plugin

This folder is a complete Shipyard plugin. Copy it, change it, and package it.
In Shipyard, open Settings / Extensions and click New plugin to get a copy.

## What a plugin holds

| Part | Where | What it does |
|---|---|---|
| `manifest.json` | folder root | Names the plugin and lists its parts. |
| Skills | `files/skills/<name>/` | Copied to `.claude/skills/<name>/` and `.agents/skills/<name>/`. |
| Rules | `files/rules/<name>.md` | Copied to `.claude/rules/` and `.agents/rules/`. |
| Other files | `files/` and the `files` list | Copied to the project root, or to the `target` that you name. |
| Settings | `settings` | Typed values: `text`, `number`, `boolean`, `choice`. |
| MCP servers | `mcpServers` | Remote servers only. They show in Settings / Connections. |

`plugin-manifest.schema.json` describes the manifest. The `$schema` line gives your editor
completion and checks.

## Settings in files

Write `{{config.<key>}}` in a text file. Shipyard fills it with the value of the setting
when the plugin is applied. The review shows each file with the values filled in.
When a person changes a setting later, Shipyard shows the files that change, through
the same review. A setting that does not exist is an error.
A value is inserted as text: a `{{` in a value is not read again.

## What a plugin cannot do

- It cannot run code. There are no install hooks and no scripts.
- It cannot name a local MCP server (`command`, `args`, `env`). Shipyard refuses it.
- It cannot hold a secret. A header value must be a `${VAR}` reference. The person
  fills the variable in Settings / Connections.
- It cannot use an address that is not `https`.
- It cannot write outside the project. A path with `..` or a link is refused.
- It cannot replace a file that exists. Shipyard keeps the file and says so.
  An unedited file from an earlier version of the plugin is updated.

## Limits

- At most 500 files and 10 MB after unpacking.
- `manifest.json` is at most 64 KB.
- A setting value is at most 4096 characters.

## Work loop

1. Edit the files.
2. Click Try in this project. Shipyard reads the folder and shows the review. Nothing is written until you accept.
3. Fix each error. An error shows the file and the line. Click it to open that line.
4. Click Package. Shipyard makes the `.zip`.

## Errors

| Error | Cause | Fix |
|---|---|---|
| `manifest.json:<line>: unknown field` | A key that the manifest does not know. | Remove it or fix the spelling. |
| `manifest.json:<line>: bad name` | The name is empty, has a slash, or starts with a dot. | Use a plain name. |
| `manifest.json:<line>: <key>: ... not a valid ... value` | A default does not fit its type. | Fix the default or the type. |
| `manifest.json:<line>: skills <name>` or `rules <name>` | The name is not plain, or its files are missing. | Add `files/skills/<name>/` or `files/rules/<name>.md`. |
| `<file>: no setting named <key>` | `{{config.<key>}}` names no setting. | Add the setting or fix the key. |
| `manifest.json:<line>: names <source>` | The `files` list names a file that is not in `files/`. | Add the file or fix the list. |
| `the plugin holds a secret value` | A setting such as `api_token` has a value. | Use a `${VAR}` reference. |
| `path not allowed: <path>` | A path leaves the project. | Use a relative path inside the project. |
| `a link is not allowed` | A symbolic link is in the folder. | Copy the file instead. |
| `the archive is too large` or `holds more than 500 files` | A limit is passed. | Remove files. |
| `mcp:<name>: a local command` | The server runs a command. | Use a remote `https` server. |
| `mcp:<name>: no https address` | The `url` is missing or is not `https`. | Use an `https` address. |
| `mcp:<name>: a secret value in the header <h>` | A header value is not a `${VAR}` reference. | Use `${VAR}`. |

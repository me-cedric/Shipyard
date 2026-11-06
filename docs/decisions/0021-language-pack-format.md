---
status: proposed
date: 2026-11-06
decision-makers: [Cédric Meyer]
---
# Language pack format: flat JSON keys, data only
## Context and problem statement
A person adds a language to Shipyard from a file or from a plugin (spec `languages`). The texts of the interface live in typed catalogues in `src/lib/i18n/`. A pack comes from outside the app, so it must not run code, and an old pack must keep working after an update that adds or removes texts.
## Decision drivers
- A translator with little technical knowledge edits one file in a text editor.
- An author starts from the English base and sees what is left.
- A pack is data: no script, no markup, no web address.
- One key list: the English catalogue. No second list to keep in step.
## Considered options
- A JSON file with a flat map of keys (`common.close`).
- A JSON file with the nested tree of the catalogue.
- A gettext `.po` file.
## Decision outcome
Chosen option: the flat JSON map. Each key is one line, a diff shows one text, and the backend type is a map of text to text, so a nested value or a number fails in serde. A nested tree mirrors the code but lets a value be an object at any level. A `.po` file needs a parser and has no place for the error sentences.

```json
{
	"shipyardLanguage": 1,
	"code": "pt-BR",
	"name": "Português (Brasil)",
	"messages": {
		"common.close": "Fechar",
		"error.no_project": "Abra ou crie um projeto primeiro.",
		"action.sync": "Sincronizar"
	}
}
```

- `shipyardLanguage` is the format version. Only `1` exists.
- `code` is a language tag: 2 or 3 lower case letters, then parts of 2 to 8 letters or digits after `-`. `con`, `aux`, `nul` and `prn` are refused, and the file name is the code in lower case. It cannot be `en`, `fr`, `de` or `es`: a pack adds a language and never replaces a built-in one. It is the file name in the library and the page language.
- `name` is the name of the language in that language, 1 to 60 characters.
- `messages` maps a key to a text. A key is the path in the English catalogue (`prefs.language`), `error.<code>` for an error sentence or `action.<kind>` for the label of an error action. A text is 1 to 2000 characters.
- The backend checks the file: fields, code, name, text values, 20 000 messages at most, 2 MB at most. An unknown field fails.
- The view checks the keys against the English base: an unknown key and a text with other placeholders (`{name}`) fail the import. A missing key is not a fault: the text shows in English.
- Export writes the English base with the code `xx`. The translator changes the code, the name and the texts.
- The library is `<app data>/languages/<code>.json`. A pack is personal, not a repository file.
### Consequences
- German and Spanish are built in, typed like French. A built-in language must stay complete, so a new built-in language needs a person who keeps it complete (Q-163).
- The backend cannot check the keys, because only the view knows the English catalogue. A plugin pack passes the file check in the review; an unknown key, or a text with other placeholders, of a pack in the library shows English when the view loads it (Q-160). So a pack keeps working after an update that removes a text.
- A pack shows English dates and numbers, and the assistant prompts stay English (Q-162).
- A plugin lists packs in its manifest (`languages`). The plugin review gives one item for each pack, and the pack goes to the library, not to the project. A plugin pack never replaces a different pack with the same code.
- The text of a pack goes to React as text. No pack text is read as HTML or Markdown.

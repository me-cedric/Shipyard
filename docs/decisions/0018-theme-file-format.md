---
status: proposed
date: 2026-11-05
decision-makers: [Cédric Meyer]
---
# Theme file format: JSON tokens, data only
## Context and problem statement
A person imports a theme from a file or from a plugin (spec `themes`). The theme changes the design tokens of ADR 0014. A theme comes from outside the app, so it must not run code, load a file from the web or break the layout.
## Decision drivers
- A person with little technical knowledge changes three colours and nothing else.
- An author can set each colour token.
- A theme is data: no script, no web address, no font download.
- One token list for the view, the check and the guide.
## Considered options
- A JSON file with named fields and a token map.
- A CSS file with custom properties.
- A YAML file.
## Decision outcome
Chosen option: the JSON file. A CSS file can hold any rule (`@import`, `url()`, selectors), so the check must parse CSS. JSON maps to the tokens and serde names each fault. Plugins already use a JSON manifest.

```json
{
	"shipyardTheme": 1,
	"id": "harbor-night",
	"name": "Harbor night",
	"base": "dark",
	"accent": "#3bb9fd",
	"background": "#0b1622",
	"foreground": "#e6edf3",
	"radius": 6,
	"font": "humanist",
	"tokens": { "n-11": "#9fb3c8" }
}
```

- `shipyardTheme` is the format version. Only `1` exists.
- `base` is `light`, `dark` or `oled`. Each token that the file does not set keeps the value of the base.
- The simple level: `accent`, `background` (surface 0), `foreground` (text), `radius` (controls, in px, 0 to 16), `font` (a key of the font stacks of Settings / Me). The view derives the surfaces and the neutral scale from `background` and `foreground`.
- The advanced level: `tokens`, a map from a name of `src/lib/themes/tokens.json` to a colour. A token wins over a simple field.
- A colour is `#rgb`, `#rrggbb`, `#rrggbbaa` or a colour function (`rgb`, `hsl`, `oklch`, `oklab`, `lab`, `lch`, `color`) with numbers only. So `url()`, `var()` and nested functions fail.
- An unknown field or token fails. The check lists each fault with its field.
- The library is `<app data>/themes/<id>.json`. A theme is personal, not a repository file.
### Consequences
- A theme applies as inline CSS variables on the root element. It wins over the accent choice. With the high-contrast option on, only its radius applies, so the high-contrast colours stay. The guide says so.
- A plugin theme never replaces a different theme with the same id in the library (the no-overwrite rule of plugins).
- A new token in `tokens.json` is a new advanced field. A removed token fails old files: such a change needs format version 2.
- A plugin lists themes in its manifest (`themes`). The plugin review gives one item for each theme, and the theme goes to the library, not to the project.

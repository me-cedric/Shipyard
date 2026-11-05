# Theming

Shipyard has five built-in themes and a library of themes that you import. Choose the theme in Settings / Me.

## Built-in themes

- Light and Dark.
- OLED: a true black base for an OLED screen. The raised surfaces are a small step lighter. Text meets WCAG AA (4.5:1) on each surface. The accent is the same as in Dark.
- System: Light or Dark, as the system.
- System, OLED when dark: Light or OLED, as the system.

The theme shortcut (Mod+Shift+L) goes from Light to Dark, OLED, System, then Light again.

## Import a theme

1. In Settings / Me, on the Theme files row, click Import and choose a `.json` file.
2. Shipyard checks the file. When the file has faults, a list shows each fault with its field. Nothing is saved.
3. When the file is valid, a preview shows the surfaces, the text and the accent. Click Add to save the theme and use it. Click Close to keep the current theme.

The theme goes to the library of this computer, not to the project. It shows in the Theme select with its name. A row with its name has a remove button. When you remove the current theme, its base theme applies.

When the project sets a theme in Settings / Project, the project theme wins.

## Export a theme

Click Export on the Theme files row. Shipyard writes the current theme to a `.json` file:

- An imported theme: the same file.
- A built-in theme: a file with the base and the value of each colour token, as the screen shows it. Use it as a start for your own theme.

## The theme file

A theme file is JSON. The format is in ADR 0018.

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
	"tokens": {
		"n-11": "#9fb3c8"
	}
}
```

The file `examples/theme-sample/harbor-night.json` holds this example.

### Fields

| Field | Required | Value |
|---|---|---|
| `shipyardTheme` | yes | The format version: `1`. |
| `id` | yes | 1 to 40 lower case letters, digits and `-`. A theme with the same id replaces the old one. |
| `name` | yes | 1 to 60 characters. The Theme select shows it. |
| `base` | yes | `light`, `dark` or `oled`. Each token that the file does not set keeps the value of the base. |
| `accent` | no | A colour for buttons, links, the focus ring and live states. |
| `background` | no | The colour of surface 0. Shipyard makes the other surfaces and the grey scale from it. |
| `foreground` | no | The main text colour. |
| `radius` | no | The corner radius of a control, 0 to 16 px. Small items get half, cards 1.5 times, dialogs 2 times. |
| `font` | no | `system`, `grotesk`, `humanist`, `serif` or `mono`. The fonts are on your computer: nothing is downloaded. The Interface font of Settings / Me wins. |
| `tokens` | no | The advanced level: a token name to a colour. A token wins over a simple field. |

The simple level is `base`, `accent`, `background`, `foreground`, `radius` and `font`. Most themes need only these.

### Colours

A colour is one of these:

- A hex colour: `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`.
- A colour function with numbers: `rgb()`, `hsl()`, `oklch()`, `oklab()`, `lab()`, `lch()` or `color()`, for example `oklch(0.72 0.17 150)` or `rgb(159 179 200 / 90%)`.

A theme is data. Shipyard refuses `url()`, `var()`, a function in a function, a colour name, an unknown field and an unknown token.

### Tokens

| Token | Use |
|---|---|
| `surface-0` | The base of the window. |
| `surface-1` | Panels and the side bar. |
| `surface-2` | Cards and rows. |
| `surface-3` | Menus, popovers and dialogs. |
| `n-1` to `n-5` | Backgrounds of controls, from quiet to strong, and hover. |
| `n-6` to `n-8` | Borders and separators, from quiet to strong. |
| `n-9` | Quiet icons and placeholder text. |
| `n-10` | Tertiary text. |
| `n-11` | Secondary text. |
| `n-12` | Main text. |
| `accent` | Buttons, the focus ring and live states. |
| `accent-hover` | A button under the pointer. |
| `accent-fg` | Text on an `accent` fill. |
| `accent-subtle` | A quiet accent background, such as the active tab. |
| `accent-text` | Accent text and links. |
| `success`, `warning`, `danger`, `info` | Status dots, icons and fills. |
| `success-subtle`, `warning-subtle`, `danger-subtle`, `info-subtle` | Status backgrounds. |
| `success-text`, `warning-text`, `danger-text`, `info-text` | Status text. |

The list is `src/lib/themes/tokens.json`.

### Contrast

Shipyard does not check the contrast of an imported theme. Give `n-10`, `n-11`, `n-12` and each `-text` token a contrast of 4.5:1 or more on `surface-0` to `surface-3`. An imported theme wins over the Accent colour of Settings / Me. When High contrast is on, an imported theme gives only its radius. A plugin theme never replaces a different theme with the same id.

## Themes in a plugin

A plugin can give themes. List the ids in `manifest.json` and put each file at `files/themes/<id>.json`:

```json
{
	"name": "acme-sample",
	"version": "1.0.0",
	"themes": ["acme-dusk"]
}
```

The id in the theme file must be the same as the id in the manifest. Shipyard checks each theme when it reads the plugin, as for an import. A bad theme stops the plugin with the file and the field of the fault. The review lists each theme as an item. An accepted theme goes to the theme library of this computer. It writes no project file. `examples/plugin-sample` has one theme.

# Thèmes

Shipyard a cinq thèmes intégrés et une bibliothèque de thèmes que vous importez. Choisissez le thème dans Réglages / Moi.

## Thèmes intégrés

- Clair et Sombre.
- OLED : un fond noir pur pour un écran OLED. Les surfaces surélevées sont un peu plus claires. Le texte atteint le niveau WCAG AA (4,5:1) sur chaque surface. L'accent est le même qu'en Sombre.
- Système : Clair ou Sombre, comme le système.
- Système, OLED si sombre : Clair ou OLED, comme le système.

Le raccourci du thème (Mod+Maj+L) passe de Clair à Sombre, OLED, Système, puis de nouveau Clair.

## Importer un thème

1. Dans Réglages / Moi, sur la ligne Fichiers de thème, cliquez sur Importer et choisissez un fichier `.json`.
2. Shipyard vérifie le fichier. Si le fichier a des erreurs, une liste montre chaque erreur avec son champ. Rien n'est enregistré.
3. Si le fichier est valide, un aperçu montre les surfaces, le texte et l'accent. Cliquez sur Ajouter pour enregistrer le thème et l'utiliser. Cliquez sur Fermer pour garder le thème actuel.

Le thème va dans la bibliothèque de cet ordinateur, pas dans le projet. Il apparaît avec son nom dans la liste Thème. Une ligne à son nom a un bouton pour le retirer. Quand vous retirez le thème actuel, son thème de base s'applique.

Quand le projet fixe un thème dans Réglages / Projet, le thème du projet l'emporte.

## Exporter un thème

Cliquez sur Exporter sur la ligne Fichiers de thème. Shipyard écrit le thème actuel dans un fichier `.json` :

- Un thème importé : le même fichier.
- Un thème intégré : un fichier avec la base et la valeur de chaque jeton de couleur, comme l'écran l'affiche. Partez de ce fichier pour votre propre thème.

## Le fichier de thème

Un fichier de thème est du JSON. Le format est dans l'ADR 0018.

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

Le fichier `examples/theme-sample/harbor-night.json` contient cet exemple.

### Champs

| Champ | Obligatoire | Valeur |
|---|---|---|
| `shipyardTheme` | oui | La version du format : `1`. |
| `id` | oui | 1 à 40 lettres minuscules, chiffres et `-`. Un thème avec le même id remplace l'ancien. |
| `name` | oui | 1 à 60 caractères. La liste Thème l'affiche. |
| `base` | oui | `light`, `dark` ou `oled`. Chaque jeton que le fichier ne fixe pas garde la valeur de la base. |
| `accent` | non | Une couleur pour les boutons, les liens, l'anneau de focus et les états en direct. |
| `background` | non | La couleur de la surface 0. Shipyard en tire les autres surfaces et l'échelle de gris. |
| `foreground` | non | La couleur du texte principal. |
| `radius` | non | L'arrondi d'un contrôle, de 0 à 16 px. Les petits éléments ont la moitié, les cartes 1,5 fois, les dialogues 2 fois. |
| `font` | non | `system`, `grotesk`, `humanist`, `serif` ou `mono`. Les polices sont sur votre ordinateur : rien n'est téléchargé. La police de l'interface de Réglages / Moi l'emporte. |
| `tokens` | non | Le niveau avancé : un nom de jeton vers une couleur. Un jeton l'emporte sur un champ simple. |

Le niveau simple est `base`, `accent`, `background`, `foreground`, `radius` et `font`. La plupart des thèmes n'ont besoin que de ceux-là.

### Couleurs

Une couleur est l'une de celles-ci :

- Une couleur hexadécimale : `#rgb`, `#rgba`, `#rrggbb` ou `#rrggbbaa`.
- Une fonction de couleur avec des nombres : `rgb()`, `hsl()`, `oklch()`, `oklab()`, `lab()`, `lch()` ou `color()`, par exemple `oklch(0.72 0.17 150)` ou `rgb(159 179 200 / 90%)`.

Un thème est une donnée. Shipyard refuse `url()`, `var()`, une fonction dans une fonction, un nom de couleur, un champ inconnu et un jeton inconnu.

### Jetons

| Jeton | Usage |
|---|---|
| `surface-0` | Le fond de la fenêtre. |
| `surface-1` | Les panneaux et la barre latérale. |
| `surface-2` | Les cartes et les lignes. |
| `surface-3` | Les menus, les bulles et les dialogues. |
| `n-1` à `n-5` | Les fonds des contrôles, du discret au fort, et le survol. |
| `n-6` à `n-8` | Les bordures et les séparateurs, du discret au fort. |
| `n-9` | Les icônes discrètes et le texte indicatif. |
| `n-10` | Le texte tertiaire. |
| `n-11` | Le texte secondaire. |
| `n-12` | Le texte principal. |
| `accent` | Les boutons, l'anneau de focus et les états en direct. |
| `accent-hover` | Un bouton sous le pointeur. |
| `accent-fg` | Le texte sur un fond `accent`. |
| `accent-subtle` | Un fond d'accent discret, comme l'onglet actif. |
| `accent-text` | Le texte d'accent et les liens. |
| `success`, `warning`, `danger`, `info` | Les points, icônes et fonds d'état. |
| `success-subtle`, `warning-subtle`, `danger-subtle`, `info-subtle` | Les fonds d'état. |
| `success-text`, `warning-text`, `danger-text`, `info-text` | Le texte d'état. |

La liste est `src/lib/themes/tokens.json`.

### Contraste

Shipyard ne vérifie pas le contraste d'un thème importé. Donnez à `n-10`, `n-11`, `n-12` et à chaque jeton `-text` un contraste de 4,5:1 ou plus sur `surface-0` à `surface-3`. Un thème importé l'emporte sur la Couleur d'accent de Réglages / Moi. Quand Contraste élevé est activé, un thème importé ne donne que son arrondi. Un thème de plugin ne remplace jamais un autre thème qui a le même id.

## Thèmes dans un plugin

Un plugin peut fournir des thèmes. Listez les ids dans `manifest.json` et placez chaque fichier dans `files/themes/<id>.json` :

```json
{
	"name": "acme-sample",
	"version": "1.0.0",
	"themes": ["acme-dusk"]
}
```

L'id du fichier de thème doit être le même que l'id du manifeste. Shipyard vérifie chaque thème à la lecture du plugin, comme pour un import. Un mauvais thème arrête le plugin avec le fichier et le champ de l'erreur. La revue liste chaque thème comme un élément. Un thème accepté va dans la bibliothèque de thèmes de cet ordinateur. Il n'écrit aucun fichier du projet. `examples/plugin-sample` a un thème.

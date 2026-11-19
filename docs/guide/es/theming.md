# Temas

Shipyard tiene cinco temas integrados y una biblioteca de temas que importas. Elige el tema en Configuración / Yo o en el menú de la cuenta.

## Temas integrados

- Claro y Oscuro.
- OLED: una base negra pura para una pantalla OLED. Las superficies elevadas son un poco más claras. El texto cumple WCAG AA (4,5:1) en cada superficie. El acento es el mismo que en Oscuro.
- Sistema: Claro u Oscuro, según el sistema.
- Sistema, OLED en oscuro: Claro u OLED, según el sistema.

El atajo del tema (Mod+Shift+L) va de Claro a Oscuro, OLED, Sistema, y de nuevo Claro.

## Importar un tema

1. En Configuración / Yo, en la fila Archivos de tema, haz clic en Importar y elige un archivo `.json`.
2. Shipyard comprueba el archivo. Cuando el archivo tiene fallos, una lista muestra cada fallo con su campo. No se guarda nada.
3. Cuando el archivo es válido, una vista previa muestra las superficies, el texto y el acento. Haz clic en Añadir para guardar el tema y usarlo. Haz clic en Cerrar para conservar el tema actual.

El tema va a la biblioteca de este ordenador, no al proyecto. Se muestra en el selector de tema con su nombre. Una fila con su nombre tiene un botón para quitarlo. Cuando quitas el tema actual, se aplica su tema base.

Cuando el proyecto fija un tema en Configuración / Este proyecto, gana el tema del proyecto.

## Exportar un tema

Haz clic en Exportar en la fila Archivos de tema. Shipyard escribe el tema actual en un archivo `.json`:

- Un tema importado: el mismo archivo.
- Un tema integrado: un archivo con la base y el valor de cada token de color, tal como lo muestra la pantalla. Úsalo como inicio de tu propio tema.

## El archivo de tema

Un archivo de tema es JSON. El formato está en adr:0018.

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

El archivo `examples/theme-sample/harbor-night.json` contiene este ejemplo.

### Campos

| Campo | Obligatorio | Valor |
|---|---|---|
| `shipyardTheme` | sí | La versión del formato: `1`. |
| `id` | sí | De 1 a 40 letras minúsculas, cifras y `-`. Un tema con el mismo id sustituye al anterior. |
| `name` | sí | De 1 a 60 caracteres. El selector de tema lo muestra. |
| `base` | sí | `light`, `dark` u `oled`. Cada token que el archivo no fija conserva el valor de la base. |
| `accent` | no | Un color para botones, enlaces, el anillo de foco y los estados activos. |
| `background` | no | El color de la superficie 0. Shipyard crea las otras superficies y la escala de grises a partir de él. |
| `foreground` | no | El color del texto principal. |
| `radius` | no | El radio de esquina de un control, de 0 a 16 px. Los elementos pequeños reciben la mitad, las tarjetas 1,5 veces, los diálogos 2 veces. |
| `font` | no | `system`, `grotesk`, `humanist`, `serif` o `mono`. Las fuentes están en tu ordenador: no se descarga nada. La fuente de la interfaz de Configuración / Yo gana. |
| `tokens` | no | El nivel avanzado: un nombre de token para un color. Un token gana a un campo simple. |

El nivel simple es `base`, `accent`, `background`, `foreground`, `radius` y `font`. La mayoría de los temas solo necesita estos.

### Colores

Un color es uno de estos:

- Un color hex: `#rgb`, `#rgba`, `#rrggbb` o `#rrggbbaa`.
- Una función de color con números: `rgb()`, `hsl()`, `oklch()`, `oklab()`, `lab()`, `lch()` o `color()`, por ejemplo `oklch(0.72 0.17 150)` o `rgb(159 179 200 / 90%)`.

Un tema es un dato. Shipyard rechaza `url()`, `var()`, una función dentro de una función, un nombre de color, un campo desconocido y un token desconocido.

### Tokens

| Token | Uso |
|---|---|
| `surface-0` | La base de la ventana. |
| `surface-1` | Los paneles y la barra lateral. |
| `surface-2` | Las tarjetas y las filas. |
| `surface-3` | Los menús, los popovers y los diálogos. |
| `n-1` a `n-5` | Fondos de controles, de discreto a fuerte, y hover. |
| `n-6` a `n-8` | Bordes y separadores, de discreto a fuerte. |
| `n-9` | Iconos discretos y texto de marcador. |
| `n-10` | Texto terciario. |
| `n-11` | Texto secundario. |
| `n-12` | Texto principal. |
| `accent` | Botones, el anillo de foco y los estados activos. |
| `accent-hover` | Un botón bajo el puntero. |
| `accent-fg` | Texto sobre un relleno `accent`. |
| `accent-subtle` | Un fondo de acento discreto, como la pestaña activa. |
| `accent-text` | Texto de acento y enlaces. |
| `success`, `warning`, `danger`, `info` | Puntos de estado, iconos y rellenos. |
| `success-subtle`, `warning-subtle`, `danger-subtle`, `info-subtle` | Fondos de estado. |
| `success-text`, `warning-text`, `danger-text`, `info-text` | Texto de estado. |

La lista es `src/lib/themes/tokens.json`.

### Contraste

Shipyard no comprueba el contraste de un tema importado. Da a `n-10`, `n-11`, `n-12` y a cada token `-text` un contraste de 4,5:1 o más sobre `surface-0` a `surface-3`. Un tema importado gana al color de acento de Configuración / Yo. Cuando Alto contraste está activado, un tema importado solo da su radio. Un tema de plugin nunca sustituye a un tema distinto con el mismo id.

## Temas en un plugin

Un plugin puede dar temas. Lista los ids en `manifest.json` y pon cada archivo en `files/themes/<id>.json`:

```json
{
	"name": "acme-sample",
	"version": "1.0.0",
	"themes": ["acme-dusk"]
}
```

El id del archivo de tema debe ser el mismo que el id del manifiesto. Shipyard comprueba cada tema cuando lee el plugin, como en una importación. Un tema incorrecto detiene el plugin con el archivo y el campo del fallo. La revisión lista cada tema como un elemento. Un tema aceptado va a la biblioteca de temas de este ordenador. No escribe ningún archivo del proyecto. `examples/plugin-sample` tiene un tema.

# Designs

Shipyard hat fünf eingebaute Designs und eine Bibliothek von Designs, die Sie importieren. Wählen Sie das Design in Einrichtung / Ich oder im Kontomenü.

## Eingebaute Designs

- Hell und Dunkel.
- OLED: eine echte schwarze Basis für einen OLED-Bildschirm. Die erhöhten Flächen sind einen kleinen Schritt heller. Text erfüllt WCAG AA (4,5:1) auf jeder Fläche. Der Akzent ist derselbe wie in Dunkel.
- System: Hell oder Dunkel, wie das System.
- System, OLED bei Dunkel: Hell oder OLED, wie das System.

Das Tastenkürzel für das Design (Mod+Shift+L) geht von Hell zu Dunkel, OLED, System, dann wieder Hell.

## Ein Design importieren

1. Klicken Sie in Einrichtung / Ich, in der Zeile Design-Dateien, auf Importieren und wählen Sie eine `.json`-Datei.
2. Shipyard prüft die Datei. Wenn die Datei Fehler hat, zeigt eine Liste jeden Fehler mit seinem Feld. Nichts wird gespeichert.
3. Wenn die Datei gültig ist, zeigt eine Vorschau die Flächen, den Text und den Akzent. Klicken Sie auf Hinzufügen, um das Design zu speichern und zu nutzen. Klicken Sie auf Schließen, um das aktuelle Design zu behalten.

Das Design geht in die Bibliothek dieses Computers, nicht in das Projekt. Es zeigt sich in der Design-Auswahl mit seinem Namen. Eine Zeile mit seinem Namen hat eine Schaltfläche zum Entfernen. Wenn Sie das aktuelle Design entfernen, gilt sein Basis-Design.

Wenn das Projekt in Einrichtung / Dieses Projekt ein Design festlegt, hat das Design des Projekts Vorrang.

## Ein Design exportieren

Klicken Sie in der Zeile Design-Dateien auf Exportieren. Shipyard schreibt das aktuelle Design in eine `.json`-Datei:

- Ein importiertes Design: dieselbe Datei.
- Ein eingebautes Design: eine Datei mit der Basis und dem Wert jedes Farb-Tokens, wie der Bildschirm ihn zeigt. Nutzen Sie sie als Anfang für Ihr eigenes Design.

## Die Design-Datei

Eine Design-Datei ist JSON. Das Format steht in ADR 0018.

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

Die Datei `examples/theme-sample/harbor-night.json` enthält dieses Beispiel.

### Felder

| Feld | Pflicht | Wert |
|---|---|---|
| `shipyardTheme` | ja | Die Formatversion: `1`. |
| `id` | ja | 1 bis 40 Kleinbuchstaben, Ziffern und `-`. Ein Design mit derselben id ersetzt das alte. |
| `name` | ja | 1 bis 60 Zeichen. Die Design-Auswahl zeigt ihn. |
| `base` | ja | `light`, `dark` oder `oled`. Jedes Token, das die Datei nicht setzt, behält den Wert der Basis. |
| `accent` | nein | Eine Farbe für Schaltflächen, Links, den Fokusrahmen und aktive Zustände. |
| `background` | nein | Die Farbe der Fläche 0. Shipyard bildet daraus die anderen Flächen und die Grauskala. |
| `foreground` | nein | Die Haupttextfarbe. |
| `radius` | nein | Der Eckenradius eines Bedienelements, 0 bis 16 px. Kleine Elemente erhalten die Hälfte, Karten das 1,5-Fache, Dialoge das 2-Fache. |
| `font` | nein | `system`, `grotesk`, `humanist`, `serif` oder `mono`. Die Schriften sind auf Ihrem Computer: Nichts wird heruntergeladen. Die Oberflächenschrift von Einrichtung / Ich hat Vorrang. |
| `tokens` | nein | Die erweiterte Ebene: ein Token-Name zu einer Farbe. Ein Token hat Vorrang vor einem einfachen Feld. |

Die einfache Ebene ist `base`, `accent`, `background`, `foreground`, `radius` und `font`. Die meisten Designs brauchen nur diese.

### Farben

Eine Farbe ist eines davon:

- Eine Hex-Farbe: `#rgb`, `#rgba`, `#rrggbb` oder `#rrggbbaa`.
- Eine Farbfunktion mit Zahlen: `rgb()`, `hsl()`, `oklch()`, `oklab()`, `lab()`, `lch()` oder `color()`, zum Beispiel `oklch(0.72 0.17 150)` oder `rgb(159 179 200 / 90%)`.

Ein Design ist Daten. Shipyard lehnt `url()`, `var()`, eine Funktion in einer Funktion, einen Farbnamen, ein unbekanntes Feld und ein unbekanntes Token ab.

### Tokens

| Token | Verwendung |
|---|---|
| `surface-0` | Die Basis des Fensters. |
| `surface-1` | Felder und die Seitenleiste. |
| `surface-2` | Karten und Zeilen. |
| `surface-3` | Menüs, Popover und Dialoge. |
| `n-1` bis `n-5` | Hintergründe von Bedienelementen, von leise bis stark, und Hover. |
| `n-6` bis `n-8` | Rahmen und Trenner, von leise bis stark. |
| `n-9` | Leise Symbole und Platzhaltertext. |
| `n-10` | Tertiärer Text. |
| `n-11` | Sekundärer Text. |
| `n-12` | Haupttext. |
| `accent` | Schaltflächen, der Fokusrahmen und aktive Zustände. |
| `accent-hover` | Eine Schaltfläche unter dem Zeiger. |
| `accent-fg` | Text auf einer `accent`-Füllung. |
| `accent-subtle` | Ein leiser Akzent-Hintergrund, etwa der aktive Tab. |
| `accent-text` | Akzenttext und Links. |
| `success`, `warning`, `danger`, `info` | Statuspunkte, Symbole und Füllungen. |
| `success-subtle`, `warning-subtle`, `danger-subtle`, `info-subtle` | Status-Hintergründe. |
| `success-text`, `warning-text`, `danger-text`, `info-text` | Statustext. |

Die Liste ist `src/lib/themes/tokens.json`.

### Kontrast

Shipyard prüft den Kontrast eines importierten Designs nicht. Geben Sie `n-10`, `n-11`, `n-12` und jedem `-text`-Token einen Kontrast von 4,5:1 oder mehr auf `surface-0` bis `surface-3`. Ein importiertes Design hat Vorrang vor der Akzentfarbe von Einrichtung / Ich. Wenn Hoher Kontrast an ist, gibt ein importiertes Design nur seinen Radius. Ein Plugin-Design ersetzt nie ein anderes Design mit derselben id.

## Designs in einem Plugin

Ein Plugin kann Designs liefern. Listen Sie die ids in `manifest.json` und legen Sie jede Datei unter `files/themes/<id>.json` ab:

```json
{
	"name": "acme-sample",
	"version": "1.0.0",
	"themes": ["acme-dusk"]
}
```

Die id in der Design-Datei muss dieselbe sein wie die id im Manifest. Shipyard prüft jedes Design, wenn es das Plugin liest, wie bei einem Import. Ein fehlerhaftes Design stoppt das Plugin mit der Datei und dem Feld des Fehlers. Die Prüfung listet jedes Design als Element. Ein angenommenes Design geht in die Design-Bibliothek dieses Computers. Es schreibt keine Projektdatei. `examples/plugin-sample` hat ein Design.

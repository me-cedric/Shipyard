import type { panelsEn } from "../panels";

export const panelsDe: typeof panelsEn = {
	sessions: {
		title: "Aktive Sitzungen",
		none: "Keine aktive Sitzung",
		all: "Alle Sitzungen",
		tokens: "{count} Tokens",
	},
	files: {
		title: "Dateien",
		toggle: "Dateien",
		search: "Dateien suchen",
		close: "Dateien schließen",
		refresh: "Dateien aktualisieren",
		open: "Öffnen",
		reveal: "In Änderungen anzeigen",
		copy: "Pfad kopieren",
		none: "Keine Datei",
		more: "{count} weitere",
	},
	terminal: {
		title: "Terminals",
		toggle: "Terminal",
		add: "Neues Terminal",
		close: "{name} schließen",
		hide: "Terminal ausblenden",
		tab: "Terminal {n}",
		dock: "Terminal andocken",
		docks: { bottom: "Unten", left: "Links", right: "Rechts" },
		resize: "Größe des Terminals",
	},
};

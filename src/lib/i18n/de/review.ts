import type { reviewEn } from "../review";

export const reviewDe: typeof reviewEn = {
	chain: {
		stale: "Veraltet",
		acknowledge: "Bestätigen",
		acknowledgeName: "{name} bestätigen",
		because: "Grund: {reason}",
		withdraw: "Zurückziehen",
		withdrawName: "{name} zurückziehen",
		reason: "Grund",
	},
	quality: {
		verifyDocs: "Alle Dokus prüfen",
		docs: "Dokus",
		staleDocs: "{count} veraltete Dokus",
		coverage: "Abdeckung",
	},
	plans: {
		requirements: "Anforderungen",
		generate: "Szenarien erzeugen",
		generateName: "Szenarien für {name} erzeugen",
		scenarios: "{count} Szenarien",
		noScenario: "Kein Szenario",
	},
	apply: {
		write: "{name} schreiben",
		title: "Titel von {name}",
		days: "Tage von {name}",
	},
	question: {
		body: "Text",
		delete: "Löschen",
		noOwner: "Keine zuständige Person",
	},
	documents: {
		search: "Im Text suchen",
		results: "Ergebnisse",
		noResults: "Kein Ergebnis",
		rename: "Umbenennen",
		delete: "Löschen",
		line: "Zeile {line}",
	},
};

import type { shellFnEn } from "../shell-fn";

export const shellFnDe: typeof shellFnEn = {
	signOut: {
		label: "Abmelden",
		confirm: "Die Anmeldung von {names} entfernen?",
		none: "Kein Code-Host und kein Issue-Tracker ist angemeldet",
		done: "Abgemeldet von {names}",
	},
	sessions: {
		take: "Übernehmen",
		takeOf: "{name} übernehmen",
		confirmTake: "{name} stoppen und im Terminal öffnen?",
		taken: "Im Terminal geöffnet",
		noResume: "{name} hat keine Sitzung zum Wiederöffnen",
	},
	load: {
		processor: "Prozessor, {percent} %",
		memory: "Speicher, {value}",
		processorBar: "Prozessorauslastung",
		memoryBar: "Speicherauslastung",
		toolCalls: "Werkzeugaufrufe",
	},
	rights: {
		codeMerge: "Code und Merge",
		placesTitle: "Bereiche von {role}",
		places: "Bereiche",
		hide: "{place} für {role}",
		shown: "Sichtbar",
		hidden: "Ausgeblendet",
	},
	time: {
		fill: "Aus meiner Arbeit füllen",
		filled: "{count} Zeilen hinzugefügt",
		nothing: "Nichts hinzuzufügen",
	},
	roles: {
		tier: "Modell von {name}",
		top: "Bestes",
		mid: "Standard",
		small: "Schnell",
	},
	notify: {
		budget: "Ein Budget erreicht {percent} %",
		sound: "Ton",
		channel: "Release-Kanal",
		stable: "Stabil",
		preview: "Vorschau",
		budgetTitle: "Ein Budget hat {percent} % erreicht",
		budgetBody: "{name}: {spent} von {budget}",
		allTools: "Alle KI-Werkzeuge",
	},
	data: {
		change: "Ändern",
		changeTo: "Datenordner ändern",
		confirmMove: "Die Daten nach {path} verschieben und Shipyard neu starten?",
		portable: "Portabler Modus",
	},
	feedback: {
		attach: "Datei anhängen",
		attached: "Im Dateimanager angezeigt",
	},
	permissions: {
		moment: "Shipyard braucht {count} Berechtigungen",
		momentOne: "Shipyard braucht 1 Berechtigung",
		later: "Später",
	},
	close: {
		title: "Agenten arbeiten noch: {count}",
		titleOne: "1 Agent arbeitet noch",
		stop: "Stoppen und schließen",
		keep: "Weiterarbeiten lassen",
		cancel: "Abbrechen",
	},
};

import type { onboardingEn } from "../onboarding";

export const onboardingDe: typeof onboardingEn = {
	replay: "Tour wiederholen",
	tour: "Tour",
	step: "Schritt {n} von {total}",
	next: "Weiter",
	back: "Zurück",
	done: "Fertig",
	manual: "Anleitung öffnen",
	steps: {
		loop: {
			title: "Ein Kreislauf, von der Idee bis zum zusammengeführten Code",
			body: "Entwurf, Spezifikationen, Arbeit, Agenten, Code und Wissen bleiben zusammen, in den Dateien Ihres Projekts.",
		},
		project: {
			title: "Projekt öffnen",
			body: "Öffnen Sie einen Ordner, klonen Sie ein Repository oder starten Sie ein neues Projekt. Das Team teilt es mit Git.",
		},
		connect: {
			title: "Ticketsystem und Code-Plattform verbinden",
			body: "Die Tickets kommen aus dem Ticketsystem. Die Pull Requests gehen an die Code-Plattform.",
		},
		ai: {
			title: "KI-Tool wählen",
			body: "Claude Code oder Codex erledigt die Arbeit, im Rahmen des Budgets und der Limits, die Sie festlegen.",
		},
		permissions: {
			title: "Erlauben, was Shipyard braucht",
			body: "Schalten Sie sie jetzt ein, damit später keine Systemabfrage einen Lauf stoppt.",
		},
		run: {
			title: "Ihr erstes Ticket ausführen",
			body: "Ein Agent plant, baut und prüft das Ticket und öffnet dann einen Pull Request für Ihr Review.",
		},
	},
	setup: {
		title: "Einrichtung",
		done: "Erledigt",
		todo: "Offen",
		item: {
			project: "Projekt",
			ai: "KI-Tool",
			models: "Modelle",
			tracker: "Ticketsystem",
			forge: "Code-Plattform",
			permissions: "Berechtigungen",
			team: "Team",
		},
		action: {
			project: "Neues Projekt",
			signIn: "Anmelden",
			models: "Modelle wählen",
			connect: "Verbinden",
			permissions: "Öffnen",
			team: "Mich als Admin hinzufügen",
		},
	},
	picture: {
		folder: "Ordner öffnen",
		clone: "Klonen",
		create: "Neues Projekt",
		tracker: "Ticketsystem",
		host: "Code-Plattform",
		budget: "Budget",
		ticket: "Export-Button hinzufügen",
	},
	permissions: {
		title: "Berechtigungen",
		kind: { notifications: "Benachrichtigungen", files: "Dokumente, Schreibtisch und Downloads" },
		state: {
			on: "An",
			off: "Aus",
			notAsked: "Nicht gefragt",
			notNeeded: "Nicht nötig",
			unknown: "Unbekannt",
		},
		allow: "Erlauben",
		settings: "Systemeinstellungen öffnen",
		test: "Test senden",
		testBody: "Die Benachrichtigungen sind an.",
	},
};

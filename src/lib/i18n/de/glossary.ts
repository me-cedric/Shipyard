import type { glossaryEn } from "../glossary";

export const glossaryDe: typeof glossaryEn = {
	manual: "Handbuch",
	terms: {
		"issue-tracker":
			"Das Werkzeug, in dem Ihr Team seine Tickets führt, zum Beispiel Linear oder Jira.",
		"code-host": "Die Website, die Ihren Code online speichert, zum Beispiel GitHub oder GitLab.",
		"ai-tool":
			"Ein Programm auf diesem Computer, das auf Wunsch Code schreibt, zum Beispiel Claude Code.",
		model:
			"Das KI-Gehirn, das ein KI-Tool nutzt. Ein größeres Modell denkt besser und kostet mehr.",
		spec: "Ein kurzer Text, der sagt, was zu bauen ist und wie man prüft, dass es funktioniert.",
		decision: "Eine Notiz, die eine Wahl und ihren Grund festhält.",
		run: "Ein Versuch eines KI-Tools, ein Ticket zu erledigen, vom ersten Schritt bis zum Pull Request.",
		"pull-request":
			"Eine Bitte, Ihre Änderungen in den Hauptcode zu übernehmen, damit andere sie prüfen können.",
	},
	words: {
		"issue-tracker": "Ticketsystem",
		"code-host": "Code-Plattform",
		"ai-tool": "KI-Tool",
		model: "Modell",
		spec: "Spezifikation",
		decision: "Entscheidung",
		run: "Lauf",
		"pull-request": "Pull Request",
	},
	noRunner: "Kein KI-Tool gefunden",
	setUpRunner: "KI-Tool einrichten",
	noTracker: "Kein Ticketsystem verbunden",
	connectTracker: "Ticketsystem verbinden",
};

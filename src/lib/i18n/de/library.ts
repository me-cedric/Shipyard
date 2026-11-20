import type { libraryEn } from "../library";
import { libraryFnDe } from "./library-fn";

export const libraryDe: typeof libraryEn = {
	title: "Bibliothek",
	back: "Bibliothek",
	views: { home: "Bibliothek", reports: "Berichte" },
	doors: {
		what: "Was es tun muss",
		how: "Wie es gebaut ist",
		why: "Warum es so ist",
		learn: "Lernen und teilen",
	},
	questionsOne: "1 offene Frage",
	questionsMany: "{count} offene Fragen",
	decisionsOne: "1 Entscheidung wartet",
	decisionsMany: "{count} Entscheidungen warten",
	tested: "Was getestet ist",
	answers: "Antworten",
	glossary: "Glossar",
	learnProgress: "{label}, {done} von {total}",
	pinned: "Angeheftet",
	openedLast: "Zuletzt geöffnet",
	pin: "Anheften",
	unpin: "Lösen",
	pinPage: "{name} anheften",
	unpinPage: "{name} lösen",
	fn: libraryFnDe,
};

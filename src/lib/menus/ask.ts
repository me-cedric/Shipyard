import { useCallback } from "react";
import { type Lang, useI18n } from "@/lib/i18n";
import { type BacklinkGroup, commands, unwrap } from "@/lib/ipc";
import { type Role, usePrefs } from "@/lib/prefs";
import { useShell } from "@/lib/shell";
import type { MenuItem } from "@/ui/molecules/context-menu";

export type AskKey = "summary" | "explain" | "impact" | "tests" | "risks";

/** The prompts of each kind of ref, in order. A kind with no row gets `OTHER`. */
const KEYS: Record<string, AskKey[]> = {
	adr: ["summary", "explain", "impact", "risks"],
	spec: ["summary", "impact", "tests", "risks"],
	change: ["summary", "impact", "tests", "risks"],
	doc: ["summary", "explain", "risks"],
};
const OTHER: AskKey[] = ["explain", "impact", "risks"];

/** The prompt that a role needs first, when the kind has it. */
const FIRST: Partial<Record<Role, AskKey>> = {
	pm: "summary",
	ba: "summary",
	qa: "tests",
	developer: "impact",
	architect: "impact",
	po: "risks",
	techlead: "risks",
};

export function askKeys(ref: string, role: Role): AskKey[] {
	const keys = KEYS[ref.split(":")[0] ?? ""] ?? OTHER;
	const first = FIRST[role];
	return first && keys.includes(first) ? [first, ...keys.filter((k) => k !== first)] : keys;
}

const NOUN = {
	en: {
		adr: "this decision",
		spec: "this spec",
		req: "this requirement",
		change: "this change",
		q: "this question",
		doc: "this page",
		diagram: "this diagram",
		model: "this model",
		data: "this data",
		flow: "this flow",
		item: "this item",
	},
	fr: {
		adr: "cette décision",
		spec: "cette spécification",
		req: "cette exigence",
		change: "ce changement",
		q: "cette question",
		doc: "cette page",
		diagram: "ce diagramme",
		model: "ce modèle",
		data: "ces données",
		flow: "ce flux",
		item: "cet élément",
	},
	de: {
		adr: "diese Entscheidung",
		spec: "diese Spezifikation",
		req: "diese Anforderung",
		change: "diese Änderung",
		q: "diese Frage",
		doc: "diese Seite",
		diagram: "dieses Diagramm",
		model: "dieses Modell",
		data: "diese Daten",
		flow: "diesen Fluss",
		item: "dieses Element",
	},
	es: {
		adr: "esta decisión",
		spec: "esta especificación",
		req: "este requisito",
		change: "este cambio",
		q: "esta pregunta",
		doc: "esta página",
		diagram: "este diagrama",
		model: "este modelo",
		data: "estos datos",
		flow: "este flujo",
		item: "este elemento",
	},
} as const;

const noun = (lang: Lang, ref: string) => {
	const kind = ref.includes("#REQ-") ? "req" : (ref.split(":")[0] ?? "");
	return NOUN[lang][kind as keyof (typeof NOUN)["en"]] ?? NOUN[lang].item;
};

type Text = Record<AskKey, (what: string) => string>;
const LABEL: Record<Lang, Text> = {
	en: {
		summary: (w) => `Summarise ${w}`,
		explain: (w) => `Explain ${w}`,
		impact: () => "What does this change impact?",
		tests: (w) => `Write the test plan for ${w}`,
		risks: (w) => `List the risks of ${w}`,
	},
	fr: {
		summary: (w) => `Résumer ${w}`,
		explain: (w) => `Expliquer ${w}`,
		impact: () => "Quel est l'impact de ce changement ?",
		tests: (w) => `Écrire le plan de test de ${w}`,
		risks: (w) => `Lister les risques de ${w}`,
	},
	de: {
		summary: (w) => `${w} zusammenfassen`,
		explain: (w) => `${w} erklären`,
		impact: () => "Was betrifft diese Änderung?",
		tests: (w) => `Testplan für ${w} schreiben`,
		risks: (w) => `Risiken von ${w} auflisten`,
	},
	es: {
		summary: (w) => `Resumir ${w}`,
		explain: (w) => `Explicar ${w}`,
		impact: () => "¿Qué impacto tiene este cambio?",
		tests: (w) => `Escribir el plan de pruebas de ${w}`,
		risks: (w) => `Enumerar los riesgos de ${w}`,
	},
};
const PROMPT: Record<Lang, Text> = {
	en: {
		summary: (w) => `Summarise ${w} in plain words, for someone who was not in the discussion.`,
		explain: (w) =>
			`Explain ${w}: what it is, why it exists and how it connects to the rest of the project.`,
		impact: (w) =>
			`What does a change to ${w} impact? List the items that depend on it and say what each one needs.`,
		tests: (w) =>
			`Write the test plan for ${w}: the cases that matter and the edge cases, as Given/When/Then scenarios.`,
		risks: (w) => `List the risks of ${w} and how to reduce each one.`,
	},
	fr: {
		summary: (w) =>
			`Résume ${w} avec des mots simples, pour quelqu'un qui n'était pas dans la discussion.`,
		explain: (w) =>
			`Explique ${w} : ce que c'est, pourquoi cela existe et comment cela se relie au reste du projet.`,
		impact: (w) =>
			`Qu'est-ce qu'un changement de ${w} impacte ? Liste les éléments qui en dépendent et dis ce dont chacun a besoin.`,
		tests: (w) =>
			`Écris le plan de test de ${w} : les cas qui comptent et les cas limites, en scénarios Given/When/Then.`,
		risks: (w) => `Liste les risques de ${w} et comment réduire chacun.`,
	},
	de: {
		summary: (w) =>
			`Fasse ${w} in einfachen Worten zusammen, für jemanden, der nicht an der Diskussion teilgenommen hat.`,
		explain: (w) =>
			`Erkläre ${w}: was es ist, warum es existiert und wie es mit dem Rest des Projekts zusammenhängt.`,
		impact: (w) =>
			`Was betrifft eine Änderung an ${w}? Liste die Elemente auf, die davon abhängen, und sage, was jedes braucht.`,
		tests: (w) =>
			`Schreibe den Testplan für ${w}: die wichtigen Fälle und die Grenzfälle, als Given/When/Then-Szenarien.`,
		risks: (w) => `Liste die Risiken von ${w} auf und wie sich jedes verringern lässt.`,
	},
	es: {
		summary: (w) =>
			`Resume ${w} con palabras sencillas, para alguien que no estuvo en la conversación.`,
		explain: (w) =>
			`Explica ${w}: qué es, por qué existe y cómo se conecta con el resto del proyecto.`,
		impact: (w) =>
			`¿Qué impacto tiene un cambio en ${w}? Enumera los elementos que dependen de ello y di qué necesita cada uno.`,
		tests: (w) =>
			`Escribe el plan de pruebas de ${w}: los casos que importan y los casos límite, como escenarios Given/When/Then.`,
		risks: (w) => `Enumera los riesgos de ${w} y cómo reducir cada uno.`,
	},
};
const CONTEXT = {
	en: {
		head: "Context",
		ref: "Item",
		path: "File",
		spec: "Spec",
		ticket: "Ticket",
		links: "Linked from",
	},
	fr: {
		head: "Contexte",
		ref: "Élément",
		path: "Fichier",
		spec: "Spécification",
		ticket: "Ticket",
		links: "Cité par",
	},
	de: {
		head: "Kontext",
		ref: "Element",
		path: "Datei",
		spec: "Spezifikation",
		ticket: "Ticket",
		links: "Verwiesen von",
	},
	es: {
		head: "Contexto",
		ref: "Elemento",
		path: "Archivo",
		spec: "Especificación",
		ticket: "Ticket",
		links: "Citado por",
	},
};

/**
 * The prompt of one key for an item. It ends with the context of the item: its ref, its file, its
 * spec and ticket and the other items that cite it (the backlinks of the ref index).
 */
export function askPrompt(
	lang: Lang,
	key: AskKey,
	ref: string,
	path: string | null | undefined,
	groups: BacklinkGroup[],
): string {
	const c = CONTEXT[lang];
	const from = (kinds: string[]) =>
		groups.filter((g) => kinds.includes(g.kind)).flatMap((g) => g.items.map((i) => i.source));
	const line = (label: string, list: string[]) =>
		list.length ? [`${label}: ${list.join(", ")}`] : [];
	const context = [
		`${c.ref}: ${ref}`,
		...line(c.path, path ? [path] : []),
		...line(c.spec, from(["spec", "change"])),
		...line(c.ticket, from(["wi"])),
		...line(c.links, from(groups.map((g) => g.kind)).slice(0, 10)),
	];
	return `${PROMPT[lang][key](noun(lang, ref))}\n\n${c.head}:\n${context.join("\n")}`;
}

/**
 * `items(ref, path)` gives the last group of the item menu: the prompts that fit the kind of item
 * and the role of the person. A click fills the message box and opens the panel. It does not send.
 */
export function useAsk() {
	const { lang } = useI18n();
	const { ask } = useShell();
	const { role, promptLang } = usePrefs();
	return useCallback(
		(ref: string, path?: string | null): MenuItem[] => {
			const to = promptLang === "en" || promptLang === "fr" ? promptLang : lang;
			return askKeys(ref, role).map((key, i) => ({
				id: `ask-${key}`,
				label: LABEL[lang][key](noun(lang, ref)),
				separated: i === 0,
				onSelect: () =>
					void unwrap(commands.refsBacklinks(ref))
						.catch(() => [])
						.then((groups) => ask(askPrompt(to, key, ref, path, groups))),
			}));
		},
		[lang, ask, role, promptLang],
	);
}

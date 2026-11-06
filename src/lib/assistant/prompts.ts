import type { Lang } from "@/lib/i18n";

export type ItemType =
	| "decision"
	| "spec"
	| "workItem"
	| "run"
	| "pullRequest"
	| "file"
	| "diagram";
export type PromptKind = "explain" | "review" | "improve" | "tests" | "risks";

/** The canned prompts of each type of item, in menu order. */
export const PROMPT_KINDS: Record<ItemType, PromptKind[]> = {
	decision: ["explain", "review", "improve", "risks"],
	spec: ["explain", "review", "improve", "tests"],
	workItem: ["explain", "improve", "tests", "risks"],
	run: ["explain", "review", "improve"],
	pullRequest: ["explain", "review", "tests", "risks"],
	file: ["explain", "review", "improve", "tests"],
	diagram: ["explain", "review", "improve", "risks"],
};

const REF_TYPE: Record<string, ItemType> = {
	adr: "decision",
	spec: "spec",
	wi: "workItem",
	run: "run",
	pr: "pullRequest",
	doc: "file",
	diagram: "diagram",
};

/** The type of the item that a ref names, or null for a ref with no canned prompts. */
export const itemTypeOf = (ref: string): ItemType | null =>
	REF_TYPE[ref.split(":")[0] ?? ""] ?? null;

/** The type of item that a page lists (`space/tab`), or null. */
const PAGE_TYPE: Record<string, ItemType> = {
	"design/decisions": "decision",
	"design/diagrams": "diagram",
	"specs/changes": "spec",
	"specs/capabilities": "spec",
	"work/backlog": "workItem",
	"work/board": "workItem",
	"factory/runs": "run",
	"code/pull-requests": "pullRequest",
	"code/changes": "file",
	"knowledge/documents": "file",
};
export const pageItemType = (pathname: string): ItemType | null => {
	const [space, tab] = pathname.split("/").filter(Boolean);
	return PAGE_TYPE[`${space}/${tab}`] ?? null;
};

// The noun phrase of a type: one item ("this decision") and all of them ("the decisions of this project").
const NOUN = {
	en: {
		decision: ["this decision", "the decisions of this project"],
		spec: ["this spec", "the specs of this project"],
		workItem: ["this work item", "the work items of this project"],
		run: ["this run", "the runs of this project"],
		pullRequest: ["this pull request", "the pull requests of this project"],
		file: ["this file", "the files of this project"],
		diagram: ["this diagram", "the diagrams of this project"],
	},
	fr: {
		decision: ["cette décision", "les décisions de ce projet"],
		spec: ["cette spécification", "les spécifications de ce projet"],
		workItem: ["cet élément de travail", "les éléments de travail de ce projet"],
		run: ["cette exécution", "les exécutions de ce projet"],
		pullRequest: ["cette demande de fusion", "les demandes de fusion de ce projet"],
		file: ["ce fichier", "les fichiers de ce projet"],
		diagram: ["ce diagramme", "les diagrammes de ce projet"],
	},
	de: {
		decision: ["diese Entscheidung", "die Entscheidungen dieses Projekts"],
		spec: ["diese Spezifikation", "die Spezifikationen dieses Projekts"],
		workItem: ["dieses Arbeitselement", "die Arbeitselemente dieses Projekts"],
		run: ["diesen Lauf", "die Läufe dieses Projekts"],
		pullRequest: ["diesen Pull Request", "die Pull Requests dieses Projekts"],
		file: ["diese Datei", "die Dateien dieses Projekts"],
		diagram: ["dieses Diagramm", "die Diagramme dieses Projekts"],
	},
	es: {
		decision: ["esta decisión", "las decisiones de este proyecto"],
		spec: ["esta especificación", "las especificaciones de este proyecto"],
		workItem: ["este elemento de trabajo", "los elementos de trabajo de este proyecto"],
		run: ["esta ejecución", "las ejecuciones de este proyecto"],
		pullRequest: ["esta pull request", "las pull requests de este proyecto"],
		file: ["este archivo", "los archivos de este proyecto"],
		diagram: ["este diagrama", "los diagramas de este proyecto"],
	},
} as const;

const TEXT = {
	en: {
		explain:
			"Explain {what}: what it is, why it exists and how it connects to the rest of the project.",
		review: "Review {what}. List what is unclear, wrong or missing, the most serious first.",
		improve: "Suggest improvements for {what}. Show each change and say why.",
		tests: "Give test ideas for {what}: the cases that matter and the edge cases.",
		risks: "List the risks of {what} and how to reduce each one.",
	},
	fr: {
		explain:
			"Explique {what} : ce que c'est, pourquoi cela existe et comment cela se relie au reste du projet.",
		review: "Relis {what}. Liste ce qui est flou, faux ou manquant, le plus grave en premier.",
		improve: "Propose des améliorations pour {what}. Montre chaque changement et dis pourquoi.",
		tests: "Donne des idées de tests pour {what} : les cas qui comptent et les cas limites.",
		risks: "Liste les risques de {what} et comment réduire chacun.",
	},
	de: {
		explain:
			"Erkläre {what}: was es ist, warum es existiert und wie es mit dem Rest des Projekts zusammenhängt.",
		review: "Prüfe {what}. Liste auf, was unklar, falsch oder fehlend ist, das Wichtigste zuerst.",
		improve: "Schlage Verbesserungen für {what} vor. Zeige jede Änderung und sage, warum.",
		tests: "Nenne Testideen für {what}: die wichtigen Fälle und die Grenzfälle.",
		risks: "Liste die Risiken von {what} auf und wie sich jedes verringern lässt.",
	},
	es: {
		explain: "Explica {what}: qué es, por qué existe y cómo se conecta con el resto del proyecto.",
		review:
			"Revisa {what}. Enumera lo que no está claro, es incorrecto o falta, lo más grave primero.",
		improve: "Propón mejoras para {what}. Muestra cada cambio y explica por qué.",
		tests: "Da ideas de pruebas para {what}: los casos que importan y los casos límite.",
		risks: "Enumera los riesgos de {what} y cómo reducir cada uno.",
	},
} as const;

/** The prompt to send. `subject` is a ref, a path or a title. Without it the prompt covers every item of the type. */
export function cannedPrompt(
	lang: Lang,
	type: ItemType,
	kind: PromptKind,
	subject?: string | null,
): string {
	const [one, all] = NOUN[lang][type];
	const what = subject ? `${one} (${subject})` : all;
	return TEXT[lang][kind].replace("{what}", what);
}

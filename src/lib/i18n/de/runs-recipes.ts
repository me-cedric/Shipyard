import type { runsRecipesEn } from "../runs-recipes";

export const runsRecipesDe: typeof runsRecipesEn = {
	pause: "Pausieren",
	takeOver: "Übernehmen",
	addDocument: "Dokument hinzufügen",
	removeDocument: "{name} entfernen",
	documentKinds: "{name}: Fügen Sie eine Markdown-, PDF- oder Word-Datei hinzu.",
	limit: "Limit",
	limitAmount: "Limit des Features, in Dollar",
	stageAtOnce: "{name}, gleichzeitig",
	warnAtPercent: "Warnen bei, in Prozent",
	save: "Speichern",
	then: "Danach",
	thenFor: "Danach, {name}",
	choice: {
		stop_ask: "Anhalten und fragen",
		pause: "Pausieren",
		ask: "Mich fragen",
		go_on: "Weitermachen",
	},
	role: "Wer genehmigt",
	anyRole: "Alle",
	kind: { agent: "Agent", person: "Person", check: "Prüfung" },
	runsBeside: "Läuft neben anderen Schritten",
	childrenBeside: "Unterschritte laufen nebeneinander",
	alone: "Für dieses Rezept nicht mehr fragen",
};

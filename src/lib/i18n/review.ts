/** The strings of the chain acknowledgements, QA checks, test plans from requirements, ticket review, question edits and document actions. */
export const reviewEn = {
	chain: {
		stale: "Out of date",
		acknowledge: "Acknowledge",
		acknowledgeName: "Acknowledge {name}",
		because: "Reason: {reason}",
		withdraw: "Withdraw",
		withdrawName: "Withdraw {name}",
		reason: "Reason",
	},
	quality: {
		verifyDocs: "Verify all docs",
		coverage: "Coverage",
	},
	plans: {
		requirements: "Requirements",
		generate: "Generate scenarios",
		generateName: "Generate scenarios for {name}",
		scenarios: "{count} scenarios",
		noScenario: "No scenario",
	},
	apply: {
		write: "Write {name}",
		title: "Title of {name}",
		days: "Days of {name}",
	},
	question: {
		body: "Text",
		delete: "Delete",
		noOwner: "No owner",
	},
	documents: {
		search: "Search in the text",
		results: "Results",
		noResults: "No result",
		rename: "Rename",
		delete: "Delete",
		line: "Line {line}",
	},
};

export const reviewFr: typeof reviewEn = {
	chain: {
		stale: "Périmé",
		acknowledge: "Acquitter",
		acknowledgeName: "Acquitter {name}",
		because: "Motif : {reason}",
		withdraw: "Retirer",
		withdrawName: "Retirer {name}",
		reason: "Motif",
	},
	quality: {
		verifyDocs: "Vérifier toute la documentation",
		coverage: "Couverture",
	},
	plans: {
		requirements: "Exigences",
		generate: "Générer les scénarios",
		generateName: "Générer les scénarios de {name}",
		scenarios: "{count} scénarios",
		noScenario: "Aucun scénario",
	},
	apply: {
		write: "Écrire {name}",
		title: "Titre de {name}",
		days: "Jours de {name}",
	},
	question: {
		body: "Texte",
		delete: "Supprimer",
		noOwner: "Sans responsable",
	},
	documents: {
		search: "Chercher dans le texte",
		results: "Résultats",
		noResults: "Aucun résultat",
		rename: "Renommer",
		delete: "Supprimer",
		line: "Ligne {line}",
	},
};

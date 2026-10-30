/** The strings of the document forms, the design previews and the next step of the loop. */
export const editingEn = {
	view: { label: "View", form: "Form", text: "Text" },
	field: { title: "Title", status: "Status", people: "People" },
	adrStatus: { deprecated: "Deprecated", superseded: "Superseded" } as Record<string, string>,
	preview: "Preview",
	openFigma: "Open in Figma",
	next: {
		plan: "Write plan",
		split: "Split into work items",
		assign: "Assign to me",
		start: "Start run",
		answer: "Answer",
		review: "Review",
		merge: "Merge",
	},
};

export const editingFr: typeof editingEn = {
	view: { label: "Vue", form: "Formulaire", text: "Texte" },
	field: { title: "Titre", status: "Statut", people: "Personnes" },
	adrStatus: { deprecated: "Obsolète", superseded: "Remplacée" },
	preview: "Aperçu",
	openFigma: "Ouvrir dans Figma",
	next: {
		plan: "Écrire le plan",
		split: "Découper en tickets",
		assign: "Me l'attribuer",
		start: "Lancer une exécution",
		answer: "Répondre",
		review: "Relire",
		merge: "Fusionner",
	},
};

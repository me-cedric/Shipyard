/** The strings of the controls that `spec:library-functions` adds to Library. */
export const libraryFnEn = {
	documents: { addFile: "Add a file", open: "Open" },
	learn: { addWord: "Add a word", word: "Word", meaning: "Meaning", add: "Add", stepItem: "Item" },
	slides: { edit: "Edit", done: "Done", notes: "Speaker notes", noNote: "No note on this slide" },
	history: {
		title: "Earlier versions",
		open: "History",
		changedBy: "{name} changed this page",
		read: "Read {summary}",
		restore: "Restore {summary}",
		readLabel: "Read",
		restoreLabel: "Restore",
		restored: "Restored",
		text: "Text of the version",
		none: "No earlier version",
	},
};

export const libraryFnFr: typeof libraryFnEn = {
	documents: { addFile: "Ajouter un fichier", open: "Ouvrir" },
	learn: {
		addWord: "Ajouter un mot",
		word: "Mot",
		meaning: "Sens",
		add: "Ajouter",
		stepItem: "Élément",
	},
	slides: {
		edit: "Modifier",
		done: "Terminé",
		notes: "Notes de l'intervenant",
		noNote: "Aucune note sur cette diapositive",
	},
	history: {
		title: "Versions précédentes",
		open: "Historique",
		changedBy: "{name} a modifié cette page",
		read: "Lire {summary}",
		restore: "Restaurer {summary}",
		readLabel: "Lire",
		restoreLabel: "Restaurer",
		restored: "Restauré",
		text: "Texte de la version",
		none: "Aucune version précédente",
	},
};

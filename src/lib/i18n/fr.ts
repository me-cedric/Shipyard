import type { Messages } from "./en";

export const fr: Messages = {
	common: { close: "Fermer", search: "Rechercher", open: "Ouvrir", loading: "Chargement" },
	status: {
		success: "Succès",
		warning: "Alerte",
		danger: "Danger",
		info: "Info",
		active: "Actif",
		idle: "Inactif",
	},
	ref: { resolved: "Résolu", unresolved: "Non résolu", broken: "Rompu" },
	theme: { light: "Clair", dark: "Sombre", system: "Système" },
	prefs: {
		theme: "Thème",
		language: "Langue",
		density: "Densité",
		contrast: "Contraste élevé",
		compact: "Compact",
	},
	palette: { title: "Palette de commandes", placeholder: "Rechercher", empty: "Aucun résultat" },
	inspector: { title: "Inspecteur" },
	nav: {
		sidebar: "Barre latérale",
		main: "Principal",
		status: "Statut",
		expand: "Déployer",
		collapse: "Réduire",
	},
	filter: { search: "Rechercher" },
	empty: { create: "Nouveau" },
	gallery: {
		tokens: "Jetons",
		atoms: "Atomes",
		molecules: "Molécules",
		organisms: "Organismes",
		templates: "Gabarits",
		settings: "Réglages",
	},
	count: "{name} ({count})",
};

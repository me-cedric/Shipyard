export const en = {
	common: { close: "Close", search: "Search", open: "Open", loading: "Loading" },
	status: {
		success: "Success",
		warning: "Warning",
		danger: "Danger",
		info: "Info",
		active: "Active",
		idle: "Idle",
	},
	ref: { resolved: "Resolved", unresolved: "Unresolved", broken: "Broken" },
	theme: { light: "Light", dark: "Dark", system: "System" },
	prefs: {
		theme: "Theme",
		language: "Language",
		density: "Density",
		contrast: "High contrast",
		compact: "Compact",
	},
	palette: { title: "Command palette", placeholder: "Search", empty: "No result" },
	inspector: { title: "Inspector" },
	nav: {
		sidebar: "Sidebar",
		main: "Main",
		status: "Status",
		expand: "Expand",
		collapse: "Collapse",
	},
	filter: { search: "Search" },
	empty: { create: "New" },
	gallery: {
		tokens: "Tokens",
		atoms: "Atoms",
		molecules: "Molecules",
		organisms: "Organisms",
		templates: "Templates",
		settings: "Settings",
	},
	count: "{name} ({count})",
};

export type Messages = typeof en;

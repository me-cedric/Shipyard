import type { ActionKind, ErrorAction, ErrorCode, Lang } from "@/lib/ipc/bindings";

/**
 * The messages of the error contract. Each code that Rust returns (`crates/shipyard-app/src/errors.rs`)
 * has one plain sentence in each language. `unknown` has none: the view shows the details.
 * A new code fails the build here until it has both sentences.
 */
type Known = Exclude<ErrorCode, "unknown">;

export const errorMessages: Record<Lang, Record<Known, string>> = {
	en: {
		no_project: "Open or create a project first.",
		no_tracker: "This project has no tracker connection.",
		scope_missing: "Pick the tracker project to read from.",
		pickup_off: "Agents take no ticket: the pickup label is off.",
		ticket_not_in_mirror: "This ticket is not here yet. Sync, then try again.",
		needs_click: "Confirm this action to continue.",
		node_missing: "Node is missing. Agent tools need it.",
		no_package_manager: "No package manager found. Install the tool by hand.",
		no_secret: "This connection has no token yet.",
		token_refused: "The token was refused. Make a new token.",
		connection_name: "Give the connection a name of 1 to 60 characters.",
		connection_address: "Use an https address.",
		secret_invalid: "The token is empty or too long.",
		title_invalid: "Use a title with at least one letter or digit.",
		change_exists: "A change with this title exists. Use another title.",
		run_not_started: "The run did not start.",
	},
	fr: {
		no_project: "Ouvrez ou créez d'abord un projet.",
		no_tracker: "Ce projet n'a pas de connexion de suivi.",
		scope_missing: "Choisissez le projet du suivi à lire.",
		pickup_off: "Les agents ne prennent aucun ticket : l'étiquette de prise est désactivée.",
		ticket_not_in_mirror: "Ce ticket n'est pas encore ici. Synchronisez, puis réessayez.",
		needs_click: "Confirmez cette action pour continuer.",
		node_missing: "Node manque. Les outils d'agent en ont besoin.",
		no_package_manager: "Aucun gestionnaire de paquets trouvé. Installez l'outil à la main.",
		no_secret: "Cette connexion n'a pas encore de jeton.",
		token_refused: "Le jeton a été refusé. Créez un nouveau jeton.",
		connection_name: "Donnez à la connexion un nom de 1 à 60 caractères.",
		connection_address: "Utilisez une adresse https.",
		secret_invalid: "Le jeton est vide ou trop long.",
		title_invalid: "Utilisez un titre avec au moins une lettre ou un chiffre.",
		change_exists: "Un changement porte déjà ce titre. Utilisez un autre titre.",
		run_not_started: "L'exécution n'a pas démarré.",
	},
};

/** The label of the action button of each kind. */
export const actionLabels: Record<Lang, Record<ActionKind, string>> = {
	en: {
		setting: "Open settings",
		sync: "Sync",
		install: "Install",
		create_project: "Create a project",
	},
	fr: {
		setting: "Ouvrir les réglages",
		sync: "Synchroniser",
		install: "Installer",
		create_project: "Créer un projet",
	},
};

/**
 * The raw texts that the mock makes as a `string`, and that Rust turns into a code. A copy of
 * `KNOWN` in `errors.rs`: `errors.test.ts` fails when the two differ.
 */
export const RAW: readonly (readonly [string, ErrorCode])[] = [
	["no project is open", "no_project"],
	["no active project", "no_project"],
	["has no tracker connection", "no_tracker"],
	["the tracker scope is not set", "scope_missing"],
	["the pickup label is off", "pickup_off"],
	["not in the mirror", "ticket_not_in_mirror"],
	["needs the click of a person", "needs_click"],
	["npm is not installed", "node_missing"],
	["no package manager found", "no_package_manager"],
	["no secret saved", "no_secret"],
	["refused the token", "token_refused"],
	["the name needs", "connection_name"],
	["bad address", "connection_address"],
	["the secret needs", "secret_invalid"],
	["invalid change id", "title_invalid"],
	["change exists", "change_exists"],
	["the run did not start", "run_not_started"],
];

const ACTIONS: Partial<Record<ErrorCode, ErrorAction>> = {
	no_project: { kind: "create_project", target: "" },
	no_tracker: { kind: "setting", target: "connections" },
	no_secret: { kind: "setting", target: "connections" },
	token_refused: { kind: "setting", target: "connections" },
	scope_missing: { kind: "setting", target: "trackerScope" },
	pickup_off: { kind: "setting", target: "pickupLabel" },
	ticket_not_in_mirror: { kind: "sync", target: "" },
	node_missing: { kind: "install", target: "node" },
};

/** What the mock gives to a raw text, the way `AppError::from` does in Rust. */
export function classify(text: string): { code: ErrorCode; action: ErrorAction | null } {
	const code = RAW.find(([needle]) => text.includes(needle))?.[1] ?? "unknown";
	return { code, action: ACTIONS[code] ?? null };
}

const languageOf = (): Lang => (document.documentElement.lang === "fr" ? "fr" : "en");

export type ErrorParts = { code: ErrorCode; details: string; action: ErrorAction | null };

/** The sentence of an error in a language. A code with no sentence gives its details. */
export function errorMessage(e: ErrorParts, lang: Lang = languageOf()): string {
	return e.code === "unknown" ? e.details : errorMessages[lang][e.code];
}

export const actionLabel = (a: ErrorAction, lang: Lang = languageOf()) =>
	actionLabels[lang][a.kind];

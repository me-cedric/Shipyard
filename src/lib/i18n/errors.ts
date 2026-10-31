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
		no_tracker: "This project has no issue tracker connection.",
		scope_missing: "Pick the issue tracker project to read from.",
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
		change_id_invalid: "This change id is not valid. Use lowercase letters, digits and hyphens.",
		change_exists: "A change with this title exists. Use another title.",
		run_not_started: "The run did not start.",
		merge_draft: "This pull request is a draft. Mark it ready first.",
		merge_closed: "This pull request is not open.",
		merge_method: "This code host does not offer this merge method.",
		forge_unreachable: "The server did not answer. Check the network, then try again.",
		forge_denied: "The server refused the token. Make a new token.",
		forge_missing: "The server does not know this item. Check the address and the token rights.",
		git_nothing_staged: "No file is staged. Stage a file first.",
		git_identity: "Git has no name and email. Set user.name and user.email.",
		git_busy: "The repository is busy. Finish the merge or the rebase first.",
		git_no_upstream: "This branch is not on the server yet. Push it first.",
		no_terminal: "No terminal app was found. Pick one in your settings.",
		terminal_gone: "This terminal app is not installed. Pick another in your settings.",
		device_not_set: "Browser sign-in is not set up for this host. Use a token instead.",
		no_editor: "No code editor was found. Install VS Code, Cursor, Zed, JetBrains or Sublime Text.",
		no_first_commit: "Make a first commit before you publish the project.",
		remote_address: "Use an https address with no user name or password.",
		remote_exists: "This project already has a remote. Change it instead.",
		sheet_frozen: "This sheet is frozen. Unfreeze it first.",
		feed_invalid:
			"This address does not give a news feed. Use the RSS or Atom address of the site.",
		setting_invalid: "A value does not fit its setting. Check the values, then save again.",
		gitlab_no_mcp: "This GitLab sign-in cannot open the GitLab tools. Sign in again.",
		gitlab_address: "The GitLab address changed. Switch the GitLab tools on again.",
		read_only: "This project is read only. Change its profile to edit.",
		agents_stopped: "Agents are stopped. Switch them on, then try again.",
		agent_limit: "Too many agents run now. Wait for one to end, then try again.",
		budget_spent: "The budget is spent. The review waits for the next budget.",
		head_missing:
			"This pull request is not on your computer yet. Fetch its branch, then try again.",
		no_changes: "This branch has no changes yet. Commit some, then try again.",
		review_posted: "This review is posted already.",
		review_running: "A review of this pull request is running.",
		figma_no_token: "Add the token of your Figma account first.",
		branch_diverged: "This branch has its own commits. Merge or rebase it instead.",
		picture_invalid: "Choose a PNG or JPEG picture of 1 MB or less.",
		review_no_result: "The agent gave no review. Try again.",
		agent_no_text: "The agent wrote no text. Try again.",
		agent_no_title: "The agent wrote no title. Try again.",
		review_no_draft: "This review has no draft. Start the review first.",
		review_empty: "The review has no text. Write a summary or keep a finding.",
		no_base: "This branch has no base to compare with. Fetch the base branch, then try again.",
		figma_address: "Use the address of a Figma file.",
	},
	fr: {
		no_project: "Ouvrez ou créez d'abord un projet.",
		no_tracker: "Ce projet n'a pas de connexion à un outil de suivi.",
		scope_missing: "Choisissez le projet de l'outil de suivi à lire.",
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
		change_id_invalid:
			"Cet identifiant de changement n'est pas valide. Utilisez des minuscules, des chiffres et des tirets.",
		change_exists: "Un changement porte déjà ce titre. Utilisez un autre titre.",
		run_not_started: "L'exécution n'a pas démarré.",
		merge_draft: "Cette pull request est un brouillon. Marquez-la d'abord comme prête.",
		merge_closed: "Cette pull request n'est pas ouverte.",
		merge_method: "Cet hébergeur de code ne propose pas cette méthode de fusion.",
		forge_unreachable: "Le serveur n'a pas répondu. Vérifiez le réseau, puis réessayez.",
		forge_denied: "Le serveur a refusé le jeton. Créez un nouveau jeton.",
		forge_missing:
			"Le serveur ne connaît pas cet élément. Vérifiez l'adresse et les droits du jeton.",
		git_nothing_staged: "Aucun fichier n'est indexé. Indexez d'abord un fichier.",
		git_identity: "Git n'a ni nom ni e-mail. Définissez user.name et user.email.",
		git_busy: "Le dépôt est occupé. Terminez d'abord la fusion ou le rebase.",
		git_no_upstream: "Cette branche n'est pas encore sur le serveur. Poussez-la d'abord.",
		no_terminal: "Aucune application de terminal trouvée. Choisissez-en une dans vos réglages.",
		terminal_gone:
			"Cette application de terminal n'est pas installée. Choisissez-en une autre dans vos réglages.",
		device_not_set:
			"La connexion par le navigateur n'est pas prévue pour cet hôte. Utilisez un jeton.",
		no_editor:
			"Aucun éditeur de code trouvé. Installez VS Code, Cursor, Zed, JetBrains ou Sublime Text.",
		no_first_commit: "Faites un premier commit avant de publier le projet.",
		remote_address: "Utilisez une adresse https sans nom d'utilisateur ni mot de passe.",
		remote_exists: "Ce projet a déjà un dépôt distant. Modifiez-le plutôt.",
		sheet_frozen: "Cette feuille est figée. Défigez-la d'abord.",
		feed_invalid:
			"Cette adresse ne donne pas de fil d'actualité. Utilisez l'adresse RSS ou Atom du site.",
		setting_invalid:
			"Une valeur ne convient pas à son réglage. Vérifiez les valeurs, puis enregistrez.",
		gitlab_no_mcp: "Cette connexion GitLab ne peut pas ouvrir les outils GitLab. Reconnectez-vous.",
		gitlab_address: "L'adresse GitLab a changé. Réactivez les outils GitLab.",
		read_only: "Ce projet est en lecture seule. Changez son profil pour modifier.",
		agents_stopped: "Les agents sont arrêtés. Activez-les, puis réessayez.",
		agent_limit: "Trop d'agents tournent. Attendez la fin de l'un d'eux, puis réessayez.",
		budget_spent: "Le budget est épuisé. La revue attend le prochain budget.",
		head_missing:
			"Cette pull request n'est pas encore sur votre ordinateur. Récupérez sa branche, puis réessayez.",
		no_changes: "Cette branche n'a pas encore de changements. Validez-en, puis réessayez.",
		review_posted: "Cette revue est déjà publiée.",
		review_running: "Une revue de cette pull request est en cours.",
		figma_no_token: "Ajoutez d'abord le jeton de votre compte Figma.",
		branch_diverged: "Cette branche a ses propres commits. Fusionnez-la ou rebasez-la plutôt.",
		picture_invalid: "Choisissez une image PNG ou JPEG de 1 Mo au plus.",
		review_no_result: "L'agent n'a rendu aucune revue. Réessayez.",
		agent_no_text: "L'agent n'a écrit aucun texte. Réessayez.",
		agent_no_title: "L'agent n'a écrit aucun titre. Réessayez.",
		review_no_draft: "Cette revue n'a pas de brouillon. Lancez d'abord la revue.",
		review_empty: "La revue n'a aucun texte. Écrivez un résumé ou gardez une remarque.",
		no_base:
			"Cette branche n'a pas de base de comparaison. Récupérez la branche de base, puis réessayez.",
		figma_address: "Utilisez l'adresse d'un fichier Figma.",
	},
};

/** The label of the action button of each kind. */
export const actionLabels: Record<Lang, Record<ActionKind, string>> = {
	en: {
		setting: "Open settings",
		sync: "Sync",
		install: "Install",
		create_project: "Create a project",
		open: "Open",
	},
	fr: {
		setting: "Ouvrir les réglages",
		sync: "Synchroniser",
		install: "Installer",
		create_project: "Créer un projet",
		open: "Ouvrir",
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
	["the title needs", "title_invalid"],
	["invalid change id", "change_id_invalid"],
	["change exists", "change_exists"],
	["the run did not start", "run_not_started"],
	["a draft pull request cannot merge", "merge_draft"],
	["the pull request is not open", "merge_closed"],
	["does not offer the method", "merge_method"],
	["HTTP 401", "forge_denied"],
	["HTTP 403", "forge_denied"],
	["HTTP 404", "forge_missing"],
	["network error:", "forge_unreachable"],
	["nothing is staged", "git_nothing_staged"],
	["no git identity", "git_identity"],
	["the repository is busy with", "git_busy"],
	["the branch has no upstream", "git_no_upstream"],
	["no terminal app was found", "no_terminal"],
	["terminal app is not installed", "terminal_gone"],
	["browser sign-in is not set up", "device_not_set"],
	["no code editor was found", "no_editor"],
	["make a first commit before", "no_first_commit"],
	["bad remote address", "remote_address"],
	["the project already has a remote", "remote_exists"],
	["the sheet is frozen", "sheet_frozen"],
	["does not hold an RSS or Atom feed", "feed_invalid"],
	["the setting ", "setting_invalid"],
	["the GitLab sign-in has no mcp scope", "gitlab_no_mcp"],
	["the GitLab address changed", "gitlab_address"],
	["is read only", "read_only"],
	["the agents are stopped", "agents_stopped"],
	["the agent limit is reached", "agent_limit"],
	["is spent: the review waits", "budget_spent"],
	["the head commit is not in the local repository", "head_missing"],
	["the branch has no changes to describe", "no_changes"],
	["the review is posted already", "review_posted"],
	["a review of this pull request is running", "review_running"],
	["no Figma token", "figma_no_token"],
	["has its own commits: merge or rebase it", "branch_diverged"],
	["the picture is not a PNG or a JPEG file", "picture_invalid"],
	["the picture is larger than 1 MB", "picture_invalid"],
	["the review has no result", "review_no_result"],
	["the agent wrote no text", "agent_no_text"],
	["the agent wrote no title", "agent_no_title"],
	["no draft review", "review_no_draft"],
	["the review is empty", "review_empty"],
	["the branch has no base to compare with", "no_base"],
	["this is not a Figma file address", "figma_address"],
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
	merge_draft: { kind: "open", target: "/code/pull-requests" },
	merge_closed: { kind: "open", target: "/code/pull-requests" },
	merge_method: { kind: "open", target: "/code/pull-requests" },
	forge_denied: { kind: "setting", target: "connections" },
	gitlab_no_mcp: { kind: "setting", target: "connections" },
	gitlab_address: { kind: "setting", target: "connections" },
	git_nothing_staged: { kind: "open", target: "/code/changes" },
	git_no_upstream: { kind: "open", target: "/code/branches" },
	no_terminal: { kind: "setting", target: "terminalApp" },
	terminal_gone: { kind: "setting", target: "terminalApp" },
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

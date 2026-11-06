/** The strings of the onboarding tour and of the OS permissions (spec `onboarding`). */
export const onboardingEn = {
	replay: "Replay the tour",
	tour: "Tour",
	step: "Step {n} of {total}",
	next: "Next",
	back: "Back",
	done: "Done",
	manual: "Open the manual",
	steps: {
		loop: {
			title: "One loop, from idea to merged code",
			body: "Design, specs, work, agents, code and knowledge stay together, in the files of your project.",
		},
		project: {
			title: "Open a project",
			body: "Open a folder, clone a repository or start a new project. The team shares it with git.",
		},
		connect: {
			title: "Connect the issue tracker and the code host",
			body: "The tickets come from the issue tracker. The pull requests go to the code host.",
		},
		ai: {
			title: "Choose the AI tool",
			body: "Claude Code or Codex does the work, inside the budget and the limits that you set.",
		},
		permissions: {
			title: "Allow what Shipyard needs",
			body: "Turn them on now, so that no system prompt stops a run later.",
		},
		run: {
			title: "Run your first ticket",
			body: "An agent plans, builds and checks the ticket, then opens a pull request for your review.",
		},
	},
	setup: {
		title: "Setup",
		done: "Done",
		todo: "To do",
		item: {
			project: "Project",
			ai: "AI tool",
			models: "Models",
			tracker: "Issue tracker",
			forge: "Code host",
			permissions: "Permissions",
			team: "Team",
		},
		action: {
			project: "New project",
			signIn: "Sign in",
			models: "Choose models",
			connect: "Connect",
			permissions: "Open",
			team: "Add me as admin",
		},
	},
	picture: {
		folder: "Open a folder",
		clone: "Clone",
		create: "New project",
		tracker: "Issue tracker",
		host: "Code host",
		budget: "Budget",
		ticket: "Add the export button",
	},
	permissions: {
		title: "Permissions",
		kind: { notifications: "Notifications", files: "Documents, Desktop and Downloads" },
		state: {
			on: "On",
			off: "Off",
			notAsked: "Not asked",
			notNeeded: "Not needed",
			unknown: "Unknown",
		},
		allow: "Allow",
		settings: "Open System Settings",
		test: "Send a test",
		testBody: "The notifications are on.",
	},
};

export const onboardingFr: typeof onboardingEn = {
	replay: "Revoir la visite",
	tour: "Visite",
	step: "Étape {n} sur {total}",
	next: "Suivant",
	back: "Retour",
	done: "Terminé",
	manual: "Ouvrir le manuel",
	steps: {
		loop: {
			title: "Une boucle, de l'idée au code fusionné",
			body: "Le design, les specs, le travail, les agents, le code et les connaissances restent ensemble, dans les fichiers du projet.",
		},
		project: {
			title: "Ouvrir un projet",
			body: "Ouvrez un dossier, clonez un dépôt ou créez un projet. L'équipe le partage avec git.",
		},
		connect: {
			title: "Connecter l'outil de suivi et l'hébergeur de code",
			body: "Les tickets viennent de l'outil de suivi. Les pull requests vont à l'hébergeur de code.",
		},
		ai: {
			title: "Choisir l'outil d'IA",
			body: "Claude Code ou Codex fait le travail, dans le budget et les limites que vous fixez.",
		},
		permissions: {
			title: "Autoriser ce dont Shipyard a besoin",
			body: "Activez-les maintenant : aucune demande du système n'arrêtera une exécution plus tard.",
		},
		run: {
			title: "Lancer votre premier ticket",
			body: "Un agent planifie, construit et vérifie le ticket, puis ouvre une pull request pour votre revue.",
		},
	},
	setup: {
		title: "Mise en route",
		done: "Fait",
		todo: "À faire",
		item: {
			project: "Projet",
			ai: "Outil d'IA",
			models: "Modèles",
			tracker: "Outil de suivi",
			forge: "Hébergeur de code",
			permissions: "Autorisations",
			team: "Équipe",
		},
		action: {
			project: "Nouveau projet",
			signIn: "Se connecter",
			models: "Choisir les modèles",
			connect: "Connecter",
			permissions: "Ouvrir",
			team: "M'ajouter comme admin",
		},
	},
	picture: {
		folder: "Ouvrir un dossier",
		clone: "Cloner",
		create: "Nouveau projet",
		tracker: "Outil de suivi",
		host: "Hébergeur de code",
		budget: "Budget",
		ticket: "Ajouter le bouton d'export",
	},
	permissions: {
		title: "Autorisations",
		kind: { notifications: "Notifications", files: "Documents, Bureau et Téléchargements" },
		state: {
			on: "Activé",
			off: "Désactivé",
			notAsked: "Pas demandé",
			notNeeded: "Pas nécessaire",
			unknown: "Inconnu",
		},
		allow: "Autoriser",
		settings: "Ouvrir les Réglages Système",
		test: "Envoyer un test",
		testBody: "Les notifications sont activées.",
	},
};

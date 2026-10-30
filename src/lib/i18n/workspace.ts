/** The strings of the W10 closing rows: the pull request actions, the push gate, the repo picker, the Projects page, the overrides and profiles. */
export const workspaceEn = {
	pr: {
		group: "Assistant",
		describe: "Write description",
		review: "Review",
		reply: "Reply",
		prompt: {
			describe:
				"Write the description of pull request #{number} {title} ({source} to {target}). Files: {files}.",
			review:
				"Review pull request #{number} {title} ({source} to {target}). CI: {ci}. Files: {files}. Name each risk with its file.",
			reply:
				"Write a reply to the open threads of pull request #{number} {title}. Threads: {threads}.",
		},
	},
	gate: {
		stale: "{from} changed, {to} did not: {paths}",
		cannotPush: "The account cannot push to {remote}",
		onDefault: "{branch} is the default branch of {remote}",
	},
	conflict: {
		agent: "Hand to agent",
		factory: "Hand to factory",
		sent: "Work item {key} created",
		prompt:
			"Resolve the merge conflicts in {files}. Keep the intent of both sides. Leave no marker.",
	},
	notes: { title: "Delivery notes", open: "Open {title}", empty: "No note" },
	budget: {
		label: "Budget {key}",
		used: "{used} h of {estimate} h",
		over: "{n} h over",
		link: "Legacy ticket {key}",
	},
	picker: {
		account: "Account",
		search: "Search repositories",
		cannotPush: "Cannot push",
		use: "Use {slug}",
		newRemote: "New remote repository",
		slug: "owner/name",
		create: "Create repository",
		newLocal: "New local repository",
		none: "No repository",
	},
	page: {
		open: "Open",
		openName: "Open {name}",
		details: "Details",
		hideDetails: "Hide details",
		openRemote: "Open remote",
		remove: "Remove",
		local: "Local",
		ahead: "{count} ahead",
		behind: "{count} behind",
		changes: "{count} changes",
		noCommit: "No commit",
		folder: "Folder",
		remote: "Remote",
		empty: "No project",
	},
	override: {
		title: "Project overrides",
		remoteWatch: "Watch the remote",
		notifications: "Notices",
		assistant: "Assistant",
		runner: "Runner",
		model: "Model",
		effort: "Effort",
		permission: "Permission",
		permissions: { approve: "Approve", auto: "Auto" },
		save: "Save",
		default: "Default",
	},
	profile: {
		title: "Profile",
		role: "Role",
		tabs: "Spaces",
		readOnly: "Read only",
	},
};

export const workspaceFr: typeof workspaceEn = {
	pr: {
		group: "Assistant",
		describe: "Écrire la description",
		review: "Relire",
		reply: "Répondre",
		prompt: {
			describe:
				"Écris la description de la pull request #{number} {title} ({source} vers {target}). Fichiers : {files}.",
			review:
				"Relis la pull request #{number} {title} ({source} vers {target}). CI : {ci}. Fichiers : {files}. Nomme chaque risque avec son fichier.",
			reply:
				"Écris une réponse aux fils ouverts de la pull request #{number} {title}. Fils : {threads}.",
		},
	},
	gate: {
		stale: "{from} a changé, pas {to} : {paths}",
		cannotPush: "Le compte ne peut pas pousser vers {remote}",
		onDefault: "{branch} est la branche par défaut de {remote}",
	},
	conflict: {
		agent: "Confier à un agent",
		factory: "Confier à l'usine",
		sent: "Élément {key} créé",
		prompt:
			"Résous les conflits de fusion dans {files}. Garde l'intention des deux côtés. Ne laisse aucun marqueur.",
	},
	notes: { title: "Notes de livraison", open: "Ouvrir {title}", empty: "Aucune note" },
	budget: {
		label: "Budget {key}",
		used: "{used} h sur {estimate} h",
		over: "{n} h de trop",
		link: "Ticket Legacy {key}",
	},
	picker: {
		account: "Compte",
		search: "Chercher un dépôt",
		cannotPush: "Poussée impossible",
		use: "Utiliser {slug}",
		newRemote: "Nouveau dépôt distant",
		slug: "propriétaire/nom",
		create: "Créer le dépôt",
		newLocal: "Nouveau dépôt local",
		none: "Aucun dépôt",
	},
	page: {
		open: "Ouvrir",
		openName: "Ouvrir {name}",
		details: "Détails",
		hideDetails: "Masquer les détails",
		openRemote: "Ouvrir le distant",
		remove: "Retirer",
		local: "Local",
		ahead: "{count} en avance",
		behind: "{count} en retard",
		changes: "{count} changements",
		noCommit: "Aucun commit",
		folder: "Dossier",
		remote: "Distant",
		empty: "Aucun projet",
	},
	override: {
		title: "Réglages du projet",
		remoteWatch: "Surveiller le distant",
		notifications: "Avis",
		assistant: "Assistant",
		runner: "Moteur",
		model: "Modèle",
		effort: "Effort",
		permission: "Permission",
		permissions: { approve: "Approuver", auto: "Auto" },
		save: "Enregistrer",
		default: "Défaut",
	},
	profile: {
		title: "Profil",
		role: "Rôle",
		tabs: "Espaces",
		readOnly: "Lecture seule",
	},
};

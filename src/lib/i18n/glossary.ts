/** The glossary of the marked terms, and the two empty pages that name a missing set-up step. */
export const glossaryEn = {
	manual: "Manual",
	terms: {
		"issue-tracker": "The tool where your team keeps its tickets, such as Linear or Jira.",
		"code-host": "The website that stores your code online, such as GitHub or GitLab.",
		"ai-tool": "A program on this computer that writes code when you ask, such as Claude Code.",
		model: "The AI brain that an AI tool uses. A bigger model thinks better and costs more.",
		spec: "A short text that says what to build and how to check that it works.",
		decision: "A note that records a choice and the reason for it.",
		run: "One try by an AI tool to finish a ticket, from the first step to a pull request.",
		"pull-request":
			"A request to add your changes to the main code, so that others can review them.",
	},
	words: {
		"issue-tracker": "issue tracker",
		"code-host": "code host",
		"ai-tool": "AI tool",
		model: "model",
		spec: "spec",
		decision: "decision",
		run: "run",
		"pull-request": "pull request",
	},
	noRunner: "No AI tool found",
	setUpRunner: "Set up an AI tool",
	noTracker: "No issue tracker linked",
	connectTracker: "Connect an issue tracker",
};

export const glossaryFr: typeof glossaryEn = {
	manual: "Manuel",
	terms: {
		"issue-tracker": "L’outil où votre équipe garde ses tickets, comme Linear ou Jira.",
		"code-host": "Le site qui garde votre code en ligne, comme GitHub ou GitLab.",
		"ai-tool":
			"Un programme de cet ordinateur qui écrit du code à votre demande, comme Claude Code.",
		model:
			"Le cerveau d’IA qu’un outil d’IA utilise. Un grand modèle réfléchit mieux et coûte plus.",
		spec: "Un court texte qui dit quoi construire et comment vérifier que cela marche.",
		decision: "Une note qui garde un choix et sa raison.",
		run: "Un essai d’un outil d’IA pour finir un ticket, du premier pas à la pull request.",
		"pull-request":
			"Une demande pour ajouter vos changements au code principal, afin que d’autres les relisent.",
	},
	words: {
		"issue-tracker": "outil de suivi",
		"code-host": "hébergeur de code",
		"ai-tool": "outil d’IA",
		model: "modèle",
		spec: "spec",
		decision: "décision",
		run: "run",
		"pull-request": "pull request",
	},
	noRunner: "Aucun outil d’IA trouvé",
	setUpRunner: "Configurer un outil d’IA",
	noTracker: "Aucun outil de suivi relié",
	connectTracker: "Relier un outil de suivi",
};

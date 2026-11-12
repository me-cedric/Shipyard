import type { glossaryEn } from "../glossary";

export const glossaryEs: typeof glossaryEn = {
	manual: "Manual",
	terms: {
		"issue-tracker": "La herramienta donde su equipo guarda sus tickets, como Linear o Jira.",
		"code-host": "El sitio web que guarda su código en línea, como GitHub o GitLab.",
		"ai-tool":
			"Un programa de este ordenador que escribe código cuando se lo pide, como Claude Code.",
		model:
			"El cerebro de IA que usa una herramienta de IA. Un modelo más grande piensa mejor y cuesta más.",
		spec: "Un texto corto que dice qué construir y cómo comprobar que funciona.",
		decision: "Una nota que guarda una elección y su motivo.",
		run: "Un intento de una herramienta de IA de terminar un ticket, del primer paso al pull request.",
		"pull-request":
			"Una petición para añadir sus cambios al código principal, para que otras personas los revisen.",
	},
	words: {
		"issue-tracker": "gestor de tickets",
		"code-host": "plataforma de código",
		"ai-tool": "herramienta de IA",
		model: "modelo",
		spec: "especificación",
		decision: "decisión",
		run: "ejecución",
		"pull-request": "pull request",
	},
	noRunner: "No se encontró ninguna herramienta de IA",
	setUpRunner: "Configurar una herramienta de IA",
	noTracker: "Ningún gestor de tickets conectado",
	connectTracker: "Conectar un gestor de tickets",
};

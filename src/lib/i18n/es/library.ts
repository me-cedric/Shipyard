import type { libraryEn } from "../library";

export const libraryEs: typeof libraryEn = {
	title: "Biblioteca",
	back: "Biblioteca",
	views: { home: "Biblioteca", reports: "Informes" },
	doors: {
		what: "Qué debe hacer",
		how: "Cómo está construido",
		why: "Por qué es así",
		learn: "Aprender y compartir",
	},
	questionsOne: "1 pregunta abierta",
	questionsMany: "{count} preguntas abiertas",
	decisionsOne: "1 decisión en espera",
	decisionsMany: "{count} decisiones en espera",
	tested: "Qué está probado",
	answers: "Respuestas",
	glossary: "Glosario",
	learnProgress: "{label}, {done} de {total}",
	pinned: "Fijado",
	openedLast: "Abierto por último",
	pin: "Fijar",
	unpin: "Quitar",
	pinPage: "Fijar {name}",
	unpinPage: "Quitar {name}",
};

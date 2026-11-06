import type { onboardingEn } from "../onboarding";

export const onboardingEs: typeof onboardingEn = {
	replay: "Repetir el recorrido",
	tour: "Recorrido",
	step: "Paso {n} de {total}",
	next: "Siguiente",
	back: "Atrás",
	done: "Listo",
	manual: "Abrir el manual",
	steps: {
		loop: {
			title: "Un solo ciclo, de la idea al código fusionado",
			body: "Diseño, especificaciones, trabajo, agentes, código y conocimiento van juntos, en los archivos de tu proyecto.",
		},
		project: {
			title: "Abrir un proyecto",
			body: "Abre una carpeta, clona un repositorio o empieza un proyecto nuevo. El equipo lo comparte con git.",
		},
		connect: {
			title: "Conectar el gestor de tickets y la plataforma de código",
			body: "Los tickets vienen del gestor de tickets. Los pull requests van a la plataforma de código.",
		},
		ai: {
			title: "Elegir la herramienta de IA",
			body: "Claude Code o Codex hace el trabajo, dentro del presupuesto y los límites que defines.",
		},
		permissions: {
			title: "Permitir lo que Shipyard necesita",
			body: "Actívalos ahora, para que ningún aviso del sistema detenga una ejecución más tarde.",
		},
		run: {
			title: "Ejecutar tu primer ticket",
			body: "Un agente planifica, construye y comprueba el ticket, y luego abre un pull request para tu revisión.",
		},
	},
	picture: {
		folder: "Abrir una carpeta",
		clone: "Clonar",
		create: "Nuevo proyecto",
		tracker: "Gestor de tickets",
		host: "Plataforma de código",
		budget: "Presupuesto",
		ticket: "Añadir el botón de exportar",
	},
	permissions: {
		title: "Permisos",
		kind: { notifications: "Notificaciones", files: "Documentos, Escritorio y Descargas" },
		state: {
			on: "Activado",
			off: "Desactivado",
			notAsked: "Sin solicitar",
			notNeeded: "No necesario",
			unknown: "Desconocido",
		},
		allow: "Permitir",
		settings: "Abrir Ajustes del Sistema",
		test: "Enviar una prueba",
		testBody: "Las notificaciones están activadas.",
	},
};

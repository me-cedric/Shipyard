import type { shellFnEn } from "../shell-fn";

export const shellFnEs: typeof shellFnEn = {
	signOut: {
		label: "Cerrar sesión",
		confirm: "¿Quitar el acceso de {names}?",
		none: "Ningún alojamiento de código ni gestor de incidencias tiene sesión",
		done: "Sesión cerrada en {names}",
	},
	sessions: {
		take: "Tomar el control",
		takeOf: "Tomar el control de {name}",
		confirmTake: "¿Detener {name} y abrirlo en el terminal?",
		taken: "Abierto en el terminal",
		noResume: "{name} no tiene una sesión que reabrir",
	},
	load: {
		processor: "Procesador, {percent} %",
		memory: "Memoria, {value}",
		processorBar: "Uso del procesador",
		memoryBar: "Uso de la memoria",
		toolCalls: "Llamadas a herramientas",
	},
	rights: {
		codeMerge: "Código y fusión",
		placesTitle: "Lugares de {role}",
		places: "Lugares",
		hide: "{place} para {role}",
		shown: "Visible",
		hidden: "Oculto",
	},
	time: {
		fill: "Rellenar con mi trabajo",
		filled: "{count} filas añadidas",
		nothing: "Nada que añadir",
	},
	roles: {
		tier: "Modelo de {name}",
		top: "El mejor",
		mid: "Estándar",
		small: "Rápido",
	},
	notify: {
		budget: "Un presupuesto llega al {percent} %",
		sound: "Sonido",
		channel: "Canal de versiones",
		stable: "Estable",
		preview: "Vista previa",
		budgetTitle: "Un presupuesto llegó al {percent} %",
		budgetBody: "{name}: {spent} de {budget}",
		allTools: "Todas las herramientas de IA",
	},
	data: {
		change: "Cambiar",
		changeTo: "Cambiar la carpeta de datos",
		confirmMove: "¿Mover los datos a {path} y reiniciar Shipyard?",
		portable: "Modo portátil",
	},
	feedback: {
		attach: "Adjuntar un archivo",
		attached: "Mostrado en el gestor de archivos",
	},
	permissions: {
		moment: "Shipyard necesita {count} permisos",
		momentOne: "Shipyard necesita 1 permiso",
		later: "Más tarde",
	},
	close: {
		title: "Agentes aún trabajando: {count}",
		titleOne: "1 agente sigue trabajando",
		stop: "Detenerlos y cerrar",
		keep: "Dejarlos trabajar",
		cancel: "Cancelar",
	},
};

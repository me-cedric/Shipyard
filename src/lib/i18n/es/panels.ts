import type { panelsEn } from "../panels";

export const panelsEs: typeof panelsEn = {
	sessions: {
		title: "Sesiones activas",
		none: "Ninguna sesión activa",
		all: "Todas las sesiones",
		tokens: "{count} tokens",
	},
	files: {
		title: "Archivos",
		toggle: "Archivos",
		search: "Buscar archivos",
		close: "Cerrar archivos",
		refresh: "Actualizar archivos",
		open: "Abrir",
		reveal: "Mostrar en Cambios",
		copy: "Copiar ruta",
		none: "Ningún archivo",
		more: "{count} más",
	},
	terminal: {
		title: "Terminales",
		toggle: "Terminal",
		add: "Nuevo terminal",
		close: "Cerrar {name}",
		hide: "Ocultar terminal",
		tab: "Terminal {n}",
		dock: "Acoplar terminal",
		docks: { bottom: "Abajo", left: "Izquierda", right: "Derecha" },
		resize: "Tamaño del terminal",
	},
};

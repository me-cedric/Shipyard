import type { reviewEn } from "../review";

export const reviewEs: typeof reviewEn = {
	chain: {
		stale: "Desactualizado",
		acknowledge: "Dar por visto",
		acknowledgeName: "Dar por visto {name}",
		because: "Motivo: {reason}",
		withdraw: "Retirar",
		withdrawName: "Retirar {name}",
		reason: "Motivo",
	},
	quality: {
		verifyDocs: "Verificar toda la documentación",
		docs: "Documentación",
		staleDocs: "{count} documentos desactualizados",
		coverage: "Cobertura",
	},
	plans: {
		requirements: "Requisitos",
		generate: "Generar escenarios",
		generateName: "Generar escenarios para {name}",
		scenarios: "{count} escenarios",
		noScenario: "Sin escenarios",
	},
	apply: {
		write: "Escribir {name}",
		title: "Título de {name}",
		days: "Días de {name}",
	},
	question: {
		body: "Texto",
		delete: "Eliminar",
		noOwner: "Sin responsable",
	},
	documents: {
		search: "Buscar en el texto",
		results: "Resultados",
		noResults: "Sin resultados",
		rename: "Renombrar",
		delete: "Eliminar",
		line: "Línea {line}",
	},
};

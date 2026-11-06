import type { editingEn } from "../editing";

export const editingEs: typeof editingEn = {
	view: { label: "Vista", form: "Formulario", text: "Texto" },
	field: { title: "Título", status: "Estado", people: "Personas" },
	adrStatus: { deprecated: "Obsoleta", superseded: "Reemplazada" } as Record<string, string>,
	preview: "Vista previa",
	sides: { editor: "Editor", preview: "Vista previa" },
	openFigma: "Abrir en Figma",
	next: {
		plan: "Escribir el plan",
		split: "Dividir en elementos de trabajo",
		assign: "Asignármelo",
		start: "Iniciar ejecución",
		answer: "Responder",
		review: "Revisar",
		merge: "Fusionar",
	},
};

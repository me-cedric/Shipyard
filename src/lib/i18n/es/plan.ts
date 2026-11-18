import type { planEn } from "../plan";

export const planEs: typeof planEn = {
	views: { timeline: "Cronograma", people: "Personas", estimates: "Estimaciones", time: "Tiempo" },
	ends: "{name} termina el {day}",
	calendar: "Fechas y días libres",
	send: "Enviar al gestor de tickets",
	tooMuch: "{count} personas tienen demasiado trabajo",
	tooMuchOne: "{name} tiene demasiado trabajo",
	planner: "Planificador",
	show: "Mostrar",
	apply: "Aplicar",
	rebalance: "Reequilibrar",
	moveTo: "{task} de {from} a {to}",
	startsOn: "{task} empieza el {day}",
	noOwner: "Tareas sin responsable",
	load: "{used} de {capacity} días",
	week: "Semana del {day}",
	previousWeek: "Semana anterior",
	nextWeek: "Semana siguiente",
	hours: "Horas de {ticket}, {day}",
	groups: { create: "Nuevo", update: "Cambiado", unchanged: "Sigue igual" },
};

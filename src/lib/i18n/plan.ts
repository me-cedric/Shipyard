/** Plan (`spec:app-redesign#REQ-018`, `spec:app-redesign#REQ-019`). */
export const planEn = {
	views: { timeline: "Timeline", people: "People", estimates: "Estimates", time: "Time" },
	ends: "{name} ends {day}",
	calendar: "Dates and days off",
	send: "Send to the issue tracker",
	tooMuch: "{count} people have too much work",
	tooMuchOne: "{name} has too much work",
	planner: "Planner",
	show: "Show",
	apply: "Apply",
	rebalance: "Rebalance",
	moveTo: "{task} from {from} to {to}",
	startsOn: "{task} starts {day}",
	noOwner: "Tasks with no owner",
	load: "{used} of {capacity} days",
};

export const planFr: typeof planEn = {
	views: { timeline: "Calendrier", people: "Personnes", estimates: "Estimations", time: "Temps" },
	ends: "{name} se termine le {day}",
	calendar: "Dates et jours non travaillés",
	send: "Envoyer à l'outil de suivi",
	tooMuch: "{count} personnes ont trop de travail",
	tooMuchOne: "{name} a trop de travail",
	planner: "Planificateur",
	show: "Afficher",
	apply: "Appliquer",
	rebalance: "Rééquilibrer",
	moveTo: "{task} de {from} à {to}",
	startsOn: "{task} commence le {day}",
	noOwner: "Tâches sans responsable",
	load: "{used} sur {capacity} jours",
};

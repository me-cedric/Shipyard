import type { planEn } from "../plan";

export const planDe: typeof planEn = {
	views: { timeline: "Zeitplan", people: "Personen", estimates: "Schätzungen", time: "Zeit" },
	ends: "{name} endet am {day}",
	calendar: "Termine und freie Tage",
	send: "An das Ticketsystem senden",
	tooMuch: "{count} Personen haben zu viel Arbeit",
	tooMuchOne: "{name} hat zu viel Arbeit",
	planner: "Planer",
	show: "Anzeigen",
	apply: "Anwenden",
	rebalance: "Ausgleichen",
	moveTo: "{task} von {from} zu {to}",
	startsOn: "{task} beginnt am {day}",
	noOwner: "Aufgaben ohne Verantwortliche",
	load: "{used} von {capacity} Tagen",
	week: "Woche vom {day}",
	previousWeek: "Vorherige Woche",
	nextWeek: "Nächste Woche",
	hours: "Stunden für {ticket}, {day}",
	groups: { create: "Neu", update: "Geändert", unchanged: "Bleibt gleich" },
};

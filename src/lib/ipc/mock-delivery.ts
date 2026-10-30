// The mock of the delivery files: personas, the work split by profile (read only) and the
// tickets config. It applies the rules of `crates/shipyard-store/src/delivery_docs.rs`.
import type { Assignments, Persona, TicketsConfig } from "./bindings";

export type MockDelivery = {
	personas: Persona[];
	assignments: Assignments;
	tickets: TicketsConfig;
};

export const seedDelivery = (): MockDelivery => ({
	personas: [
		{
			id: "p-dev",
			name: "Backend developer",
			description: "",
			tjm: 500,
			cjm: 350,
			username: "",
			active: true,
		},
		{
			id: "p-qa",
			name: "QA",
			description: "",
			tjm: 400,
			cjm: 300,
			username: "",
			active: true,
		},
	],
	assignments: {
		generatedAt: "2026-10-01",
		overlapRisk: "",
		gates: [],
		assignments: [
			{
				personaId: "p-dev",
				personaName: "Backend developer",
				scope: ["crates/"],
				brief: "Build the sync.",
				items: [
					{
						id: "A1",
						title: "Sync engine",
						why: "",
						firstSteps: ["Read the spec"],
						specRef: "",
						mandays: 3,
						gate: "",
					},
				],
				seams: [],
				mandays: 3,
				cost: 1500,
				briefText: "# Backend developer\n\nBuild the sync.\n",
			},
		],
	},
	tickets: {
		epic: "Epic",
		story: "Story",
		task: "Task",
		subtask: "Sub-task",
		estimateMode: "timetracking",
		estimateField: "",
		hoursPerDay: 7,
		labels: [],
		specBaseUrl: "",
		hierarchy: "feature",
	},
});

export function personasSave(d: MockDelivery, list: Persona[]) {
	const ids = new Set<string>();
	for (const p of list) {
		if (!(p.id.trim() && p.name.trim())) throw "a persona needs an id and a name";
		if (ids.has(p.id)) throw `two personas have the id ${p.id}`;
		ids.add(p.id);
		if ((p.tjm ?? 0) < 0 || (p.cjm ?? 0) < 0) throw `the rates of ${p.name} must be zero or more`;
	}
	d.personas = list.map((p) => ({ ...p, name: p.name.trim() }));
}

export function ticketsConfigSave(d: MockDelivery, c: TicketsConfig) {
	if ([c.epic, c.story, c.task, c.subtask].some((t) => !t.trim()))
		throw "each issue type needs a name";
	if (!["timetracking", "points", "none"].includes(c.estimateMode))
		throw `unknown estimate mode: ${c.estimateMode}`;
	if (!["feature", "group"].includes(c.hierarchy)) throw `unknown hierarchy: ${c.hierarchy}`;
	const h = c.hoursPerDay ?? 0;
	if (!(h >= 1 && h <= 24)) throw "the hours per day must be between 1 and 24";
	const url = c.specBaseUrl.trim();
	if (url && !/^https?:\/\//.test(url))
		throw "the spec base URL must start with http:// or https://";
	d.tickets = { ...c, specBaseUrl: url, labels: c.labels.map((l) => l.trim()).filter(Boolean) };
}

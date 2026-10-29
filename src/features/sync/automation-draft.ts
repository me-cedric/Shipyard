import { format, type Messages } from "@/lib/i18n";
import { type Automation, MIN_INTERVAL } from "@/lib/sync";

/** The run states, in the order of the state machine (`RunState::ALL`). The file keys use them. */
export const RUN_STATES = [
	"Queued",
	"Claimed",
	"Planning",
	"PlanReview",
	"Working",
	"SelfReview",
	"PROpen",
	"ChangesRequested",
	"Merged",
	"Done",
	"WaitingForAnswer",
	"Blocked",
	"RetryQueued",
	"Paused",
	"Failed",
	"Cancelled",
] as const;

/** What the fields hold while a person types: text, so a half-typed number stays as it is. */
export type Draft = {
	interval: string;
	global: string;
	perProject: string;
	/** `name=number, name=number` */
	perStatus: string;
	assignee: string;
	label: string;
	statuses: string;
	component: string;
	priority: string;
	map: Record<string, { status: string; labels: string }>;
	writes: Automation["writes"];
};

const list = (text: string) =>
	text
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);

export const toDraft = (a: Automation): Draft => ({
	interval: String(a.interval),
	global: String(a.concurrency.global),
	perProject: a.concurrency.per_project === undefined ? "" : String(a.concurrency.per_project),
	perStatus: Object.entries(a.concurrency.per_status ?? {})
		.map(([k, v]) => `${k}=${v}`)
		.join(", "),
	assignee: a.pickup.assignee ?? "",
	label: a.pickup.label ?? "",
	statuses: a.pickup.statuses.join(", "),
	component: a.pickup.component ?? "",
	priority: a.pickup.priority ?? "",
	map: Object.fromEntries(
		RUN_STATES.map((s) => [
			s,
			{
				status: a.status_map[s]?.status ?? "",
				labels: (a.status_map[s]?.labels ?? []).join(", "),
			},
		]),
	),
	writes: a.writes,
});

const whole = /^\d+$/;

/** The file value of a draft, or the text of the first error. An unset part stays out. */
export function fromDraft(d: Draft, t: Messages): { automation: Automation } | { error: string } {
	const number = (name: string, text: string) =>
		whole.test(text.trim()) ? Number(text) : format(t.sync.automation.error.number, { name });
	const a = t.sync.automation;
	const interval = number(a.interval, d.interval);
	if (typeof interval === "string") return { error: interval };
	if (interval < MIN_INTERVAL) return { error: format(a.error.interval, { min: MIN_INTERVAL }) };
	const global = number(a.global, d.global);
	if (typeof global === "string") return { error: global };
	let perProject: number | undefined;
	if (d.perProject.trim()) {
		const n = number(a.perProject, d.perProject);
		if (typeof n === "string") return { error: n };
		perProject = n;
	}
	const perStatus: Record<string, number> = {};
	for (const part of list(d.perStatus)) {
		const [name, count] = part.split("=").map((v) => v.trim());
		if (!name || count === undefined || !whole.test(count)) return { error: a.error.perStatus };
		perStatus[name] = Number(count);
	}
	const status_map: Automation["status_map"] = {};
	for (const [state, row] of Object.entries(d.map)) {
		const status = row.status.trim();
		const labels = list(row.labels);
		if (status || labels.length)
			status_map[state] = { ...(status ? { status } : {}), ...(labels.length ? { labels } : {}) };
	}
	const text = (v: string) => (v.trim() ? v.trim() : undefined);
	return {
		automation: {
			interval,
			pickup: {
				...(text(d.assignee) ? { assignee: text(d.assignee) } : {}),
				// An empty label turns the label filter off.
				label: text(d.label) ?? null,
				statuses: list(d.statuses),
				...(text(d.component) ? { component: text(d.component) } : {}),
				...(text(d.priority) ? { priority: text(d.priority) } : {}),
			},
			concurrency: {
				global,
				...(perProject === undefined ? {} : { per_project: perProject }),
				...(Object.keys(perStatus).length ? { per_status: perStatus } : {}),
			},
			status_map,
			writes: d.writes,
		},
	};
}

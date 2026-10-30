// The mock of the sync commands. It applies the rules of the Rust commands: the mirror starts empty
// and only a tick, an import or an adopt fills it, a view reads the mirror and never the fake
// tracker, an interval under 30 s is refused, and a link needs a ref on its local side.
import type {
	Automation_Serialize,
	AutomationView_Serialize,
	ItemFilter_Deserialize,
	SyncConnection_Serialize,
	SyncReport,
	WorkItemView_Serialize,
} from "./bindings";
import { parseRef } from "./mock-refs";

export type MockSync = {
	/** What the fake tracker would give. Views never read it. */
	mirror: WorkItemView_Serialize[];
	automation: Automation_Serialize;
	file: AutomationView_Serialize["file"];
	/** Ticks that ran. */
	ticks: number;
	/** Unix seconds of the last good tick, by connection id. */
	lastOk: Record<string, number>;
	failures: Record<string, string>;
	/** The count that an import plan showed, until the confirm. */
	pending: number | null;
	/** Keys that this machine claimed. */
	claimed: string[];
};

const ticket = (
	n: number,
	title: string,
	status: string,
	category: "todo" | "in-progress" | "done",
	assignee: string | null,
	labels: string[],
): WorkItemView_Serialize => ({
	key: `ACME-${n}`,
	title,
	description: `${title}.`,
	kind: "task",
	status,
	category,
	assignee,
	// The Work commands resolve the member from the team.
	member: null,
	labels,
	parent: null,
	url: `https://tracker.example.com/browse/ACME-${n}`,
	// Newer tickets have a higher number, so the order is stable.
	updated: `2026-10-${String(10 + n).padStart(2, "0")}T09:00:00Z`,
	linked: null,
	claimed: false,
	estimateMinutes: n % 3 === 0 ? 480 : null,
	spentMinutes: n % 3 === 0 ? 360 : null,
});

/** The fake tracker data set: ten open tickets and two closed ones. */
export const FAKE_TICKETS: WorkItemView_Serialize[] = [
	ticket(1, "Fix login redirect", "To Do", "todo", "Ada Lovelace", ["bug", "shipyard"]),
	ticket(2, "Add export endpoint", "To Do", "todo", "Ada Lovelace", ["shipyard"]),
	ticket(3, "Bump dependencies", "To Do", "todo", null, []),
	ticket(4, "Write the onboarding guide", "To Do", "todo", "Grace Hopper", ["docs"]),
	ticket(5, "Rework the settings page", "In Progress", "in-progress", "Grace Hopper", ["ui"]),
	ticket(6, "Cache the project list", "In Progress", "in-progress", "Ada Lovelace", ["perf"]),
	ticket(7, "Audit the keychain use", "In Review", "in-progress", null, ["security"]),
	ticket(8, "Rename the Work tab", "To Do", "todo", null, ["ui"]),
	ticket(9, "Fix the French menu", "To Do", "todo", "Grace Hopper", ["bug"]),
	ticket(10, "Add the health dot", "To Do", "todo", "Ada Lovelace", ["ui"]),
	ticket(11, "Ship 0.1.0", "Done", "done", "Ada Lovelace", []),
	ticket(12, "Pick a logo", "Done", "done", "Grace Hopper", []),
];

export const defaultAutomation = (): Automation_Serialize => ({
	interval: 60,
	pickup: { label: "shipyard", statuses: [] },
	concurrency: { global: 2 },
	status_map: {},
	writes: { push: false, pull_request: false, tracker_transition: false, tracker_comment: false },
});

export const seedSync = (): MockSync => ({
	mirror: [],
	automation: defaultAutomation(),
	file: "missing",
	ticks: 0,
	lastOk: {},
	failures: {},
	pending: null,
	claimed: [],
});

const open = () => FAKE_TICKETS.filter((t) => t.category !== "done");

const put = (sync: MockSync, tickets: WorkItemView_Serialize[]) => {
	for (const t of tickets) {
		const at = sync.mirror.findIndex((m) => m.key === t.key);
		const row = { ...t, linked: sync.mirror[at]?.linked ?? null };
		if (at < 0) sync.mirror.push(row);
		else sync.mirror[at] = row;
	}
};

export function syncState(sync: MockSync, sources: string[]): SyncConnection_Serialize[] {
	return sources.map((id) => {
		const error = sync.failures[id] ?? null;
		return {
			id,
			status: error ? "failed" : "idle",
			lastOk: sync.lastOk[id] ?? null,
			failures: error ? 1 : 0,
			error,
		};
	});
}

/** One tick. A source without a secret fails and keeps its mirror (REQ-014). */
export function syncNow(
	sync: MockSync,
	sources: string[],
	secrets: Record<string, string>,
): SyncReport {
	const report: SyncReport = {
		polled: [],
		failed: [],
		changed: 0,
		started: [],
		stopped: 0,
		errors: [],
	};
	for (const [i, id] of sources.entries()) {
		if (!secrets[id]) {
			sync.failures[id] = "no secret saved";
			report.failed.push({ connection: id, message: "no secret saved" });
			continue;
		}
		delete sync.failures[id];
		sync.lastOk[id] = Math.floor(Date.now() / 1000);
		report.polled.push(id);
		// The first source is the tracker. The forge has no mock pull requests.
		if (i === 0) {
			const before = sync.mirror.length;
			put(sync, open());
			report.changed = sync.mirror.length - before;
		}
	}
	sync.ticks += 1;
	return report;
}

export function automationGet(sync: MockSync): AutomationView_Serialize {
	return { automation: sync.automation, file: sync.file, issues: [] };
}

export function automationSave(sync: MockSync, a: Automation_Serialize) {
	if ((a.interval ?? 60) < 30) throw `invalid automation file: interval = ${a.interval}`;
	sync.automation = { ...defaultAutomation(), ...a };
	sync.file = "valid";
}

const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase());
const set = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export function syncItems(sync: MockSync, f: ItemFilter_Deserialize): WorkItemView_Serialize[] {
	const [text, status, assignee, label] = [f.text, f.status, f.assignee, f.label].map(set);
	return sync.mirror
		.filter(
			(t) =>
				(!text || has(t.key, text) || has(t.title, text)) &&
				(!status || t.status.toLowerCase() === status.toLowerCase()) &&
				(!assignee || t.assignee?.toLowerCase() === assignee.toLowerCase()) &&
				(!label || t.labels.some((l) => l.toLowerCase() === label.toLowerCase())),
		)
		.map((t) => ({ ...t, claimed: sync.claimed.includes(t.key) }))
		.sort((a, b) => b.updated.localeCompare(a.updated) || a.key.localeCompare(b.key));
}

/** The count to show before the write. Nothing enters the mirror. */
export function importPlan(sync: MockSync): number {
	sync.pending = open().length;
	return sync.pending;
}

export function importConfirm(sync: MockSync): number {
	if (sync.pending === null) throw "no import is planned: read the backlog first";
	sync.pending = null;
	put(sync, open());
	return open().length;
}

export function adopt(sync: MockSync, key: string): WorkItemView_Serialize {
	const k = key.trim();
	if (!k) throw "the key is empty";
	const t = FAKE_TICKETS.find((x) => x.key.toLowerCase() === k.toLowerCase());
	if (!t) throw `not found: ${k}`;
	put(sync, [t]);
	return t;
}

export function link(sync: MockSync, local: string, key: string) {
	const [l, k] = [local.trim(), key.trim()];
	if (!k) throw "the key is empty";
	if (!parseRef(l)) throw `not a ref: ${l}`;
	if (!sync.mirror.some((t) => t.key === k)) adopt(sync, k);
	// One local item holds one ticket, and one ticket has one local item.
	for (const t of sync.mirror) if (t.linked === l || t.key === k) t.linked = null;
	const row = sync.mirror.find((t) => t.key === k);
	if (row) row.linked = l;
}

export function unlink(sync: MockSync, local: string): boolean {
	const row = sync.mirror.find((t) => t.linked === local.trim());
	if (!row) return false;
	row.linked = null;
	return true;
}

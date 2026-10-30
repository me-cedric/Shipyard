// The mock of the Work commands (`crates/shipyard-app/src/work.rs`). It applies the rules of the
// Rust commands on seeded data: a team of five, two estimate sheets, a plan, time entries and the
// worklogs of a fake tracker. A write to the tracker needs `click`, a computed total is never
// stored, a sealed project hides its numbers until the passphrase opens it, and an Excel import
// replaces a sheet only after the confirm. The totals and the plan use the same maths as
// `crates/shipyard-core/src/work.rs`, in a short form.
import type {
	ApplyRow_Serialize,
	Availability_Deserialize,
	Availability_Serialize,
	Bar_Serialize,
	Calendar_Deserialize,
	Calendar_Serialize,
	Decisions_Deserialize,
	Decisions_Serialize,
	DiffRow_Serialize,
	Feature_Deserialize,
	Feature_Serialize,
	Field,
	Member_Deserialize,
	Member_Serialize,
	MonthSpend,
	PlanView_Serialize,
	Portfolio,
	Preview_Serialize,
	Reason,
	Row_Deserialize,
	Row_Serialize,
	SealState,
	Sheet_Deserialize,
	Sheet_Serialize,
	SheetItem_Serialize,
	SheetView_Serialize,
	Suggestion,
	Task_Deserialize,
	Task_Serialize,
	Team_Deserialize,
	Team_Serialize,
	TeamView_Serialize,
	TicketComment,
	TimeEntry_Serialize,
	TimeRow_Serialize,
	TimeSent_Serialize,
	TimeView_Serialize,
	Totals,
	TrackerLog,
	WorkContext_Serialize,
	WorkItemView_Serialize,
} from "./bindings";
import { parseRef } from "./mock-refs";

const LOCKED = "sealed: this machine has no passphrase";
const NO_PASS = "that passphrase does not open the sealed text";
const MINUTES_PER_DAY = 480;
const HORIZON = 1100;

export type MockWork = {
	team: Team_Serialize;
	sheets: Record<string, Sheet_Serialize>;
	decisions: Decisions_Serialize;
	calendar: Calendar_Serialize;
	/** The time files of each member: one list for each handle. */
	time: Record<string, TimeEntry_Serialize[]>;
	/** The worklogs that the fake tracker holds, by ticket key. */
	logs: Record<string, TrackerLog[]>;
	/** The passphrase of the seal. `null` when nothing is sealed. */
	sealed: string | null;
	unlocked: boolean;
	/** The Excel preview that waits for the confirm. */
	pending: Preview_Serialize | null;
	/** The tickets that an apply wrote, by row ref. */
	written: Record<string, { key: string; row: Row_Serialize }>;
	/** Row refs whose write fails, so a test sees a partial result. */
	failRows: string[];
	/** The next worklog send reaches the tracker and loses its answer. */
	loseNextAnswer: boolean;
	/** The comments that the fake tracker holds, by ticket key. */
	comments: Record<string, TicketComment[]>;
	/** The workbooks that an export wrote: the mock keeps the sheet that was exported. */
	exports: { slug: string; path: string }[];
	/** The member of this machine. `null` makes a time entry refuse. */
	me: string | null;
	today: string;
	counter: number;
};

// ---------------------------------------------------------------- seed

const member = (
	name: string,
	handle: string,
	role: string,
	skills: string[],
	dayRate: number,
	capacity = 5,
	availability: Availability_Serialize = { absences: [] },
): Member_Serialize => ({
	name,
	handle,
	trackers: [handle, `${handle}@acme.test`],
	role,
	capacity,
	skills,
	dayRate,
	availability,
});

/** The names match the assignees of the fake tracker (`mock-sync.ts`). */
const seedTeam = (): Team_Serialize => ({
	members: [
		member("Ada Lovelace", "ada", "dev", ["api", "rust"], 520),
		member("Grace Hopper", "grace", "dev", ["api", "web", "ui"], 500, 4),
		member("Alan Turing", "alan", "qa", ["test", "security"], 420),
		member("Margaret Hamilton", "margaret", "lead", ["api", "plan"], 700, 3, {
			absences: [{ from: "2026-11-16", to: "2026-11-20" }],
		}),
		member("Edsger Dijkstra", "edsger", "design", ["ui", "docs"], 450, 5),
	],
});

const task = (
	id: string,
	name: string,
	role: string,
	t: { days?: number; percent?: number; other?: boolean; ticket?: string } = {},
): Task_Serialize => ({
	id,
	name,
	description: "",
	role,
	...(t.days !== undefined ? { days: t.days } : {}),
	...(t.percent !== undefined ? { percent: t.percent } : {}),
	...(t.other ? { other: true } : {}),
	...(t.ticket ? { ticket: t.ticket } : {}),
	note: "",
});

const seedSheets = (): Record<string, Sheet_Serialize> => ({
	"mvp-1": {
		name: "MVP 1",
		currency: "EUR",
		marginRate: 0.15,
		features: [
			{
				id: "auth",
				name: "Authentication",
				description: "Sign in and sign out",
				tasks: [
					task("auth-design", "Login screens", "design", { days: 3 }),
					task("auth-api", "Token API", "dev", { days: 5, ticket: "ACME-2" }),
					task("auth-web", "Login form", "dev", { days: 4, ticket: "ACME-1" }),
					task("auth-test", "Test pass", "qa", { percent: 25 }),
				],
			},
			{
				id: "export",
				name: "Export",
				description: "Export the backlog",
				tasks: [
					task("export-api", "Export endpoint", "dev", { days: 6 }),
					task("export-lead", "Review", "lead", { days: 1, other: true }),
				],
			},
		],
	},
	"mvp-2": {
		name: "MVP 2",
		currency: "EUR",
		marginRate: 0.1,
		features: [
			{
				id: "reports",
				name: "Reports",
				description: "",
				tasks: [
					task("reports-ui", "Report page", "design", { days: 4 }),
					task("reports-api", "Report API", "dev", { days: 8 }),
					task("reports-test", "Test pass", "qa", { percent: 20 }),
				],
			},
		],
	},
});

const seedTime = (): Record<string, TimeEntry_Serialize[]> => ({
	ada: [
		{
			id: "t1",
			day: "2026-11-02",
			minutes: 240,
			note: "Token API",
			ticket: "ACME-2",
			worklog: "wl-1",
		},
		{ id: "t2", day: "2026-11-03", minutes: 180, note: "Review of the login", ticket: "ACME-1" },
		{ id: "t3", day: "2026-11-03", minutes: 60, note: "Stand-up and planning" },
	],
	grace: [{ id: "t4", day: "2026-11-02", minutes: 300, note: "Settings page", ticket: "ACME-5" }],
});

const seedLogs = (): Record<string, TrackerLog[]> => ({
	"ACME-2": [{ id: "wl-1", minutes: 240, note: "Token API\n\nshipyard log=t1" }],
	// A worklog that a person typed in the tracker: it has no local entry.
	"ACME-1": [{ id: "wl-9", minutes: 45, note: "pairing" }],
});

export const seedWork = (): MockWork => ({
	team: seedTeam(),
	sheets: seedSheets(),
	decisions: {
		order: ["est:mvp-1#auth-api", "est:mvp-1#auth-web"],
		tasks: { "est:mvp-1#auth-web": { member: "grace", start: "2026-11-09" } },
	},
	calendar: { workingDays: [1, 2, 3, 4, 5], holidays: ["2026-11-11"] },
	time: seedTime(),
	logs: seedLogs(),
	sealed: null,
	unlocked: false,
	pending: null,
	written: {},
	failRows: [],
	loseNextAnswer: false,
	comments: {
		"ACME-1": [
			{
				id: "1",
				author: "Grace Hopper",
				body: "Seen on staging.",
				created: "2026-10-28T10:00:00Z",
			},
		],
	},
	exports: [],
	me: "ada",
	today: "2026-11-02",
	counter: 10,
});

/** No team, no sheet, no entry: the empty states of the views. */
export const emptyWork = (): MockWork => ({
	...seedWork(),
	team: { members: [] },
	sheets: {},
	decisions: { order: [], tasks: {} },
	calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [] },
	time: {},
	logs: {},
	me: null,
});

// ---------------------------------------------------------------- the seal

const isLocked = (w: MockWork) => w.sealed !== null && !w.unlocked;

export const sealState = (w: MockWork): SealState => ({
	sealed: w.sealed !== null,
	unlocked: w.unlocked,
});

function checkPass(w: MockWork, pass: string) {
	if (w.sealed !== null && w.sealed !== pass) throw NO_PASS;
}

export function sealUnlock(w: MockWork, pass: string): SealState {
	if (w.sealed === null) throw "nothing is sealed";
	checkPass(w, pass);
	w.unlocked = true;
	return sealState(w);
}

export function sealLock(w: MockWork): SealState {
	w.unlocked = false;
	return sealState(w);
}

export function sealAll(w: MockWork, pass: string): SealState {
	if (!pass.trim()) throw "the passphrase is empty";
	checkPass(w, pass);
	w.sealed = pass;
	w.unlocked = true;
	return sealState(w);
}

export function unsealAll(w: MockWork, pass: string): SealState {
	if (w.sealed === null) throw "nothing is sealed";
	checkPass(w, pass);
	w.sealed = null;
	w.unlocked = false;
	return sealState(w);
}

/** A write while the project is sealed and locked would drop the sealed values. */
function writable(w: MockWork) {
	if (isLocked(w)) throw LOCKED;
}

// ---------------------------------------------------------------- the maths

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const roundToHour = (days: number) => Math.round(days * 8) / 8;

const sheetTasks = (s: Sheet_Serialize) =>
	s.features.flatMap((f) => f.tasks.map((t) => ({ f, t })));
const buildDays = (s: Sheet_Serialize) =>
	sheetTasks(s)
		.filter(({ t }) => !t.other && t.days != null)
		.reduce((n, { t }) => n + (t.days ?? 0), 0);
const taskDays = (t: Task_Serialize, build: number) =>
	t.days ?? (t.percent != null ? roundToHour((build * t.percent) / 100) : 0);

/** The mean day rate of the members of a role (Q-060, option 1). */
function roleRates(team: Team_Serialize): Map<string, number> {
	const sums = new Map<string, [number, number]>();
	for (const m of team.members) {
		if (m.dayRate == null) continue;
		const e = sums.get(m.role.toLowerCase()) ?? [0, 0];
		sums.set(m.role.toLowerCase(), [e[0] + m.dayRate, e[1] + 1]);
	}
	return new Map([...sums].map(([k, [s, n]]) => [k, s / n]));
}

function totals(s: Sheet_Serialize, rates: Map<string, number>): Totals {
	const build = buildDays(s);
	const out = { days: 0, cost: 0, price: 0, margin: 0, unrated: new Set<string>() };
	for (const { t } of sheetTasks(s)) {
		const days = taskDays(t, build);
		out.days += days;
		const rate = rates.get(t.role.toLowerCase());
		if (rate !== undefined) out.cost += days * rate;
		else if (days > 0) out.unrated.add(t.role);
	}
	const price = out.cost * (1 + (s.marginRate ?? 0));
	return {
		days: round(out.days),
		cost: round(out.cost),
		price: round(price),
		margin: round(price - out.cost),
		unrated: [...out.unrated].sort(),
	};
}

// ---- dates. A day is a number of days since 1970-01-01.

const parseDay = (s: string): number | null => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
	const t = Date.parse(`${s}T00:00:00Z`);
	return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s ? null : t / 86_400_000;
};
const iso = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);
/** 0 is Monday. */
const weekday = (day: number) => (day + 3) % 7;

const works = (cal: Calendar_Serialize, day: number) =>
	cal.workingDays.includes(weekday(day) + 1) && !cal.holidays.some((h) => parseDay(h) === day);

function nextWorking(cal: Calendar_Serialize, from: number) {
	let day = from;
	for (let i = 0; i < HORIZON && !works(cal, day); i++) day++;
	return day;
}

function dayCapacity(m: Member_Serialize, cal: Calendar_Serialize, day: number) {
	const a = m.availability;
	const from = a.from ? parseDay(a.from) : null;
	const until = a.until ? parseDay(a.until) : null;
	const away = a.absences.some((s) => {
		const [f, t] = [parseDay(s.from), parseDay(s.to)];
		return f !== null && t !== null && day >= f && day <= t;
	});
	if ((from !== null && day < from) || (until !== null && day > until) || away) return 0;
	if (!works(cal, day) || cal.workingDays.length === 0) return 0;
	return Math.min((m.capacity ?? 0) / cal.workingDays.length, 1);
}

type Spend = [day: number, days: number][];

function place(
	m: Member_Serialize,
	cal: Calendar_Serialize,
	used: Map<string, number>,
	idx: number,
	from: number,
	days: number,
): Spend | null {
	let left = days;
	const spend: Spend = [];
	for (let day = from; day < from + HORIZON; day++) {
		const free = dayCapacity(m, cal, day) - (used.get(`${idx}:${day}`) ?? 0);
		if (free > 1e-9) {
			const take = Math.min(free, left);
			spend.push([day, take]);
			left -= take;
			if (left <= 1e-9) return spend;
		}
	}
	return null;
}

function unstaffed(cal: Calendar_Serialize, start: number, days: number): Spend {
	const out: Spend = [];
	let left = days;
	let day = start;
	while (left > 1e-9) {
		day = nextWorking(cal, day);
		const take = Math.min(left, 1);
		out.push([day, take]);
		left -= take;
		day++;
	}
	return out;
}

/** Schedule one sheet over the team, the calendar and the decisions. Returns the bars and the days used. */
function schedule(w: MockWork, slug: string, s: Sheet_Serialize) {
	const rates = roleRates(w.team);
	const build = buildDays(s);
	const first = nextWorking(w.calendar, parseDay(w.today) ?? 0);
	const ref = (id: string) => `est:${slug}#${id}`;
	const rank = (id: string) => {
		const i = w.decisions.order.indexOf(ref(id));
		return i < 0 ? Number.POSITIVE_INFINITY : i;
	};
	const tasks = sheetTasks(s)
		.map((x, i) => ({ ...x, i }))
		.sort((a, b) => rank(a.t.id) - rank(b.t.id) || a.i - b.i);
	const used = new Map<string, number>();
	const bars = new Map<string, Bar_Serialize>();
	for (const { f, t } of tasks) {
		const days = taskDays(t, build);
		const decision = w.decisions.tasks[ref(t.id)];
		const start = decision?.start
			? nextWorking(w.calendar, parseDay(decision.start) ?? first)
			: first;
		const chosen = decision?.member;
		let best: { i: number; spend: Spend } | null = null;
		const end = (sp: Spend) => sp[sp.length - 1]?.[0] ?? start;
		for (const [i, m] of w.team.members.entries()) {
			const fits = chosen
				? m.handle.toLowerCase() === chosen.toLowerCase()
				: m.role.toLowerCase() === t.role.toLowerCase();
			if (!fits) continue;
			const spend = place(m, w.calendar, used, i, start, days);
			if (!spend) continue;
			const better =
				!best ||
				end(spend) < end(best.spend) ||
				(end(spend) === end(best.spend) && m.handle < (w.team.members[best.i]?.handle ?? ""));
			if (better) best = { i, spend };
		}
		let spend: Spend;
		let handle: string | null = null;
		if (best) {
			spend = best.spend;
			handle = w.team.members[best.i]?.handle ?? null;
			for (const [day, take] of spend) {
				const k = `${best.i}:${day}`;
				used.set(k, (used.get(k) ?? 0) + take);
			}
		} else spend = unstaffed(w.calendar, start, days);
		const rate = rates.get(t.role.toLowerCase()) ?? 0;
		const months = new Map<string, number>();
		for (const [day, take] of spend) {
			const m = iso(day).slice(0, 7);
			months.set(m, (months.get(m) ?? 0) + take);
		}
		bars.set(t.id, {
			task: ref(t.id),
			feature: f.name,
			name: t.name,
			role: t.role,
			member: handle,
			start: iso(spend[0]?.[0] ?? start),
			end: iso(end(spend)),
			days,
			months: [...months].map(([month, d]) => ({ month, days: round(d), cost: round(d * rate) })),
		});
	}
	return {
		bars: sheetTasks(s)
			.map(({ t }) => bars.get(t.id))
			.filter((b): b is Bar_Serialize => b !== undefined),
		used,
	};
}

function spreadOf(bars: Bar_Serialize[]): MonthSpend[] {
	const by = new Map<string, [number, number]>();
	for (const m of bars.flatMap((b) => b.months)) {
		const e = by.get(m.month) ?? [0, 0];
		by.set(m.month, [e[0] + (m.days ?? 0), e[1] + (m.cost ?? 0)]);
	}
	return [...by]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([month, [days, cost]]) => ({ month, days: round(days), cost: round(cost) }));
}

// ---------------------------------------------------------------- normalizers

const normAvailability = (a?: Availability_Deserialize): Availability_Serialize => ({
	...(a?.from ? { from: a.from } : {}),
	...(a?.until ? { until: a.until } : {}),
	absences: (a?.absences ?? []).map((s) => ({ from: s.from ?? "", to: s.to ?? "" })),
});

const normMember = (m: Member_Deserialize): Member_Serialize => ({
	name: m.name ?? "",
	handle: m.handle ?? "",
	trackers: m.trackers ?? [],
	role: m.role ?? "",
	capacity: m.capacity ?? 0,
	skills: m.skills ?? [],
	...(m.dayRate != null ? { dayRate: m.dayRate } : {}),
	availability: normAvailability(m.availability),
});

const normTask = (t: Task_Deserialize): Task_Serialize => ({
	id: t.id ?? "",
	name: t.name ?? "",
	description: t.description ?? "",
	role: t.role ?? "",
	...(t.days != null ? { days: t.days } : {}),
	...(t.percent != null ? { percent: t.percent } : {}),
	...(t.other ? { other: true } : {}),
	...(t.ticket ? { ticket: t.ticket } : {}),
	note: t.note ?? "",
});

const normFeature = (f: Feature_Deserialize): Feature_Serialize => ({
	id: f.id ?? "",
	name: f.name ?? "",
	description: f.description ?? "",
	tasks: (f.tasks ?? []).map(normTask),
});

const normSheet = (s: Sheet_Deserialize): Sheet_Serialize => ({
	name: s.name ?? "",
	currency: s.currency ?? "",
	marginRate: s.marginRate ?? 0,
	features: (s.features ?? []).map(normFeature),
});

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const ROW_ID = /^[a-z0-9][a-z0-9-]*$/;

function checkSheet(s: Sheet_Serialize) {
	if (!((s.marginRate ?? 0) >= 0 && (s.marginRate ?? 0) < 1000))
		throw "the margin rate is not a number";
	const ids = new Set<string>();
	for (const f of s.features) {
		for (const id of [f.id, ...f.tasks.map((t) => t.id)]) {
			if (!ROW_ID.test(id))
				throw `\`${id}\` is not a row id: use lower case letters, digits and \`-\``;
			if (ids.has(id)) throw `duplicate row id \`${id}\``;
			ids.add(id);
		}
		for (const t of f.tasks)
			if ((t.days != null) === (t.percent != null))
				throw `task \`${t.id}\` needs days or percent, not both`;
	}
}

// ---------------------------------------------------------------- the commands

export type Mirror = WorkItemView_Serialize[];

export function workContext(
	w: MockWork,
	tracker: string | null,
	scope: string | null,
	label: string | null,
): WorkContext_Serialize {
	return {
		tracker,
		capabilities: tracker
			? {
					hierarchy: true,
					transitions: true,
					labels: true,
					comments: true,
					timeTracking: true,
					assignee: true,
				}
			: null,
		scope,
		pickupLabel: label,
		me: w.me && w.team.members.some((m) => m.handle === w.me) ? w.me : null,
		today: w.today,
	};
}

export function teamGet(w: MockWork): TeamView_Serialize {
	const locked = isLocked(w);
	return {
		team: {
			members: w.team.members.map(({ dayRate, ...m }) => (locked ? m : { ...m, dayRate })),
		},
		locked,
		error: null,
	};
}

export function teamSave(w: MockWork, t: Team_Deserialize): TeamView_Serialize {
	writable(w);
	const team = { members: (t.members ?? []).map(normMember) };
	const seen = new Map<string, number>();
	for (const [i, m] of team.members.entries()) {
		if (!/^[a-z0-9][a-z0-9-]*$/.test(m.handle)) throw `\`${m.handle}\` is not a handle`;
		for (const id of [m.handle, ...m.trackers]) {
			const key = id.toLowerCase();
			const other = seen.get(key);
			if (other !== undefined && other !== i)
				throw `\`${id}\` is shared by ${team.members[other]?.handle} and ${m.handle}`;
			seen.set(key, i);
		}
		if (!((m.capacity ?? 0) >= 0 && (m.capacity ?? 0) <= 7))
			throw `the capacity of ${m.handle} is from 0 to 7 days a week`;
	}
	w.team = team;
	return teamGet(w);
}

/** The skills of an item: its labels, without the pickup label and the refs. */
const skillsOf = (t: WorkItemView_Serialize, label: string | null) =>
	t.labels.filter((l) => l !== label && !parseRef(l));

export function workSuggest(
	w: MockWork,
	mirror: Mirror,
	label: string | null,
	key: string,
): Suggestion[] {
	const item = mirror.find((t) => t.key === key);
	if (!item) throw `not in the mirror: ${key}`;
	const from = parseDay(w.today) ?? 0;
	const booked = new Map<string, number>();
	for (const [slug, sheet] of Object.entries(w.sheets)) {
		for (const [k, days] of schedule(w, slug, sheet).used) {
			const [idx, day] = k.split(":").map(Number) as [number, number];
			const handle = w.team.members[idx]?.handle;
			if (handle && day >= from && day < from + 7)
				booked.set(handle, (booked.get(handle) ?? 0) + days);
		}
	}
	const skills = skillsOf(item, label);
	return w.team.members
		.map((m) => {
			const reasons: Reason[] = [];
			let hits = 0;
			for (const skill of skills) {
				if (m.skills.some((k) => k.toLowerCase() === skill.toLowerCase())) {
					hits++;
					reasons.push({ kind: "skill", skill });
				} else reasons.push({ kind: "missing-skill", skill });
			}
			const free = (m.capacity ?? 0) - (booked.get(m.handle) ?? 0);
			reasons.push(free > 0 ? { kind: "free-days", days: free } : { kind: "full" });
			return { handle: m.handle, score: hits * 10 + Math.max(free, 0), reasons };
		})
		.sort((a, b) => b.score - a.score || a.handle.localeCompare(b.handle));
}

function needClick(click: boolean) {
	if (!click) throw "this change needs the click of a person";
}

const STATUSES: Record<string, "todo" | "in-progress" | "done"> = {
	"to do": "todo",
	"in progress": "in-progress",
	"in review": "in-progress",
	done: "done",
};

export function workAssign(
	w: MockWork,
	mirror: Mirror,
	key: string,
	handle: string,
	click: boolean,
) {
	needClick(click);
	const m = w.team.members.find(
		(x) => x.handle === handle || x.trackers.some((t) => t.toLowerCase() === handle.toLowerCase()),
	);
	if (!m) throw `unknown member \`${handle}\``;
	if (m.trackers.length === 0) throw `${m.name} has no tracker account in team.yaml`;
	const item = mirror.find((t) => t.key === key);
	if (!item) throw `not found: ${key}`;
	item.assignee = m.name;
}

export function workMark(mirror: Mirror, label: string | null, key: string, click: boolean) {
	needClick(click);
	if (!label) throw "the pickup label is off in automation.yaml";
	const item = mirror.find((t) => t.key === key);
	if (!item) throw `not found: ${key}`;
	if (!item.labels.includes(label)) item.labels.push(label);
}

export function workTransition(mirror: Mirror, key: string, to: string, click: boolean) {
	needClick(click);
	const item = mirror.find((t) => t.key === key);
	if (!item) throw `not found: ${key}`;
	const category = STATUSES[to.toLowerCase()];
	if (!category)
		throw `the tracker refused the change: no transition to \`${to}\` (To Do, In Progress, In Review, Done)`;
	item.status = Object.keys(STATUSES)
		.map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()))
		.find((s) => s.toLowerCase() === to.toLowerCase()) as string;
	item.category = category;
}

// ---- ticket thread

export function ticketComments(w: MockWork, key: string): TicketComment[] {
	return w.comments[key] ?? [];
}

export function ticketCommentAdd(w: MockWork, key: string, body: string, click: boolean) {
	needClick(click);
	if (!body.trim()) throw "the comment is empty";
	const list = w.comments[key] ?? [];
	list.push({
		id: String(list.length + 1),
		author: "Ana Mendes",
		body: body.trim(),
		created: "2026-10-30T09:00:00Z",
	});
	w.comments[key] = list;
}

export function ticketEdit(
	mirror: Mirror,
	key: string,
	title: string | null,
	click: boolean,
): string[] {
	needClick(click);
	if (title !== null && !title.trim()) throw "the title is empty";
	const item = mirror.find((t) => t.key === key);
	if (!item) throw `not found: ${key}`;
	if (title !== null) item.title = title.trim();
	return [];
}

export function ticketLabelAdd(mirror: Mirror, key: string, label: string, click: boolean) {
	needClick(click);
	const one = label.trim();
	if (!one || /\s/.test(one)) throw "a label is one word";
	const item = mirror.find((t) => t.key === key);
	if (!item) throw `not found: ${key}`;
	if (!item.labels.includes(one)) item.labels.push(one);
}

export const PRIORITIES = ["highest", "high", "medium", "low", "lowest"];

export function ticketLabelRemove(mirror: Mirror, key: string, label: string, click: boolean) {
	needClick(click);
	const one = label.trim();
	if (!one || /\s/.test(one)) throw "a label is one word";
	const item = mirror.find((t) => t.key === key);
	if (!item) throw `not found: ${key}`;
	item.labels = item.labels.filter((l) => l !== one);
}

/** The mock has no priority field to keep: it checks the value and the click, as the real command does. */
export function ticketPrioritySet(mirror: Mirror, key: string, priority: string, click: boolean) {
	needClick(click);
	if (!mirror.some((t) => t.key === key)) throw `not found: ${key}`;
	if (!PRIORITIES.includes(priority.toLowerCase())) throw `\`${priority}\` is not a priority`;
}

/** The mock keeps no type or due day: it checks the click and the value, as the real command does. */
export function ticketTypeSet(mirror: Mirror, key: string, name: string, click: boolean) {
	needClick(click);
	if (!mirror.some((t) => t.key === key)) throw `not found: ${key}`;
	if (!name.trim()) throw "the issue type is a name of 60 characters or fewer";
}

export function ticketDueSet(mirror: Mirror, key: string, day: string | null, click: boolean) {
	needClick(click);
	if (!mirror.some((t) => t.key === key)) throw `not found: ${key}`;
	if (day?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(day.trim()))
		throw "the due date is a day as YYYY-MM-DD";
}

// ---- estimates

function readSheet(w: MockWork, slug: string): Sheet_Serialize {
	const s = w.sheets[slug];
	if (!s) throw `no sheet \`${slug}\``;
	if (isLocked(w)) throw LOCKED;
	return s;
}

export function estimateList(w: MockWork): SheetItem_Serialize[] {
	const rates = roleRates(w.team);
	return Object.entries(w.sheets)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([slug, s]) =>
			isLocked(w)
				? { slug, name: null, state: "locked", error: null, totals: null }
				: { slug, name: s.name, state: "ready", error: null, totals: totals(s, rates) },
		);
}

export function estimateGet(w: MockWork, mirror: Mirror, slug: string): SheetView_Serialize {
	const sheet = readSheet(w, slug);
	const build = buildDays(sheet);
	const days: Record<string, number> = {};
	for (const { t } of sheetTasks(sheet)) days[t.id] = taskDays(t, build);
	return {
		slug,
		sheet,
		totals: totals(sheet, roleRates(w.team)),
		days,
		spread: spreadOf(schedule(w, slug, sheet).bars),
		tickets: sheetTasks(sheet).flatMap(({ t }) => {
			const item = t.ticket ? mirror.find((i) => i.key === t.ticket) : undefined;
			return item && t.ticket
				? [
						{
							task: t.id,
							key: t.ticket,
							title: item.title,
							estimateMinutes: ESTIMATES[t.ticket] ?? null,
						},
					]
				: [];
		}),
	};
}

/** The original estimates of the fake tracker, in minutes. */
const ESTIMATES: Record<string, number> = {
	"ACME-1": 2 * MINUTES_PER_DAY,
	"ACME-2": 4 * MINUTES_PER_DAY,
};

export function estimateSave(
	w: MockWork,
	mirror: Mirror,
	slug: string,
	sheet: Sheet_Deserialize,
): SheetView_Serialize {
	if (!SLUG.test(slug))
		throw `\`${slug}\` is not a sheet name: use lower case letters, digits and \`-\``;
	writable(w);
	const s = normSheet(sheet);
	checkSheet(s);
	w.sheets[slug] = s;
	return estimateGet(w, mirror, slug);
}

export function estimatePortfolio(w: MockWork): Portfolio {
	const rates = roleRates(w.team);
	const rows = isLocked(w)
		? []
		: Object.entries(w.sheets)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([slug, s]) => [slug, totals(s, rates)] as [string, Totals]);
	const sum = (k: "days" | "cost" | "price" | "margin") =>
		round(rows.reduce((n, [, t]) => n + (t[k] ?? 0), 0));
	return {
		sheets: rows,
		total: {
			days: sum("days"),
			cost: sum("cost"),
			price: sum("price"),
			margin: sum("margin"),
			unrated: [...new Set(rows.flatMap(([, t]) => t.unrated))].sort(),
		},
	};
}

// ---- Excel

function xlsx(path: string) {
	if (!path.startsWith("/")) throw "the path is not absolute";
	if (!path.toLowerCase().endsWith(".xlsx")) throw "the file is not an .xlsx file";
}

/** A workbook with `bad` in its name has one bad row. One with `missing` does not exist. */
export function excelPreview(w: MockWork, path: string, scope: string | null): Preview_Serialize {
	xlsx(path);
	if (path.includes("missing")) throw `${path}: No such file or directory`;
	if (path.includes("junk")) throw "not a readable workbook: invalid Zip archive";
	const sheet: Sheet_Serialize = {
		name: "Imported lot",
		currency: "EUR",
		marginRate: 0.1,
		features: [
			{
				id: "import",
				name: "Imported feature",
				description: "",
				tasks: [
					task("import-a", "Build", "dev", { days: 5 }),
					task("import-b", "Test", "qa", { percent: 20 }),
				],
			},
		],
	};
	const preview: Preview_Serialize = {
		sheet,
		scopes: ["Lot 1"],
		scope: scope ?? "Lot 1",
		refused: path.includes("bad") ? [{ row: 7, reason: "the effort is not a number" }] : [],
	};
	w.pending = preview;
	return preview;
}

export function excelConfirm(
	w: MockWork,
	mirror: Mirror,
	slug: string,
	confirmed: boolean,
): SheetView_Serialize {
	if (!SLUG.test(slug)) throw `\`${slug}\` is not a sheet name`;
	writable(w);
	if (!w.pending) throw "no import is planned: read the workbook first";
	if (!confirmed) throw "the import needs the confirmation of a person";
	w.sheets[slug] = w.pending.sheet;
	w.pending = null;
	return estimateGet(w, mirror, slug);
}

export function excelExport(w: MockWork, slug: string, path: string) {
	xlsx(path);
	readSheet(w, slug);
	w.exports.push({ slug, path });
}

// ---- plan

export function planGet(w: MockWork, slug: string): PlanView_Serialize {
	const sheet = readSheet(w, slug);
	return {
		slug,
		gantt: { bars: schedule(w, slug, sheet).bars },
		decisions: w.decisions,
		calendar: w.calendar,
		today: w.today,
	};
}

export function decisionsSave(w: MockWork, d: Decisions_Deserialize) {
	const taskRef = (r: string) => /^est:[a-z0-9][a-z0-9-]*#[a-z0-9][a-z0-9-]*$/.test(r);
	const order = d.order ?? [];
	const tasks = d.tasks ?? {};
	for (const r of [...order, ...Object.keys(tasks)])
		if (!taskRef(r)) throw `\`${r}\` is not a task ref: use est:<slug>#<row-id>`;
	for (const [r, t] of Object.entries(tasks))
		if (t.start && parseDay(t.start) === null)
			throw `\`${t.start}\` is not a date, in the decision of ${r}`;
	w.decisions = {
		order,
		tasks: Object.fromEntries(
			Object.entries(tasks).map(([r, t]) => [
				r,
				{ ...(t.start ? { start: t.start } : {}), ...(t.member ? { member: t.member } : {}) },
			]),
		),
	};
}

export function calendarSave(w: MockWork, c: Calendar_Deserialize) {
	const workingDays = c.workingDays ?? [1, 2, 3, 4, 5];
	const holidays = c.holidays ?? [];
	if (workingDays.some((d) => d < 1 || d > 7))
		throw "a working day is a number from 1 (Monday) to 7 (Sunday)";
	const bad = holidays.find((h) => parseDay(h) === null);
	if (bad) throw `\`${bad}\` is not a date`;
	w.calendar = { workingDays, holidays };
}

// ---- time

const mark = (id: string) => `shipyard log=${id}`;
const markOf = (note: string) =>
	note
		.split("\n")
		.reverse()
		.map((l) => l.trim())
		.find((l) => l.startsWith("shipyard log="))
		?.slice("shipyard log=".length)
		.trim();

function memberOf(w: MockWork, named: string | null): string {
	const id = named ?? w.me;
	const m = id
		? w.team.members.find(
				(x) => x.handle === id || x.trackers.some((t) => t.toLowerCase() === id.toLowerCase()),
			)
		: undefined;
	if (!m)
		throw "cannot resolve the member: set `user` on the tracker connection to a tracker account of the team, or name the member";
	return m.handle;
}

function reconcile(entries: TimeEntry_Serialize[], logs: TrackerLog[]): TimeRow_Serialize[] {
	const rows: TimeRow_Serialize[] = [];
	const paired = new Set<string>();
	for (const e of entries) {
		const log =
			logs.find((l) => l.id === e.worklog) ?? logs.find((l) => markOf(l.note) === e.id) ?? null;
		if (log) paired.add(log.id);
		rows.push({
			state: log || e.worklog ? "in-tracker" : "to-send",
			entry: e,
			log,
			differs: log !== null && log.minutes !== e.minutes,
			lostReceipt: !e.worklog && log !== null,
		});
	}
	for (const l of logs.filter((x) => !paired.has(x.id)))
		rows.push({
			state: "only-in-tracker",
			entry: null,
			log: l,
			differs: false,
			lostReceipt: false,
		});
	return rows;
}

const byDay = (a: TimeEntry_Serialize, b: TimeEntry_Serialize) =>
	a.day.localeCompare(b.day) || a.id.localeCompare(b.id);

export function timeList(
	w: MockWork,
	member: string | null,
	month: string,
	canSend: boolean,
): TimeView_Serialize {
	if (!/^\d{4}-\d{2}$/.test(month)) throw `\`${month}-01\` is not a date`;
	const handle = memberOf(w, member);
	const entries = (w.time[handle] ?? []).filter((e) => e.day.startsWith(month)).sort(byDay);
	return { member: handle, month, rows: reconcile(entries, []), canSend };
}

export function timeAdd(
	w: MockWork,
	mirror: Mirror,
	member: string | null,
	day: string,
	minutes: number,
	note: string,
	ticket: string | null,
): TimeEntry_Serialize {
	const handle = memberOf(w, member);
	if (minutes <= 0 || minutes > 24 * 60) throw "the duration is from 1 minute to 24 hours";
	if (parseDay(day) === null) throw `\`${day}\` is not a date`;
	const key = ticket?.trim().replace(/^wi:/, "") || undefined;
	if (key && !mirror.some((t) => t.key === key)) throw `not in the mirror: ${key}`;
	const entry: TimeEntry_Serialize = {
		id: `t${++w.counter}`,
		day,
		minutes,
		note: note.trim(),
		...(key ? { ticket: key } : {}),
	};
	w.time[handle] = [...(w.time[handle] ?? []), entry].sort(byDay);
	return entry;
}

export function timeFetch(w: MockWork, member: string | null, ticket: string): TimeRow_Serialize[] {
	const handle = memberOf(w, member);
	const key = ticket.trim().replace(/^wi:/, "");
	const entries = (w.time[handle] ?? []).filter((e) => e.ticket === key).sort(byDay);
	return reconcile(entries, w.logs[key] ?? []);
}

export function timeSend(
	w: MockWork,
	member: string | null,
	day: string,
	id: string,
	offsetMinutes: number,
	_reduceRemaining: boolean,
	click: boolean,
	canSend: boolean,
): TimeSent_Serialize {
	needClick(click);
	if (Math.abs(offsetMinutes) > 14 * 60) throw "the offset is not a time zone offset";
	const handle = memberOf(w, member);
	const entry = (w.time[handle] ?? []).find(
		(e) => e.id === id && e.day.startsWith(day.slice(0, 7)),
	);
	if (!entry) throw `no entry \`${id}\` in docs/time/${handle}/${day.slice(0, 7)}.yaml`;
	if (!canSend) throw "this tracker does not support TimeTracking";
	if (entry.worklog)
		throw "the tracker refused the change: the entry has a receipt: it is in the tracker";
	if (!entry.ticket) throw "setting: the entry names no ticket";
	const logs = w.logs[entry.ticket] ?? [];
	w.logs[entry.ticket] = logs;
	const found = logs.find((l) => markOf(l.note) === entry.id);
	if (found) {
		entry.worklog = found.id;
		return { entry: { ...entry }, alreadyThere: true };
	}
	const log = {
		id: `wl-${++w.counter}`,
		minutes: entry.minutes,
		note: entry.note ? `${entry.note}\n\n${mark(entry.id)}` : mark(entry.id),
	};
	logs.push(log);
	if (w.loseNextAnswer) {
		w.loseNextAnswer = false;
		throw "the answer was lost, the change may be in the tracker: connection reset";
	}
	entry.worklog = log.id;
	return { entry: { ...entry }, alreadyThere: false };
}

// ---- apply

function rowsOf(w: MockWork, slugs: string[]): Row_Serialize[] {
	const out: Row_Serialize[] = [];
	for (const slug of slugs) {
		const sheet = readSheet(w, slug);
		const build = buildDays(sheet);
		for (const f of sheet.features) {
			const epic = `est:${slug}#${f.id}`;
			out.push({
				reference: epic,
				kind: "epic",
				title: f.name,
				description: f.description,
				days: null,
				parent: null,
			});
			for (const t of f.tasks)
				out.push({
					reference: `est:${slug}#${t.id}`,
					kind: "story",
					title: t.name,
					description: t.description,
					days: taskDays(t, build),
					parent: epic,
				});
		}
	}
	return out;
}

function diff(w: MockWork, rows: Row_Serialize[]): DiffRow_Serialize[] {
	return rows.map((row) => {
		const hit = w.written[row.reference];
		if (!hit) return { row, action: "create", key: null, changes: [] };
		const changes: Field[] = [];
		if (hit.row.title !== row.title) changes.push("title");
		if (hit.row.description.trim() !== row.description.trim()) changes.push("description");
		if (row.days !== null && hit.row.days !== row.days) changes.push("estimate");
		if (row.parent !== null && hit.row.parent !== row.parent) changes.push("parent");
		return { row, action: changes.length ? "update" : "unchanged", key: hit.key, changes };
	});
}

export function applyPreview(w: MockWork, slugs: string[]): DiffRow_Serialize[] {
	return diff(w, rowsOf(w, slugs));
}

function write(w: MockWork, rows: DiffRow_Serialize[]): ApplyRow_Serialize[] {
	return rows.map((d) => {
		const base = {
			reference: d.row.reference,
			action: d.action,
			key: d.key,
			error: null,
			skipped: [],
		};
		if (d.action === "unchanged") return base;
		if (w.failRows.includes(d.row.reference))
			return { ...base, error: "the tracker refused the change: 400 summary: bad" };
		const key = d.key ?? `ACME-${100 + ++w.counter}`;
		w.written[d.row.reference] = { key, row: d.row };
		return { ...base, key };
	});
}

export function applyRun(w: MockWork, slugs: string[], click: boolean): ApplyRow_Serialize[] {
	needClick(click);
	return write(w, diff(w, rowsOf(w, slugs)));
}

function checkRow(row: Row_Deserialize): Row_Serialize {
	if (!parseRef(row.reference ?? "")) throw `\`${row.reference}\` is not a ref`;
	if (!(row.title ?? "").trim()) throw "the title is empty";
	return {
		reference: row.reference ?? "",
		kind: row.kind ?? "story",
		title: row.title ?? "",
		description: row.description ?? "",
		days: row.days ?? null,
		parent: row.parent ?? null,
	};
}

export function itemPreview(w: MockWork, row: Row_Deserialize): DiffRow_Serialize {
	return diff(w, [checkRow(row)])[0] as DiffRow_Serialize;
}

export function itemCreate(w: MockWork, row: Row_Deserialize, click: boolean): ApplyRow_Serialize {
	needClick(click);
	return write(w, diff(w, [checkRow(row)]))[0] as ApplyRow_Serialize;
}

// ---------------------------------------------------------------- entities

/** `member:` and `est:` entities, for `refs_resolve`, the backlinks and the search (REQ-027). */
export function workEntities(w: MockWork): { ref: string; title: string; status: string | null }[] {
	const out: { ref: string; title: string; status: string | null }[] = [];
	for (const m of w.team.members)
		out.push({ ref: `member:${m.handle}`, title: m.name, status: m.role });
	for (const [slug, s] of Object.entries(w.sheets)) {
		if (isLocked(w)) {
			out.push({ ref: `est:${slug}`, title: slug, status: "sealed" });
			continue;
		}
		out.push({ ref: `est:${slug}`, title: s.name, status: null });
		for (const f of s.features) {
			out.push({ ref: `est:${slug}#${f.id}`, title: f.name, status: null });
			for (const t of f.tasks)
				out.push({ ref: `est:${slug}#${t.id}`, title: t.name, status: null });
		}
	}
	return out;
}

/** Who cites `target`: the sheets that name a ticket or a member, and the items of a member. */
export function workCitations(w: MockWork, mirror: Mirror): [source: string, target: string][] {
	const out: [string, string][] = [];
	if (!isLocked(w))
		for (const [slug, s] of Object.entries(w.sheets))
			for (const { t } of sheetTasks(s)) if (t.ticket) out.push([`est:${slug}`, `wi:${t.ticket}`]);
	for (const [ref, d] of Object.entries(w.decisions.tasks)) {
		const slug = ref.slice(4, ref.indexOf("#"));
		if (d.member) out.push([`est:${slug}`, `member:${d.member}`]);
	}
	for (const t of mirror) if (t.member) out.push([`wi:${t.key}`, `member:${t.member}`]);
	return out;
}

/** The handle that a tracker assignee name resolves to through the team file. */
export const handleOf = (w: MockWork, assignee: string | null): string | null =>
	assignee
		? (w.team.members.find(
				(m) =>
					m.name === assignee || m.trackers.some((t) => t.toLowerCase() === assignee.toLowerCase()),
			)?.handle ?? null)
		: null;

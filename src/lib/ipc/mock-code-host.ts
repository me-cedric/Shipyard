// The mock of the `code-host-tickets` commands that have no other home: the releases, the types of
// ticket, the join requests of the team and the action plan of an impact report. Each one applies
// the rule of its Rust command: a write needs a click, a release must exist, a new kind needs a
// type in the issue tracker, a plan line is one line.
import type { JoinRequest, PlanLine, TicketsConfig } from "./bindings";
import type { MockPrs } from "./mock-code-prs";
import type { Mirror, MockWork } from "./mock-work";

const CLICK = "this change needs the click of a person";

/** The releases of the fake issue tracker. A release in use on a ticket joins them. */
export const RELEASES = ["MVP 1", "MVP 2"];
/** The types of ticket of the fake issue tracker. */
export const ISSUE_TYPES = ["Epic", "Story", "Task", "Sub-task", "Bug", "Spike"];

export const releases = (mirror: Mirror): string[] =>
	[...new Set([...mirror.flatMap((t) => (t.release ? [t.release] : [])), ...RELEASES])].sort(
		(a, b) => a.localeCompare(b),
	);

export function ticketReleaseSet(
	mirror: Mirror,
	key: string,
	release: string | null,
	click: boolean,
) {
	if (!click) throw CLICK;
	const item = mirror.find((t) => t.key === key);
	if (!item) throw `not found: ${key}`;
	const name = release?.trim() || null;
	if (name && name.length > 120) throw "the release is a name of 120 characters or fewer";
	if (name && !releases(mirror).includes(name)) throw `no release named ${name}`;
	item.release = name;
}

/** A kind that is new needs a type in the issue tracker, a name that no kind has and a parent before it. */
export function checkKinds(saved: TicketsConfig, next: TicketsConfig) {
	const base = [next.epic, next.story, next.task, next.subtask].map((t) => t.trim().toLowerCase());
	const parents = ["epic", "story", "task", "subtask"];
	const seen = [...base];
	const known = (saved.extraKinds ?? []).map((k) => k.name.toLowerCase());
	for (const k of next.extraKinds ?? []) {
		const name = k.name.trim();
		if (!name || name.length > 60) throw "a kind has a name of 60 characters or fewer";
		if (seen.includes(name.toLowerCase())) throw `the kind ${name} exists already`;
		if (!parents.includes(k.parent.trim().toLowerCase()))
			throw `the parent of ${name} is not a kind that comes before it`;
		if (
			!known.includes(name.toLowerCase()) &&
			!ISSUE_TYPES.some((t) => t.toLowerCase() === name.toLowerCase())
		)
			throw `the issue tracker has no type named ${name}`;
		seen.push(name.toLowerCase());
		parents.push(name.toLowerCase());
	}
}

// ---------------------------------------------------------------- join requests

/** No request waits at the start: a test or a click of the code host adds one. */
export const seedJoins = (): JoinRequest[] => [];

/** A join request, as the pull request of a person who asked to join. */
export const joinOf = (number: number, name: string, asked: string): JoinRequest => ({
	number,
	name,
	handle: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
	asked,
	url: `https://github.com/acme/web/pull/${number}`,
});

// ---------------------------------------------------------------- action plan

/** A plan line as the report file holds it. */
export function planLine(l: PlanLine): string {
	const text = l.text.trim();
	const owner = l.owner.trim();
	if (!text) throw "an action needs some text";
	if (/[\r\n]/.test(text) || text.length > 300)
		throw "an action is one line of 300 characters or fewer";
	if (/[\r\n()]/.test(owner) || owner.length > 60) throw "an owner is a name with no bracket";
	return `- [${l.done ? "x" : " "}] ${text}${owner ? ` (owner: ${owner})` : ""}`;
}

export function impactPlanSave(p: MockPrs, path: string, lines: PlanLine[], click: boolean) {
	if (!click) throw CLICK;
	const old = p.texts[path];
	if (old === undefined || !p.impacts.some((e) => e.plan === path))
		throw `${path} is not a saved plan in .shipyard/impacts`;
	if (lines.length > 100) throw "an action plan holds 100 lines at most";
	const rendered = lines.map(planLine);
	const out: string[] = [];
	let skipping = false;
	for (const l of old.split("\n")) {
		if (l.startsWith("## ")) {
			skipping = l.trim() === "## Actions";
			if (skipping) out.push(l, "", ...rendered, "");
		}
		if (!skipping) out.push(l);
	}
	p.texts[path] = `${out.join("\n").replace(/\n+$/, "")}\n`;
	return null;
}

const ROLES = ["po", "pm", "architect", "techlead", "ba", "developer", "qa", "designer", "viewer"];

export const joinRequests = (w: MockWork): JoinRequest[] => w.joins.map((j) => ({ ...j }));

/** Accept sets the role in the team file and merges the pull request: it needs the merge right. */
export function joinAccept(
	w: MockWork,
	number: number,
	role: string,
	click: boolean,
	canMerge: boolean,
) {
	if (!click) throw CLICK;
	if (!canMerge) throw "you need the right to merge";
	if (!ROLES.includes(role)) throw `unknown role \`${role}\``;
	const j = w.joins.find((x) => x.number === number);
	if (!j) throw "this pull request is not a join request";
	if (!w.team.members.some((m) => m.handle === j.handle))
		w.team.members.push({
			name: j.name,
			handle: j.handle,
			trackers: [],
			emails: [],
			role,
			capacity: 5,
			skills: [],
			availability: { absences: [] },
		});
	w.joins = w.joins.filter((x) => x.number !== number);
	return null;
}

/** Refuse closes the pull request. The team file stays as it is. */
export function joinRefuse(w: MockWork, number: number, click: boolean) {
	if (!click) throw CLICK;
	if (!w.joins.some((x) => x.number === number)) throw "this pull request is not a join request";
	w.joins = w.joins.filter((x) => x.number !== number);
	return null;
}

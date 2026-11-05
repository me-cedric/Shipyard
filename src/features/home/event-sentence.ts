import { format, type Messages } from "@/lib/i18n";
import type { Status } from "@/ui/atoms/status-dot";

type Said = Messages["home"]["event"];
type Event = { kind: string; payload: string; key: string };
type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The payload as an object. A payload that does not parse gives an empty object. */
export function payloadOf(payload: string): Obj {
	try {
		return obj(JSON.parse(payload));
	} catch {
		return {};
	}
}

// The engine logs `rejected` and `replayed`; the sentences name them `denied` and `sent`.
const WRITE_STATE: Record<string, keyof Said["writeState"]> = {
	pending: "pending",
	approved: "approved",
	sent: "sent",
	replayed: "sent",
	rejected: "denied",
	denied: "denied",
	failed: "failed",
	sending: "sending",
};

/** The write of an event in words: "Move ACME-1 to In Progress". Empty when the kind is unknown. */
function writeWords(said: Said, w: Obj) {
	const kind = str(w.kind);
	if (!(kind in said.what)) return "";
	return format(said.what[kind as keyof Said["what"]], {
		key: str(w.key),
		status: str(w.status),
		labels: Array.isArray(w.labels) ? w.labels.join(", ") : "",
		branch: str(w.branch),
		title: str(w.title),
	});
}

/** The first text that the payload holds: the agent writes it, so it is the best sentence. */
const textOf = (p: Obj) =>
	str(p.note) || str(p.text) || Object.values(p).find((v) => typeof v === "string") || "";

/** One event as one sentence: a state change names the new state, a write names the change in words. */
export function eventSentence(said: Said, states: Record<string, string>, e: Event) {
	const p = payloadOf(e.payload);
	if (e.kind === "state") {
		const to = str(p.to);
		if (to) return format(said.state, { key: e.key, state: states[to] ?? to });
	} else if (e.kind === "write") {
		const what = writeWords(said, obj(p.write));
		const state = WRITE_STATE[str(p.state)];
		if (what && state) return format(said.writeState[state], { what });
	} else if (e.kind === "tool") {
		const tool = (str(p.tool) || str(p.name)).replaceAll("_", " ");
		if (tool) return format(said.toolNamed, { tool });
	} else if (e.kind === "runner") {
		if (typeof p.cost_usd === "number")
			return format(said.usage, { cost: `$${p.cost_usd.toFixed(2)}` });
		if (str(p.error)) return format(said.error, { text: str(p.error) });
	} else if (e.kind === "note") {
		const text = textOf(p);
		if (text) return text;
	} else if (e.kind === "question") {
		const asked = str(obj(p.question).question);
		if (asked) return format(said.asked, { text: asked });
		if (str(p.text)) return format(said.answered, { text: str(p.text) });
	}
	const kind = e.kind in said && e.kind !== "state" ? (e.kind as keyof Said) : "other";
	const plain = said[kind];
	return format(typeof plain === "string" ? plain : said.other, { key: e.key, state: "" });
}

/** The dot of an event: a shape and a colour, so the kind never relies on colour alone. */
export function eventTone(e: Event): Status {
	const p = payloadOf(e.payload);
	if (e.kind === "state") {
		const to = str(p.to);
		return to === "Failed" ? "danger" : to === "Done" || to === "Merged" ? "success" : "info";
	}
	if (e.kind === "write") {
		const s = WRITE_STATE[str(p.state)];
		return s === "pending"
			? "warning"
			: s === "denied" || s === "failed"
				? "danger"
				: s === "approved" || s === "sent"
					? "success"
					: "info";
	}
	if (e.kind === "runner" && str(p.error)) return "danger";
	if (e.kind === "question") return str(obj(p.question).question) ? "warning" : "success";
	if (e.kind === "pr") return "success";
	return e.kind === "review" ? "info" : "idle";
}

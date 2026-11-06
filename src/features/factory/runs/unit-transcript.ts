import { payloadOf } from "@/features/home/event-sentence";
import type { RunLogEvent_Serialize } from "@/lib/ipc";

export type Item =
	| { type: "text"; id: number; text: string; raw: string[] }
	| {
			type: "tool";
			id: number;
			name: string;
			target: string;
			result?: { ok: boolean; output: string };
			raw: string[];
	  }
	| { type: "error"; id: number; text: string; raw: string[] }
	| { type: "card"; id: number; kind: string; event: RunLogEvent_Serialize };

export type Transcript = { items: Item[]; turns: number; tokens: number };

const CARDS = new Set(["question", "answer", "report", "note"]);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * The events of one unit as a chat: text, tool calls with their results (paired by the id of the call),
 * errors and cards. `turn`, `usage`, `session` and `exit` only feed the counters.
 */
export function transcript(events: RunLogEvent_Serialize[]): Transcript {
	const out: Transcript = { items: [], turns: 0, tokens: 0 };
	const calls = new Map<string, Extract<Item, { type: "tool" }>>();
	for (const e of events) {
		if (CARDS.has(e.kind)) {
			out.items.push({ type: "card", id: e.id, kind: e.kind, event: e });
			continue;
		}
		if (e.kind !== "runner") continue;
		const p = payloadOf(e.payload);
		const kind = str(p.type);
		if (kind === "turn") out.turns += 1;
		else if (kind === "usage")
			out.tokens += Number(p.input_tokens ?? 0) + Number(p.output_tokens ?? 0);
		else if (kind === "text" && str(p.text))
			out.items.push({ type: "text", id: e.id, text: str(p.text), raw: [e.payload] });
		else if (kind === "tool_call") {
			const item: Extract<Item, { type: "tool" }> = {
				type: "tool",
				id: e.id,
				name: str(p.name),
				target: str(p.input),
				raw: [e.payload],
			};
			calls.set(str(p.id), item);
			out.items.push(item);
		} else if (kind === "tool_result") {
			const call = calls.get(str(p.id));
			const result = { ok: p.ok === true, output: str(p.output) };
			if (call) {
				call.result = result;
				call.raw.push(e.payload);
			} else
				out.items.push({ type: "tool", id: e.id, name: "", target: "", result, raw: [e.payload] });
		} else if (str(p.error) || kind === "error")
			out.items.push({
				type: "error",
				id: e.id,
				text: str(p.error) || str(p.message),
				raw: [e.payload],
			});
	}
	return out;
}

/** The tool of a call in one word for its icon: `mcp__server__tool` is `mcp`. */
export function toolKind(name: string): "read" | "edit" | "bash" | "search" | "mcp" | "other" {
	const n = name.toLowerCase();
	if (n.startsWith("mcp__") || n.startsWith("mcp:")) return "mcp";
	if (/^(read|view|cat|ls)/.test(n)) return "read";
	if (/^(edit|write|multiedit|notebookedit|apply_patch|patch)/.test(n)) return "edit";
	if (/^(bash|shell|run|exec|command)/.test(n)) return "bash";
	if (/^(grep|glob|search|find)/.test(n)) return "search";
	return "other";
}

/** The first line of a target: a Bash command can run over many lines. */
export const firstLine = (s: string) => s.split("\n", 1)[0] ?? "";

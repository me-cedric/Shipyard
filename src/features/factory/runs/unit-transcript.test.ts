import type { RunLogEvent_Serialize } from "@/lib/ipc";
import { firstLine, toolKind, transcript } from "./unit-transcript";

let n = 0;
const ev = (kind: string, payload: object): RunLogEvent_Serialize =>
	({
		id: ++n,
		step: "build",
		kind,
		payload: JSON.stringify(payload),
		ts: null,
	}) as RunLogEvent_Serialize;
const run = (p: object) => ev("runner", p);

describe("transcript", () => {
	it("keeps the text of the AI tool", () => {
		const { items } = transcript([run({ type: "text", text: "Hello **you**" })]);
		expect(items).toMatchObject([{ type: "text", text: "Hello **you**" }]);
	});
	it("pairs a result with its call by id, even when calls overlap", () => {
		const { items } = transcript([
			run({ type: "tool_call", id: "a", name: "Read", input: "src/a.ts" }),
			run({ type: "tool_call", id: "b", name: "Bash", input: "ls" }),
			run({ type: "tool_result", id: "b", ok: false, output: "boom" }),
			run({ type: "tool_result", id: "a", ok: true, output: "fine" }),
		]);
		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({ name: "Read", result: { ok: true, output: "fine" } });
		expect(items[1]).toMatchObject({ name: "Bash", result: { ok: false, output: "boom" } });
		expect(items[0]?.type === "tool" && items[0].raw).toHaveLength(2);
	});
	it("shows a call without a result yet and hides turn, usage, session and exit", () => {
		const t = transcript([
			run({ type: "session", id: "s" }),
			run({ type: "turn" }),
			run({ type: "tool_call", id: "a", name: "Grep", input: "foo" }),
			run({ type: "usage", input_tokens: 10, output_tokens: 5, cached_tokens: 0, cost_usd: null }),
			run({ type: "exit", code: 0, cancelled: false }),
		]);
		expect(t.items).toHaveLength(1);
		expect(t.items[0]).not.toHaveProperty("result");
		expect([t.turns, t.tokens]).toEqual([1, 15]);
	});
	it("makes cards of question, report and note, and ignores other kinds", () => {
		const { items } = transcript([
			ev("question", { text: "Which?" }),
			ev("report", { text: "Done" }),
			ev("note", { note: "hm" }),
			ev("state", { to: "x" }),
		]);
		expect(items.map((i) => i.type === "card" && i.kind)).toEqual(["question", "report", "note"]);
	});
});

describe("tool rows", () => {
	it("picks an icon kind", () => {
		expect(["Read", "Edit", "Bash", "Grep", "mcp__shipyard__ask", "Task"].map(toolKind)).toEqual([
			"read",
			"edit",
			"bash",
			"search",
			"mcp",
			"other",
		]);
	});
	it("cuts a command to its first line", () => {
		expect(firstLine("npm test\n&& echo")).toBe("npm test");
	});
});

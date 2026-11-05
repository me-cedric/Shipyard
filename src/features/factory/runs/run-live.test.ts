import { en } from "@/lib/i18n/en";
import type { RunLogEvent_Serialize, RunView } from "@/lib/ipc";
import { stopReason } from "./run-live";

const why = en.factory.why;
const ev = (kind: string, payload: object): RunLogEvent_Serialize =>
	({
		id: 1,
		step: null,
		kind,
		payload: JSON.stringify(payload),
		ts: null,
	}) as RunLogEvent_Serialize;
const run = (state: string) => ({ steps: [{ id: "build", state }] }) as unknown as RunView;

describe("stopReason", () => {
	it("names the turn limit", () => {
		expect(stopReason(why, run("done"), [ev("note", { stop: "max turns (40)" })])).toBe(
			"The run used its 40 turns.",
		);
	});
	it("gives the cause of a block", () => {
		expect(
			stopReason(why, run("done"), [ev("note", { blocked: "the AI tool is missing" })]),
		).toContain("the AI tool is missing");
	});
	it("uses a runner error", () => {
		expect(stopReason(why, run("done"), [ev("runner", { error: "no key" })])).toContain("no key");
	});
	it("falls back to a failed step, then to a plain line", () => {
		expect(stopReason(why, run("failed"), [])).toBe("Step build failed.");
		expect(stopReason(why, run("done"), [])).toBe(why.none);
	});
});

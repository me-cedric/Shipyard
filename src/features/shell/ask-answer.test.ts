import type { FlowFeature_Serialize } from "@/lib/ipc/bindings";
import { type AnswerWords, answerOf } from "./ask-answer";

const words: AnswerWords = { blocked: "block,stuck", stopped: "stop,fail", needs: "need,waiting" };
const feature = (
	title: string,
	mark: FlowFeature_Serialize["mark"],
	run: string | null = null,
	stop: FlowFeature_Serialize["stop"] = null,
): FlowFeature_Serialize => ({
	title,
	stage: "build",
	mark,
	ticket: null,
	change: null,
	run,
	pr: null,
	who: null,
	runState: null,
	approvals: 0,
	questions: 0,
	checks: null,
	stop,
});
const list = [
	feature("Fix the French menu", "blocked", "run:1"),
	feature("Cache the project list", "blocked", "run:2"),
	feature("Draft the plan", "needs_you", "run:3"),
	feature("Retry the sync", "stopped", "run:4"),
	feature("Free feature", null, "run:5"),
];

describe("answerOf", () => {
	it("names the two blocked features with one action each", () => {
		expect(answerOf("What blocks the release?", list, words)).toEqual([
			{
				mark: "blocked",
				features: [
					{ title: "Fix the French menu", ref: "run:1" },
					{ title: "Cache the project list", ref: "run:2" },
				],
			},
		]);
	});

	it("answers for needs you and stopped", () => {
		const a = answerOf("what is stopped and what do I need to do", list, words);
		expect(a?.map((g) => g.mark)).toEqual(["stopped", "needs_you"]);
		expect(a?.[1]?.features).toEqual([{ title: "Draft the plan", ref: "run:3" }]);
	});

	it("gives an empty group when no feature has the mark", () => {
		expect(answerOf("blocked?", [], words)).toEqual([{ mark: "blocked", features: [] }]);
	});

	it("returns null for any other text, and ignores empty match words", () => {
		expect(answerOf("plan the release", list, words)).toBeNull();
		expect(answerOf("anything", list, { blocked: "", stopped: " ,", needs: "" })).toBeNull();
	});
	it("matches the start of a word only", () => {
		expect(
			answerOf("How do I build the desktop app?", [], {
				blocked: "block",
				stopped: "stop",
				needs: "need",
			}),
		).toBeNull();
		expect(
			answerOf("what stopped", [], { blocked: "block", stopped: "stop", needs: "need" }),
		).not.toBeNull();
	});

	it("gives the main action of the stop fact when the run of a feature is known", () => {
		const runs = [
			{ id: "1", key: "ACME-9", state: "Blocked" as const },
			{ id: "4", key: "ACME-6", state: "Paused" as const },
		];
		const facts = [
			feature("Fix the French menu", "blocked", "run:1", "unblock"),
			feature("Cache the project list", "blocked", "run:2"),
			feature("Retry the sync", "stopped", "run:4", "add_budget"),
		];
		const a = answerOf("what blocks and what stopped", facts, words, runs);
		expect(a?.[0]?.features.map((f) => f.action)).toEqual(["unblock", undefined]);
		expect(a?.[1]?.features.map((f) => f.action)).toEqual(["addBudget"]);
	});

	it("gives Close as done for a run whose pull request was closed on the code host", () => {
		const runs = [{ id: "1", key: "ACME-9", state: "PROpen" as const }];
		const facts = [feature("Fix the French menu", "blocked", "run:1", "close_done")];
		const a = answerOf("what blocks", facts, words, runs);
		expect(a?.[0]?.features.map((f) => f.action)).toEqual(["closeDone"]);
	});
});

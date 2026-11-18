import { overloaded, proposals, withProposals } from "./proposals";

const day = (d: string, used: number, capacity = 1) => ({ day: d, used, capacity });
const bar = (task: string, member: string, start: string, end: string) => ({
	task,
	name: task,
	member,
	start,
	end,
});
const members = [
	{ handle: "ada", role: "dev" },
	{ handle: "grace", role: "dev" },
	{ handle: "alan", role: "qa" },
];

describe("the proposals of the plan", () => {
	const load = [
		{ handle: "ada", days: [day("2026-11-02", 2), day("2026-11-03", 2)] },
		{ handle: "grace", days: [day("2026-11-02", 0.5)] },
		{ handle: "alan", days: [day("2026-11-05", 1), day("2026-11-06", 2)] },
	];
	const bars = [
		bar("est:a#one", "ada", "2026-11-02", "2026-11-02"),
		bar("est:a#two", "ada", "2026-11-03", "2026-11-04"),
		bar("est:a#test", "alan", "2026-11-05", "2026-11-06"),
	];

	it("counts the people with a day over their capacity", () => {
		expect(overloaded(load).map((m) => m.handle)).toEqual(["ada", "alan"]);
	});

	it("moves the last task of a person who is over to a person of the same role with room", () => {
		expect(proposals(bars, load, members)[0]).toEqual({
			task: "est:a#two",
			name: "est:a#two",
			from: "ada",
			to: "grace",
		});
	});

	it("starts the task after the last day over, on a working day, when nobody of the role has room", () => {
		const weekend = (d: string) => d === "2026-11-07" || d === "2026-11-08";
		expect(proposals(bars, load, members, weekend)[1]).toEqual({
			task: "est:a#test",
			name: "est:a#test",
			from: "alan",
			start: "2026-11-09",
		});
	});

	it("proposes nothing for a person who is over on days with no task of the sheet", () => {
		expect(proposals([], load, members)).toEqual([]);
	});

	it("writes a proposal as a decision and keeps the other decisions", () => {
		const d = { order: ["est:a#one"], tasks: { "est:a#two": { start: "2026-11-03" } } };
		expect(withProposals(d, proposals(bars, load, members))).toEqual({
			order: ["est:a#one"],
			tasks: {
				"est:a#two": { start: "2026-11-03", member: "grace" },
				"est:a#test": { start: "2026-11-07" },
			},
		});
	});

	it("does not move a task to a person who would go over, so two people never trade a task", () => {
		const both = [
			bar("est:a#one", "ada", "2026-11-02", "2026-11-02"),
			bar("est:a#two", "ada", "2026-11-02", "2026-11-02"),
		];
		const full = [
			{ handle: "ada", days: [day("2026-11-02", 2)] },
			{ handle: "grace", days: [day("2026-11-02", 1)] },
		];
		expect(proposals(both, full, members)).toEqual([
			{ task: "est:a#one", name: "est:a#one", from: "ada", start: "2026-11-03" },
		]);
		// The same day after a move to Grace: the task does not go back to Ada.
		const traded = [both[0], { ...both[1], member: "grace" }] as typeof both;
		const after = [
			{ handle: "ada", days: [day("2026-11-02", 1)] },
			{ handle: "grace", days: [day("2026-11-02", 2)] },
		];
		expect(proposals(traded, after, members).map((p) => p.to)).toEqual([undefined]);
	});

	it("gives one free person the task of one person only, when two people are over", () => {
		const two = [
			bar("est:a#one", "ada", "2026-11-02", "2026-11-02"),
			bar("est:a#two", "grace", "2026-11-02", "2026-11-02"),
		];
		const devs = [...members, { handle: "linus", role: "dev" }];
		const overTwo = [
			{ handle: "ada", days: [day("2026-11-02", 2)] },
			{ handle: "grace", days: [day("2026-11-02", 2)] },
		];
		expect(proposals(two, overTwo, devs).map((p) => p.to)).toEqual(["linus", undefined]);
	});
});

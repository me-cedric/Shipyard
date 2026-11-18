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
});

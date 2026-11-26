import { graph } from "./graph";

const c = (sha: string, ...parents: string[]) => ({ sha, parents });

describe("the history graph", () => {
	it("keeps a straight history on one lane", () => {
		const rows = graph([c("c", "b"), c("b", "a"), c("a")]);
		expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
		expect(rows[0]?.through).toEqual([0]);
		// The root has no line below it, but the line above reaches it.
		expect(rows[2]?.through).toEqual([0]);
	});

	it("opens a lane for the second parent of a merge and closes it at the fork", () => {
		// m merges b (first parent a-side) and s (a side branch); both come from base.
		const rows = graph([c("m", "b", "s"), c("s", "base"), c("b", "base"), c("base")]);
		expect(rows.map((r) => r.lane)).toEqual([0, 1, 0, 0]);
		// While the side lane waits, the main lane runs through the row of s.
		expect(rows[1]?.through).toEqual([0, 1]);
		expect(rows[3]?.width).toBeLessThanOrEqual(2);
	});

	it("gives the curves of a merge: the parent line leaves the dot, and the side lane joins at the fork", () => {
		const rows = graph([c("m", "b", "s"), c("s", "base"), c("b", "base"), c("base")]);
		// The merge has no line above it, a line to its first parent and a curve to lane 1.
		expect(rows[0]).toMatchObject({ top: false, bottom: true, forks: [1], joins: [], pass: [] });
		// The side commit sits on lane 1 while lane 0 runs past it.
		expect(rows[1]).toMatchObject({ lane: 1, top: true, bottom: true, pass: [0] });
		// At the fork point, lane 1 ends: it curves into the dot of lane 0. The root has no line below.
		expect(rows[3]).toMatchObject({ lane: 0, top: true, bottom: false, joins: [1], pass: [] });
	});

	it("starts a new lane for a commit that nothing waits for", () => {
		const rows = graph([c("x", "a"), c("y", "a"), c("a")]);
		expect(rows.map((r) => r.lane)).toEqual([0, 1, 0]);
	});
});

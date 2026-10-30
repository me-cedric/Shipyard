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

	it("starts a new lane for a commit that nothing waits for", () => {
		const rows = graph([c("x", "a"), c("y", "a"), c("a")]);
		expect(rows.map((r) => r.lane)).toEqual([0, 1, 0]);
	});
});

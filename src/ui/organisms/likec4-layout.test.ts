import { edgePath, shortMessage, toLayout } from "./likec4-layout";

describe("likec4 layout", () => {
	it("moves a view to the origin and keeps the parent and the label", () => {
		const l = toLayout({
			id: "index",
			bounds: { x: 10, y: 20, width: 100, height: 50 },
			nodes: [{ id: "a", title: "A", x: 15, y: 25, width: 30, height: 20, parent: "p" }],
			edges: [
				{
					id: "e",
					label: "uses",
					points: [
						[10, 20],
						[20, 30],
					],
				},
			],
		});
		expect(l.title).toBe("index");
		expect(l.nodes[0]).toMatchObject({ x: 5, y: 5, parent: "p" });
		expect(l.edges[0]).toEqual({
			id: "e",
			label: "uses",
			points: [
				[0, 0],
				[10, 10],
			],
		});
	});

	it("draws a curve for 1 + 3n points and a line for others", () => {
		expect(
			edgePath([
				[0, 0],
				[1, 1],
				[2, 2],
				[3, 3],
			]),
		).toBe("M0 0C1 1 2 2 3 3");
		expect(
			edgePath([
				[0, 0],
				[5, 5],
			]),
		).toBe("M0 0L5 5");
		expect(edgePath([])).toBe("");
	});

	it("shortens a long parser message", () => {
		expect(shortMessage("a\nb")).toBe("a\nb");
		expect(shortMessage("Expecting:\n 1. x\n 2. y\n 3. z\nbut found: '}'")).toBe(
			"Expecting: ... but found: '}'",
		);
	});
});

import { unwrapLines } from "./unwrap";

describe("unwrapLines", () => {
	it("joins the lines of a paragraph and of a list item, and keeps the other breaks", () => {
		const body = [
			"A fix round runs one builder in the run",
			"worktree.",
			"",
			"- Rights: a personal role no longer lowers",
			"  the rights of an admin.",
			"- A second item",
			"Refs: spec:delivery#REQ-004",
		].join("\n");
		expect(unwrapLines(body)).toBe(
			[
				"A fix round runs one builder in the run worktree.",
				"",
				"- Rights: a personal role no longer lowers the rights of an admin.",
				"- A second item",
				"Refs: spec:delivery#REQ-004",
			].join("\n"),
		);
		expect(unwrapLines("")).toBe("");
	});
});

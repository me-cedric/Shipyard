import { chainAck, docSearch, moveFile, seedReview, withAcks } from "./mock-review";

const warning = (...changed: string[]) => [{ from: "specs", to: "api", changed }];

describe("the review mock", () => {
	it("covers a warning with an acknowledgement until a new file changes", () => {
		const r = seedReview();
		chainAck(r, warning("a.md"), "specs", "api", " seen ", true);
		expect(r.acks[0]?.reason).toBe("seen");
		expect(withAcks(r, warning("a.md"))[0]?.ack).not.toBeNull();
		expect(withAcks(r, warning("a.md", "b.md"))[0]?.ack).toBeNull();
		expect(() => chainAck(r, warning("a.md"), "specs", "api", "", true)).toThrow();
		expect(() => chainAck(r, warning("a.md"), "specs", "data", "x", true)).toThrow();
		expect(() => chainAck(r, warning("a.md"), "specs", "api", "x", false)).toThrow();
	});

	it("moves or deletes a file in the map that holds it, and leaves a path that no map holds", () => {
		const one: Record<string, unknown> = { "docs/a.md": 1, "docs/dir/b.md": 2 };
		const two: Record<string, unknown> = { "docs/c.md": 3 };
		expect(moveFile([one, two], "rename", "docs/a.md", "docs/z.md", true)).toBe(true);
		expect(Object.keys(one).sort()).toEqual(["docs/dir/b.md", "docs/z.md"]);
		expect(() => moveFile([one, two], "rename", "docs/z.md", "docs/c.md", true)).toThrow();
		expect(moveFile([one, two], "delete", "docs/dir", undefined, true)).toBe(true);
		expect(Object.keys(one)).toEqual(["docs/z.md"]);
		expect(moveFile([one, two], "delete", "src/x.ts", undefined, true)).toBe(false);
		expect(() => moveFile([one, two], "delete", "docs/c.md", undefined, false)).toThrow();
	});

	it("finds the first line of each document that holds the text, in any case", () => {
		const files = {
			"docs/documents/a.md": { text: "# A\nThe Scope\nscope" },
			"docs/handbook/b.md": { text: "scope" },
		};
		expect(docSearch(files, "SCOPE")).toEqual([
			{ path: "docs/documents/a.md", title: "A", line: 2, snippet: "The Scope" },
		]);
		expect(docSearch(files, " ")).toEqual([]);
	});
});

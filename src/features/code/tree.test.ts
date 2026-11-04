import { treeRows } from "./tree";

describe("treeRows", () => {
	it("puts a renamed file under its new path and names it old → new", () => {
		const rows = treeRows([
			{ path: "src/new.ts", old_path: "lib/old.ts", state: "renamed" },
			{ path: "src/a.ts", old_path: null, state: "modified" },
		]);
		expect(rows.map((r) => `${r.kind}:${r.path}:${r.name}`)).toEqual([
			"folder:src:src",
			"file:src/a.ts:a.ts",
			"file:src/new.ts:lib/old.ts → new.ts",
		]);
	});
});

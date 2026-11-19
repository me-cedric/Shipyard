import { flatRows, treeRows } from "./tree";

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

describe("flatRows", () => {
	it("gives one row per path, with the places of its changes", () => {
		const file = (path: string, state: "modified" | "untracked" | "conflicted") => ({
			path,
			old_path: null,
			state,
		});
		const rows = flatRows({
			staged: [file("src/b.ts", "modified")],
			unstaged: [file("src/b.ts", "modified"), file("src/a.ts", "modified")],
			untracked: [file("README.md", "untracked")],
			conflicted: [file("src/c.ts", "conflicted")],
		});
		expect(rows.map((r) => `${r.path}:${+r.staged}${+r.unstaged}${+r.conflict}`)).toEqual([
			"README.md:010",
			"src/a.ts:010",
			"src/b.ts:110",
			"src/c.ts:001",
		]);
	});
});

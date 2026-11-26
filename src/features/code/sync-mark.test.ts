import type { Changes } from "@/lib/code";
import { en } from "@/lib/i18n/en";
import { syncState } from "./sync-mark";

const file = { path: "a.ts", state: "modified" } as Changes["unstaged"][number];
const clean: Changes = {
	branch: "main",
	head: "a".repeat(40),
	upstream: "origin/main",
	ahead: 0,
	behind: 0,
	staged: [],
	unstaged: [],
	untracked: [],
	conflicted: [],
	merging: false,
	rebasing: false,
	added: 0,
	removed: 0,
};

// spec:app-redesign#REQ-022: one mark shows the sync state.
describe("the sync mark", () => {
	const cases: [string, Changes, boolean][] = [
		["In sync", clean, false],
		["2 ahead", { ...clean, ahead: 2 }, false],
		["3 behind", { ...clean, ahead: 2, behind: 3 }, false],
		["Not shared yet", { ...clean, upstream: null }, false],
		[
			"Changed files (2)",
			{ ...clean, behind: 3, unstaged: [file], untracked: [{ ...file, path: "b.ts" }] },
			false,
		],
		["Sync failed", { ...clean, unstaged: [file] }, true],
	];
	it.each(cases)("says %s", (text, changes, failed) => {
		expect(syncState(en, changes, failed).text).toBe(text);
	});
});

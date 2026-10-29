import {
	codeBranchCreate,
	codeBranchDelete,
	codeBranchSwitch,
	codeCommit,
	codeDiff,
	codeFileRead,
	codeStage,
	codeStatus,
	codeUnstage,
	codeWatchIntervalSet,
	seedCode,
	unifiedDiff,
} from "./mock-code";

describe("the Code mock", () => {
	it("keeps a file in both groups when it has a staged and a later unstaged change", () => {
		const c = seedCode();
		const s = codeStatus(c);
		expect(s.staged.map((f) => f.path)).toEqual(["src/lib/util.ts"]);
		expect(s.unstaged.map((f) => f.path)).toContain("src/lib/util.ts");
		expect(s.untracked.map((f) => f.path)).toEqual(["README.md"]);
	});

	it("commits the staged files only", () => {
		const c = seedCode();
		codeStage(c, ["docs"]);
		const sha = codeCommit(c, "docs: guide", "");
		expect(Object.keys(c.commits[sha]?.changes ?? {}).sort()).toEqual([
			"docs/guide.md",
			"src/lib/util.ts",
		]);
		expect(codeDiff(c, "src/app.ts", "unstaged").text).not.toBe("");
		codeUnstage(c, ["src"]);
		expect(() => codeCommit(c, "docs: none", "")).toThrow("nothing is staged");
	});

	it("applies the summary and branch name rules of the Rust core", () => {
		const c = seedCode();
		codeStage(c, ["docs"]);
		expect(() => codeCommit(c, "wip: x", "")).toThrow("type: feat");
		expect(() => codeCommit(c, "feat(): x", "")).toThrow("type: feat");
		expect(() => codeCommit(c, "feat:  ", "")).toThrow("the subject is empty");
		expect(() => codeBranchCreate(c, "patch-3")).toThrow("<type>/<area>/<kebab>");
		codeBranchCreate(c, "fix/auth/login-timeout");
		expect(c.branch).toBe("fix/auth/login-timeout");
		expect(() => codeBranchDelete(c, "fix/auth/login-timeout", true)).toThrow("working branch");
		expect(() => codeBranchSwitch(c, "feat/auth/login")).toThrow("src/app.ts");
	});

	it("reads a file for the viewer and refuses a path out of the project", () => {
		const c = seedCode();
		expect(codeFileRead(c, "src/app.ts", null).text).toContain("a\nB");
		expect(codeFileRead(c, "src/app.ts", "HEAD").path).toBe("src/app.ts");
		expect(() => codeFileRead(c, "../x", null)).toThrow("not a path");
		expect(() => codeFileRead(c, "/etc/passwd", null)).toThrow("not a path");
		expect(() => codeFileRead(c, "nope.ts", null)).toThrow("no such file");
	});

	it("keeps the watch interval between 1 and 1440 minutes", () => {
		const c = seedCode();
		expect(c.watchMinutes).toBe(15);
		expect(codeWatchIntervalSet(c, 5)).toBe(5);
		expect(() => codeWatchIntervalSet(c, 0)).toThrow("1 to 1440");
		expect(c.watchMinutes).toBe(5);
	});

	it("writes a unified diff with context", () => {
		expect(unifiedDiff("a", "1\n2\n3\n4\n5\n", "1\n2\n3\nX\n5\n")).toContain("-4\n+X\n 5");
	});
});

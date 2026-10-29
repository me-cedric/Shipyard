import {
	codeBranchCreate,
	codeBranchDelete,
	codeBranchSwitch,
	codeCommit,
	codeDiff,
	codeStage,
	codeStatus,
	codeUnstage,
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

	it("writes a unified diff with context", () => {
		expect(unifiedDiff("a", "1\n2\n3\n4\n5\n", "1\n2\n3\nX\n5\n")).toContain("-4\n+X\n 5");
	});
});

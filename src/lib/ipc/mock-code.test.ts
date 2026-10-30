import {
	codeBlame,
	codeBranchCreate,
	codeBranchDelete,
	codeBranchMerge,
	codeBranchRebase,
	codeBranchSwitch,
	codeCommit,
	codeDiff,
	codeFileRead,
	codeMergeAbort,
	codeRebaseAbort,
	codeRebaseContinue,
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

	it("merges a branch, stops on a conflict and aborts", () => {
		const c = seedCode();
		// A change in the working copy blocks the merge, as in the Rust command.
		expect(() => codeBranchMerge(c, "feat/auth/login")).toThrow("uncommitted changes");
		for (const f of Object.values(c.files)) {
			f.index = f.head;
			f.work = f.head;
		}
		expect(codeBranchMerge(c, "feat/auth/login")).toBe("up-to-date");
		expect(() => codeBranchMerge(c, "nope")).toThrow("branch not found");
		// Both branches change one file: the merge stays in progress.
		codeBranchCreate(c, "feat/x/side");
		const side = c.branches["feat/x/side"];
		side?.touches.push("src/app.ts");
		side?.log.unshift("s".repeat(40));
		codeBranchSwitch(c, "main");
		c.branches.main?.touches.push("src/app.ts");
		c.branches.main?.log.unshift("m".repeat(40));
		expect(codeBranchMerge(c, "feat/x/side")).toEqual({ conflicts: ["src/app.ts"] });
		expect(codeStatus(c)).toMatchObject({ merging: true });
		expect(codeStatus(c).conflicted).toHaveLength(1);
		expect(() => codeBranchMerge(c, "feat/x/side")).toThrow("busy with a merge");
		codeMergeAbort(c);
		expect(codeStatus(c)).toMatchObject({ merging: false, conflicted: [] });
		expect(() => codeMergeAbort(c)).toThrow("no merge");
	});

	it("rebases, stops on a clash, refuses a continue with a conflict and aborts", () => {
		const c = seedCode();
		for (const f of Object.values(c.files)) {
			f.index = f.head;
			f.work = f.head;
		}
		expect(codeBranchRebase(c, "feat/auth/login")).toBe("up-to-date");
		expect(() => codeBranchRebase(c, "nope")).toThrow("branch not found");
		expect(() => codeRebaseContinue(c)).toThrow("no rebase");
		codeBranchCreate(c, "feat/x/side");
		c.branches["feat/x/side"]?.touches.push("x.ts");
		c.branches["feat/x/side"]?.log.unshift("s".repeat(40));
		c.branches.main?.touches.push("y.ts");
		c.branches.main?.log.unshift("m".repeat(40));
		expect(codeBranchRebase(c, "main")).toBe("done");
		c.branches.main?.touches.push("x.ts");
		c.branches.main?.log.unshift("n".repeat(40));
		expect(codeBranchRebase(c, "main")).toEqual({ conflicts: expect.arrayContaining(["x.ts"]) });
		expect(codeStatus(c)).toMatchObject({ rebasing: true });
		expect(() => codeRebaseContinue(c)).toThrow("conflicts");
		codeRebaseAbort(c);
		expect(codeStatus(c)).toMatchObject({ rebasing: false });
		expect(() => codeRebaseAbort(c)).toThrow("no rebase");
		expect(codeBlame(c, "src/app.ts").length).toBeGreaterThan(0);
	});
});

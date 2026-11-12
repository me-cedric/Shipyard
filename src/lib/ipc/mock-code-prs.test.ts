import { describe, expect, it } from "vitest";
import { seedCode } from "./mock-code";
import {
	checkRun,
	gatesSave,
	impactAnalyze,
	impactList,
	impactRead,
	onTerminalOutput,
	pullComment,
	pullDetail,
	pullLineComment,
	pullMerge,
	pullOpen,
	pullReady,
	pullReply,
	pullResolve,
	pullReviewSubmit,
	pullVerdict,
	qualityView,
	scannerInstall,
	scanRun,
	seedPrs,
	terminalClose,
	terminalCloseAll,
	terminalOpen,
	terminalWrite,
} from "./mock-code-prs";

const input = { title: "feat(code): x", body: "", draft: false, labels: ["feat", "ghost"] };

describe("the Code forge mock", () => {
	it("needs a click for each write and a text for a comment and a request for changes", () => {
		const p = seedPrs();
		expect(() => pullComment(p, 141, "ok", false)).toThrow("click");
		expect(() => pullComment(p, 141, "  ", true)).toThrow("some text");
		expect(() => pullVerdict(p, 141, "request-changes", "", true)).toThrow("some text");
		pullVerdict(p, 141, "request-changes", "rename", true);
		expect(pullDetail(p, 141).verdicts.map((v) => v.state)).toEqual([
			"approved",
			"changes-requested",
		]);
	});

	it("keeps a general comment apart from the threads, and replies to and resolves a thread", () => {
		const p = seedPrs();
		pullComment(p, 141, "ok", true);
		expect(pullDetail(p, 141).comments.map((c) => c.body)).toEqual(["ok"]);
		expect(pullDetail(p, 141).threads).toEqual([]);
		expect(() => pullReply(p, "pr:github-demo:142", "T1", "x", false)).toThrow("click");
		expect(() => pullReply(p, "pr:github-demo:142", "T1", " ", true)).toThrow("some text");
		pullReply(p, "pr:github-demo:142", "T1", "done", true);
		expect(pullDetail(p, 142).threads[0]?.comments).toHaveLength(3);
		pullResolve(p, "pr:github-demo:142", "T1", true, true);
		expect(pullDetail(p, 142).threads[0]?.resolved).toBe(true);
		expect(() => pullResolve(p, "pr:github-demo:142", "nope", true, true)).toThrow("not found");
	});

	it("turns a review into one thread for each line in the diff and folds the rest in the text", () => {
		const p = seedPrs();
		const ref = "pr:github-demo:141";
		const path = pullDetail(p, 141).files[0]?.path ?? "";
		const note = (line: number) => ({ path, line, body: `note ${line}`, headSha: "abc1234" });
		expect(() => pullReviewSubmit(p, ref, "approve", "", [], "abc1234", false)).toThrow("click");
		expect(() => pullReviewSubmit(p, ref, "merge", "x", [], "abc1234", true)).toThrow("verdict");
		expect(() =>
			pullReviewSubmit(p, ref, "request_changes", " ", [note(1)], "abc1234", true),
		).toThrow("some text");
		expect(() => pullReviewSubmit(p, ref, "comment", "", [], "abc1234", true)).toThrow("empty");
		const r = pullReviewSubmit(
			p,
			ref,
			"request_changes",
			"fix",
			[note(1), note(99)],
			"abc1234",
			true,
		);
		expect(r).toEqual({ inline: 1, inBody: 1, failed: [] });
		const d = pullDetail(p, 141);
		expect(d.threads.map((t) => [t.path, t.line, t.resolved])).toEqual([[path, 1, false]]);
		expect(d.verdicts.map((v) => v.state)).toContain("changes-requested");
		expect(d.comments.at(-1)?.body).toContain(`${path}:99`);
		expect(pullLineComment(p, ref, path, 2, "one", "abc1234", true)).toEqual({
			inline: 1,
			inBody: 0,
			failed: [],
		});
		expect(pullDetail(p, 141).threads).toHaveLength(2);
		// A note of an older push goes in the text, with its label, not on a line.
		const old = { ...note(2), headSha: "0000000" };
		expect(pullReviewSubmit(p, ref, "comment", "", [old], "abc1234", true).inBody).toBe(1);
		expect(pullDetail(p, 141).threads).toHaveLength(2);
		expect(pullDetail(p, 141).comments.at(-1)?.body).toContain("(older version)");
	});

	it("keeps a draft from merging until it is marked ready", () => {
		const p = seedPrs();
		expect(() => pullMerge(p, 143, "squash", true)).toThrow("draft");
		pullReady(p, 143, true);
		pullMerge(p, 143, "squash", true);
		expect(pullDetail(p, 143).state).toBe("merged");
		expect(() => pullMerge(p, 143, "squash", true)).toThrow("not open");
	});

	it("opens a pull request only from a published branch and reports the missing labels", () => {
		const p = seedPrs();
		const c = seedCode();
		c.branch = "feat/code/x";
		c.branches["feat/code/x"] = { log: [], touches: [] };
		expect(() => pullOpen(p, c, input, true)).toThrow("publish the working branch");
		c.remoteBranches.push("origin/feat/code/x");
		const made = pullOpen(p, c, input, true);
		expect(made.missingLabels).toEqual(["ghost"]);
		expect(pullDetail(p, made.number).sourceBranch).toBe("feat/code/x");
	});

	it("lists the two failed checks of a pull request", () => {
		const failed = pullDetail(seedPrs(), 142).checks.filter((c) => c.state === "failing");
		expect(failed.map((c) => c.name)).toEqual(["unit", "lint"]);
	});
});

describe("the Code quality and impact mock", () => {
	it("shows the saved gates as the checks and fails one with its reason", () => {
		const p = seedPrs();
		expect(() => gatesSave(p, ["make ci"], false)).toThrow("click");
		gatesSave(p, [" make ci ", ""], true);
		expect(qualityView(p).checks.map((c) => [c.name, c.label])).toEqual([
			["make ci", null],
			["verify all docs", null],
			["docs freshness", null],
		]);
		expect(checkRun(p, "make ci", true).findings[0]?.message).toContain("exit code 1");
	});

	it("runs a declared check only and a scanner that ships, and keeps no secret value", () => {
		const p = seedPrs();
		expect(() => checkRun(p, "make-everything-vanish", true)).toThrow("not a check");
		expect(() => scanRun(p, "dependencies", true)).toThrow("not installed");
		scannerInstall(p, "dependencies", true);
		expect(qualityView(p).scanners.find((s) => s.name === "dependencies")?.available).toBe(true);
		expect(() => scannerInstall(p, "nope", true)).toThrow("not a scanner");
		expect(scanRun(p, "dependencies", true).findings).toHaveLength(1);
		const r = scanRun(p, "secrets", true);
		expect(JSON.stringify(r)).not.toMatch(/ghp_/);
		expect(qualityView(p).scanners[0]?.last?.findings).toHaveLength(1);
	});

	it("saves a plan and a digest in two files that never overwrite, and the digest has no path", () => {
		const p = seedPrs();
		const c = seedCode();
		const a = impactAnalyze(p, c, "v1.0", true);
		const b = impactAnalyze(p, c, "v1.0", true);
		expect(a.plan).not.toBe(b.plan);
		expect(impactList(p)).toHaveLength(3);
		expect(impactRead(p, a.plan)).toContain("- contracts: high");
		expect(impactRead(p, a.digest)).not.toMatch(/\/|\.ts/);
		expect(() => impactAnalyze(p, c, "nope", true)).toThrow("no such ref");
	});
});

describe("the fake terminal", () => {
	it("echoes a line, ends with the panel and refuses a folder outside the project", () => {
		const p = seedPrs();
		const seen: string[] = [];
		onTerminalOutput(p, (_, d) => seen.push(d));
		expect(() => terminalOpen(p, "t1", "../x")).toThrow("not a folder");
		terminalOpen(p, "t1", "src");
		terminalWrite(p, "t1", "ls\r");
		expect(seen.join("")).toContain("ls\r\n");
		terminalClose(p, "t1");
		expect(() => terminalWrite(p, "t1", "x")).toThrow("closed");
		terminalOpen(p, "t2", null);
		terminalCloseAll(p);
		expect(() => terminalWrite(p, "t2", "x")).toThrow("closed");
	});
});

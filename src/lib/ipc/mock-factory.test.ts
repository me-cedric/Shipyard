import { describe, expect, it } from "vitest";
import { commands, type Lane, type RunState } from "./bindings";
import { DEMO_FOLDER, mockState, resetMock } from "./mock";
import { emptyFactory } from "./mock-factory";
import { unwrap } from "./result";

/** The demo project: a tracker, a full mirror and the seeded factory. */
const open = () => unwrap(commands.projectsOpen(DEMO_FOLDER, false));
const runs = () => unwrap(commands.runsList());
const one = async (key: string, state?: RunState) => {
	const r = (await runs()).find((x) => x.key === key && (!state || x.state === state));
	if (!r) throw new Error(`no demo run ${key} ${state ?? ""}`);
	return r;
};
/** A seeded row that the test edits to reach a case that the commands cannot reach. */
const need = <T>(v: T | undefined): T => {
	if (v === undefined) throw new Error("no such row");
	return v;
};
const stateOf = async (id: string) => (await unwrap(commands.runGetOne(id)))?.state;

describe("mock factory: the demo data set", () => {
	beforeEach(async () => {
		resetMock();
		await open();
	});

	it("has a run in every lane", async () => {
		const lanes = new Set((await runs()).map((r) => r.lane));
		const all: Lane[] = ["queued", "working", "needs_you", "in_review", "ready_to_merge", "done"];
		for (const lane of all) expect(lanes.has(lane), lane).toBe(true);
	});

	it("lists the runs of the active project only, with valid ULIDs", async () => {
		const list = await runs();
		expect(list.length).toBeGreaterThanOrEqual(12);
		for (const r of list) {
			expect(r.id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
			expect(r.reference).toBe(`run:${r.id}`);
			expect(r.project).toBe("demo");
		}
		// The data set belongs to the project that read it first.
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		expect(await runs()).toEqual([]);
		expect(await unwrap(commands.pullsList())).toEqual([]);
		await unwrap(commands.projectsSwitch("demo"));
		expect(await runs()).toHaveLength(list.length);
	});

	it("has an open question, a failing CI run and a merged pull request", async () => {
		const questions = await unwrap(commands.questionsList());
		const open = questions.filter((q) => q.question.state === "open");
		expect(open).toHaveLength(1);
		expect(open[0]?.question.options).toHaveLength(3);
		expect(questions.some((q) => q.question.answer?.choice.kind === "option")).toBe(true);
		expect(questions.some((q) => q.question.free_text)).toBe(true);
		// Open questions come first.
		expect(questions[0]?.question.state).toBe("open");
		expect((await runs()).some((r) => r.pr?.ci === "failing" && r.lane === "in_review")).toBe(true);
		const done = (await runs()).find((r) => r.state === "Done" && r.pr);
		expect(done?.pr?.state).toBe("merged");
		expect(done?.lane).toBe("done");
	});

	it("covers the cards: findings, a kept worktree, counts from the slice", async () => {
		const list = await runs();
		expect(list.some((r) => r.findings.some((f) => f.severity === "P1" && f.path && f.line))).toBe(
			true,
		);
		expect(list.some((r) => r.worktreeKept)).toBe(true);
		const waiting = await one("ACME-1");
		expect(waiting).toMatchObject({ state: "WaitingForAnswer", openQuestions: 1, approvals: 1 });
		const working = await one("ACME-2");
		expect(working.approvals).toBe(2);
		expect(working.steps.find((s) => s.id === "build")?.units.length).toBeGreaterThan(1);
		expect((await one("ACME-4")).steps.find((s) => s.id === "plan")?.state).toBe("gate");
	});

	it("applies the lane rule to a pull request", async () => {
		const pulls = await unwrap(commands.pullsList());
		const lane = (n: number) => pulls.find((p) => p.number === n)?.lane;
		expect(lane(42)).toBe("ready_to_merge");
		expect(lane(43)).toBe("in_review"); // CI failing
		expect(lane(44)).toBe("in_review"); // changes requested
		expect(lane(46)).toBe("in_review"); // draft
		expect(lane(40)).toBe("done");
		expect(lane(47)).toBe("done");
		// One row for each run that has a pull request, and one that no run owns.
		const owned = (await runs()).flatMap((r) => (r.pr ? [r.pr.number] : []));
		for (const n of owned) expect(pulls.some((p) => p.number === n)).toBe(true);
		expect(pulls.some((p) => p.state === "open" && p.runs.length === 0)).toBe(true);
		expect(pulls.find((p) => p.number === 42)?.runs).toEqual([(await one("ACME-8")).id]);
		// A run takes the lane from its pull request.
		expect((await one("ACME-8")).lane).toBe("ready_to_merge");
		need(mockState().factory.pulls.find((p) => p.number === 42)).draft = true;
		expect((await one("ACME-8")).lane).toBe("in_review");
	});

	it("gives 4 approvals of different kinds and 3 messages", async () => {
		const approvals = await unwrap(commands.approvalsList());
		expect(new Set(approvals.map((a) => a.kind))).toEqual(
			new Set(["transition", "comment", "push", "open_pr"]),
		);
		expect(approvals.find((a) => a.kind === "push")?.force).toBe(true);
		expect(approvals.find((a) => a.kind === "open_pr")?.detail).not.toBe("");
		const messages = await unwrap(commands.messagesList());
		expect(messages).toHaveLength(3);
		expect(messages.filter((m) => !m.read)).toHaveLength(2);
	});

	it("has an empty factory with no run", () => {
		const f = emptyFactory();
		expect([f.runs, f.approvals, f.questions, f.messages]).toEqual([[], [], [], []]);
		expect(f.kill).toBe(false);
		expect(Object.keys(f.workflows).sort()).toEqual([
			"bug",
			"feature",
			"review-only",
			"spec-split",
			"spike",
		]);
	});
});

describe("mock factory: questions and messages", () => {
	beforeEach(async () => {
		resetMock();
		await open();
	});

	it("answers the open question and the run goes on", async () => {
		const run = await one("ACME-1");
		expect(run.lane).toBe("needs_you");
		await unwrap(commands.questionAnswer(run.id, "Q-101", { kind: "option", n: 2 }));
		const after = await one("ACME-1");
		expect(after).toMatchObject({ state: "Working", lane: "working", openQuestions: 0 });
		const q = (await unwrap(commands.questionsList())).find((x) => x.question.id === "Q-101");
		expect(q?.question).toMatchObject({
			state: "answered",
			answer: { choice: { kind: "option", n: 2 }, source: { kind: "inbox" } },
		});
	});

	it("refuses a bad choice, a text on a closed question and a second answer", async () => {
		const run = await one("ACME-1");
		for (const choice of [
			{ kind: "option", n: 0 },
			{ kind: "option", n: 4 },
			{ kind: "text", text: "elsewhere" },
		] as const)
			await expect(unwrap(commands.questionAnswer(run.id, "Q-101", choice))).rejects.toThrow(
				"the choice is not an option of the question",
			);
		expect((await one("ACME-1")).state).toBe("WaitingForAnswer");
		await expect(
			unwrap(commands.questionAnswer(run.id, "Q-999", { kind: "option", n: 1 })),
		).rejects.toThrow("no question Q-999");
		await unwrap(commands.questionAnswer(run.id, "Q-101", { kind: "option", n: 1 }));
		// The first answer wins. A second one changes nothing and is no error.
		await unwrap(commands.questionAnswer(run.id, "Q-101", { kind: "option", n: 2 }));
		const q = need(
			(await unwrap(commands.questionsList())).find((x) => x.question.id === "Q-101"),
		).question;
		expect(q.answer?.choice).toEqual({ kind: "option", n: 1 });
	});

	it("takes a text answer when the question allows it", async () => {
		const run = await one("ACME-1");
		need(mockState().factory.questions.find((x) => x.q.id === "Q-101")).q.free_text = true;
		await expect(
			unwrap(commands.questionAnswer(run.id, "Q-101", { kind: "text", text: "  " })),
		).rejects.toThrow("not an option");
		await unwrap(commands.questionAnswer(run.id, "Q-101", { kind: "text", text: "Home" }));
		expect(await stateOf(run.id)).toBe("Working");
	});

	it("marks a message read and refuses a bad run or number", async () => {
		const unread = (await unwrap(commands.messagesList())).find((m) => !m.read);
		if (!unread) throw new Error("no unread message");
		await unwrap(commands.messageReadMark(unread.run, unread.n));
		const after = await unwrap(commands.messagesList());
		expect(after.filter((m) => !m.read)).toHaveLength(1);
		await expect(unwrap(commands.messageReadMark(unread.run, 9))).rejects.toThrow("no message 9");
		await expect(unwrap(commands.messageReadMark("nope", 0))).rejects.toThrow("no run nope");
	});
});

describe("mock factory: the run log", () => {
	beforeEach(async () => {
		resetMock();
		await open();
	});

	it("pages the log: two pages make the whole log, oldest first", async () => {
		const run = await one("ACME-10");
		const all = await unwrap(commands.runLogPage(run.id, 0, 500));
		expect(all.more).toBe(false);
		expect(all.events.length).toBeGreaterThan(4);
		const first = await unwrap(commands.runLogPage(run.id, 0, 3));
		expect(first.events).toHaveLength(3);
		expect(first.more).toBe(true);
		expect(first.last).toBe(first.events[2]?.id);
		const second = await unwrap(commands.runLogPage(run.id, first.last, 500));
		expect(second.more).toBe(false);
		expect([...first.events, ...second.events]).toEqual(all.events);
		for (const e of all.events) JSON.parse(e.payload);
		expect(all.events.every((e, i) => i === 0 || e.id > (all.events[i - 1]?.id ?? 0))).toBe(true);
		// An empty page keeps `after`. A limit under 1 is 1.
		expect(await unwrap(commands.runLogPage(run.id, all.last, 10))).toEqual({
			events: [],
			last: all.last,
			more: false,
		});
		expect((await unwrap(commands.runLogPage(run.id, 0, 0))).events).toHaveLength(1);
	});

	it("has ids that are unique over all runs and kinds that the views know", async () => {
		const ids: number[] = [];
		const kinds = new Set<string>();
		for (const r of await runs())
			for (const e of (await unwrap(commands.runLogPage(r.id, 0, 500))).events) {
				ids.push(e.id);
				kinds.add(e.kind);
			}
		expect(new Set(ids).size).toBe(ids.length);
		for (const k of ["state", "runner", "tool", "write", "note", "question", "review", "pr"])
			expect(kinds.has(k), k).toBe(true);
	});

	it("refuses an id that is not a run id", async () => {
		await expect(unwrap(commands.runLogPage("run-1", 0, 10))).rejects.toThrow(
			"`run-1` is not a run id",
		);
	});
});

describe("mock factory: run actions", () => {
	beforeEach(async () => {
		resetMock();
		await open();
	});

	it("cancels a live run, keeps a final one and refuses a merged one", async () => {
		const live = await one("ACME-3");
		await unwrap(commands.runCancel(live.id));
		expect(await one("ACME-3")).toMatchObject({ state: "Cancelled", lane: "done" });
		await unwrap(commands.runCancel(live.id));
		await expect(unwrap(commands.runCancel("nope"))).rejects.toThrow("no run nope");
		const f = mockState().factory;
		const merged = f.runs.find((r) => r.state === "Done");
		if (!merged) throw new Error("no done run");
		merged.state = "Merged";
		await expect(unwrap(commands.runCancel(merged.id))).rejects.toThrow(
			"a merged run goes to Done, not Cancelled",
		);
	});

	it("withdraws the open question of a cancelled run", async () => {
		await unwrap(commands.runCancel((await one("ACME-1")).id));
		const q = (await unwrap(commands.questionsList())).find((x) => x.question.id === "Q-101");
		expect(q?.question.state).toBe("withdrawn");
	});

	it("unblocks only a blocked run", async () => {
		const blocked = await one("ACME-9");
		await unwrap(commands.runUnblock(blocked.id));
		expect(await one("ACME-9")).toMatchObject({ state: "Working", lane: "working" });
		await expect(unwrap(commands.runUnblock(blocked.id))).rejects.toThrow(
			"refused Unblock in Working",
		);
	});

	it("resumes a paused run with a budget, and refuses a bad budget", async () => {
		const paused = await one("ACME-6");
		expect(paused).toMatchObject({ state: "Paused", lane: "needs_you" });
		for (const add of [-1, Number.NaN, null])
			await expect(unwrap(commands.runResume(paused.id, add, 0))).rejects.toThrow(
				"the added budget must be a positive number",
			);
		// No budget added: the run stays paused.
		expect(await unwrap(commands.runResume(paused.id, 0, 0))).toBe("Paused");
		expect(await unwrap(commands.runResume(paused.id, 2, 0))).toBe("Working");
		expect(await one("ACME-6")).toMatchObject({ state: "Working", budgetUsd: 5 });
		await expect(unwrap(commands.runResume(paused.id, 1, 0))).rejects.toThrow(
			"refused Resume in Working",
		);
	});

	it("approves or rejects a plan only in PlanReview", async () => {
		const plan = await one("ACME-4");
		await unwrap(commands.runPlanReject(plan.id, "Cover the CSV export too"));
		let r = await one("ACME-4");
		expect(r.state).toBe("Planning");
		expect(r.steps.find((s) => s.id === "plan")?.state).toBe("pending");
		await expect(unwrap(commands.runPlanApprove(plan.id))).rejects.toThrow(
			"refused PlanApproved in Planning",
		);
		await expect(unwrap(commands.runPlanReject(plan.id, ""))).rejects.toThrow(
			"refused PlanRejected in Planning",
		);
		need(mockState().factory.runs.find((x) => x.id === plan.id)).state = "PlanReview";
		await unwrap(commands.runPlanApprove(plan.id));
		r = await one("ACME-4");
		expect(r.state).toBe("Working");
	});

	it("starts a run on a ticket of the mirror", async () => {
		await expect(unwrap(commands.runStart("ACME-3"))).rejects.toThrow("a run is active on ACME-3");
		await expect(unwrap(commands.runStart("ACME-99"))).rejects.toThrow(
			"ACME-99 is not in the mirror: sync first",
		);
		await unwrap(commands.runCancel((await one("ACME-3")).id));
		const id = await unwrap(commands.runStart("ACME-3"));
		expect(id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
		const run = await unwrap(commands.runGetOne(id));
		expect(run).toMatchObject({ key: "ACME-3", state: "Queued", lane: "queued", project: "demo" });
		expect((await unwrap(commands.runLogPage(id, 0, 10))).events).toHaveLength(1);
		expect((await runs())[0]?.id).toBe(id);
		expect(await unwrap(commands.runGetOne("01ARZ3NDEKTSV4RRFFQ69G5FAV"))).toBeNull();
	});

	it("starts nothing without a project", async () => {
		resetMock();
		await expect(unwrap(commands.runStart("ACME-3"))).rejects.toThrow("no project is open");
		expect(await runs()).toEqual([]);
	});

	it("cancels every live run with the kill switch, and keeps the final ones", async () => {
		expect(await unwrap(commands.killSwitchGet())).toBe(false);
		const before = await runs();
		expect(await unwrap(commands.killSwitchSet(true))).toBe(true);
		expect(await unwrap(commands.killSwitchGet())).toBe(true);
		const after = await runs();
		for (const r of after) {
			const was = before.find((b) => b.id === r.id)?.state;
			expect(r.state, r.key).toBe(was === "Failed" || was === "Done" ? was : "Cancelled");
		}
		expect(after.every((r) => r.lane === "done" || r.state === "Failed")).toBe(true);
		// A write cannot go out while the switch is on.
		await expect(unwrap(commands.approvalApprove(1))).rejects.toThrow("kill switch");
		await unwrap(commands.killSwitchSet(false));
		expect(await unwrap(commands.killSwitchGet())).toBe(false);
	});

	it("approves and rejects a write", async () => {
		const [comment, , openPr, push] = await unwrap(commands.approvalsList());
		expect(comment?.kind).toBe("comment");
		// A pull request write waits while the run waits for an answer or when it is final.
		expect(await unwrap(commands.approvalApprove(openPr?.id ?? 0))).toBe("48");
		await expect(unwrap(commands.approvalApprove(openPr?.id ?? 0))).rejects.toThrow(
			`no approval ${openPr?.id} waits`,
		);
		await unwrap(commands.approvalReject(push?.id ?? 0));
		expect(await one("ACME-10")).toMatchObject({ state: "Blocked", returnTo: "ChangesRequested" });
		expect((await unwrap(commands.approvalsList())).map((a) => a.kind)).toEqual([
			"comment",
			"transition",
		]);
		expect(await unwrap(commands.approvalApprove(comment?.id ?? 0))).toMatch(/^comment-/);
	});
});

describe("mock factory: workflows, roles and tiers", () => {
	beforeEach(async () => {
		resetMock();
		await open();
	});

	it("lists the five default workflows with their steps", async () => {
		const list = await unwrap(commands.workflowsList());
		expect(list.map((w) => w.id)).toEqual(["bug", "feature", "review-only", "spec-split", "spike"]);
		expect(list.find((w) => w.id === "feature")?.steps).toEqual([
			"grill",
			"plan",
			"build",
			"review",
			"pr",
		]);
		expect(list.every((w) => w.issue === null)).toBe(true);
		const file = await unwrap(commands.workflowGet("feature"));
		expect(file.text).toContain("id: feature");
		expect(file.workflow?.steps.find((s) => s.id === "plan")?.gate).toBe("human");
		expect(file.workflow?.steps.find((s) => s.id === "build")?.for_each).toBe("plan.tasks");
		expect(file.workflow?.limits).toEqual({ max_turns: 40, budget_usd: 5, stall_s: 300 });
		await expect(unwrap(commands.workflowGet("nope"))).rejects.toThrow("no workflow `nope`");
	});

	it("checks a workflow and refuses an invalid save", async () => {
		const text = (await unwrap(commands.workflowGet("bug"))).text;
		expect(await unwrap(commands.workflowCheck("bug", text))).toBeNull();
		const renamed = text.replace("id: bug", "id: other");
		expect(await unwrap(commands.workflowCheck("bug", renamed))).toEqual({
			file: ".shipyard/workflows/bug.yaml",
			line: 2,
			message: "id `other` differs from the file name `bug`",
		});
		const role = text.replace("role: worker", "role: ghost");
		expect(await unwrap(commands.workflowCheck("bug", role))).toMatchObject({
			line: 11,
			message:
				"step `fix` names the role `ghost`, which has no file in .shipyard/roles and is not a default role",
		});
		await expect(unwrap(commands.workflowWrite("bug", renamed))).rejects.toThrow(
			".shipyard/workflows/bug.yaml:2: id `other` differs",
		);
		await expect(unwrap(commands.workflowWrite("bug", "id: bug\n"))).rejects.toThrow(
			".shipyard/workflows/bug.yaml: the workflow has no step",
		);
		// The refused text left the file as it was.
		expect((await unwrap(commands.workflowGet("bug"))).text).toBe(text);
	});

	it("refuses a bad id and a file that is too big", async () => {
		for (const id of ["Bug", "-x", "a b", "a".repeat(65), ""])
			await expect(unwrap(commands.workflowWrite(id, "id: x"))).rejects.toThrow("is not an id");
		await expect(unwrap(commands.workflowWrite("big", "x".repeat(65 * 1024)))).rejects.toThrow(
			"over 64 KiB",
		);
	});

	it("saves a new workflow, and a role that it needs", async () => {
		const text = "id: lint\nsteps:\n  - id: scan\n    role: linter\n";
		expect(await unwrap(commands.workflowCheck("lint", text))).toMatchObject({ line: 4 });
		const body = "---\nname: linter\ndescription: Runs the linter.\nmodel: small\n---\n\nLint.\n";
		await expect(
			unwrap(commands.roleWrite("linter", body.replace("linter", "other"))),
		).rejects.toThrow(
			".shipyard/roles/linter.md:2: name `other` differs from the file name `linter`",
		);
		await unwrap(commands.roleWrite("linter", body));
		await unwrap(commands.workflowWrite("lint", text));
		const list = await unwrap(commands.workflowsList());
		expect(list.find((w) => w.id === "lint")?.steps).toEqual(["scan"]);
	});

	it("lists the seven default roles and reads one", async () => {
		const roles = await unwrap(commands.rolesList());
		expect(roles.map((r) => r.id)).toEqual([
			"scout",
			"worker",
			"reviewer",
			"planner",
			"tester",
			"docs",
			"triager",
		]);
		expect(roles.every((r) => r.bundled && !r.file)).toBe(true);
		expect(roles.find((r) => r.id === "planner")).toMatchObject({ model: "top", effort: "high" });
		const planner = await unwrap(commands.roleGet("planner"));
		expect(planner.text).toContain("name: planner");
		expect(planner.role?.prompt).toContain("You are the planner");
		await expect(unwrap(commands.roleGet("ghost"))).rejects.toThrow("no role `ghost`");
		await unwrap(
			commands.roleWrite("planner", planner.text.replace("effort: high", "effort: low")),
		);
		expect((await unwrap(commands.rolesList())).find((r) => r.id === "planner")).toMatchObject({
			file: true,
			bundled: true,
			effort: "low",
		});
	});

	it("gives the default tiers and checks a row", async () => {
		const rows = await unwrap(commands.tiersGet());
		expect(rows.map((r) => r.runner)).toEqual(["claude", "codex", "copilot", "gemini", "opencode"]);
		expect(rows[0]).toEqual({ runner: "claude", top: "opus", mid: "sonnet", small: "haiku" });
		expect(rows.slice(1).every((r) => !r.top && !r.mid && !r.small)).toBe(true);
		const saved = await unwrap(
			commands.tiersSet({ runner: "codex", top: " gpt-5@2026+x/y:1 ", mid: "", small: "m.1_2" }),
		);
		expect(saved).toHaveLength(5);
		expect(saved[1]).toEqual({ runner: "codex", top: "gpt-5@2026+x/y:1", mid: "", small: "m.1_2" });
		await expect(
			unwrap(commands.tiersSet({ runner: "vim", top: "", mid: "", small: "" })),
		).rejects.toThrow("unknown runner: vim");
		for (const bad of ["-flag", "has space", "a".repeat(101), "x;y"])
			await expect(
				unwrap(commands.tiersSet({ runner: "claude", top: bad, mid: "", small: "" })),
			).rejects.toThrow("is not a model id");
		expect((await unwrap(commands.tiersGet()))[0]?.top).toBe("opus");
	});
});

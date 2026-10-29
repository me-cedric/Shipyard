import { beforeEach, describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { mockState, resetMock } from "./mock";
import { fold } from "./mock-specs";
import { unwrap } from "./result";

const SPEC = "docs/openspec/changes/add-export/specs/export/spec.md";

/** An open project with a tracker and the fake backlog in the mirror. */
async function withTracker() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const c = await unwrap(
		commands.connectionsAdd({
			name: "Acme",
			group: "tracker",
			kind: "linear",
			url: "",
			user: null,
		}),
	);
	await unwrap(commands.connectionsSetSecret(c.id, "tok-specs-mock"));
	const file = (await unwrap(commands.projectSettings()))?.file;
	if (!file) throw new Error("no project file");
	await unwrap(
		commands.projectFileSave({
			...file,
			connections: { tracker: c.id, forge: null, trackerScope: "ACME" },
		}),
	);
	await unwrap(commands.syncNow());
}

describe("mock specs", () => {
	beforeEach(async () => {
		resetMock();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
	});

	it("seeds three changes and two settled capabilities", async () => {
		expect(
			(await unwrap(commands.specsCapabilities())).map((c) => [c.capability, c.requirements]),
		).toEqual([
			["auth", 3],
			["billing", 2],
		]);
		const ch = await unwrap(commands.specsChanges());
		expect(ch.map((c) => c.id)).toEqual(["add-auth", "add-billing", "add-export"]);
		const status = (id: string) => ch.find((c) => c.id === id)?.artifacts.map((a) => a.status);
		expect(status("add-auth")).toEqual(["draft", "draft", "draft", "draft", "draft"]);
		expect(status("add-billing")).toEqual(["draft", "draft", "draft", "missing", "missing"]);
	});

	it("validates: five done, a partial change, a marker", async () => {
		expect(await unwrap(commands.specsValidate("add-auth"))).toEqual([]);
		const done = (await unwrap(commands.specsChanges())).find((c) => c.id === "add-auth");
		expect(done?.validated).toBe(true);
		expect(done?.artifacts.map((a) => a.status)).toEqual(["done", "done", "done", "done", "done"]);
		const partial = await unwrap(commands.specsValidate("add-billing"));
		expect(partial).toMatchObject([
			{ artifact: "spec", capability: "invoices", message: "REQ-002 has no scenario" },
		]);
		expect(partial[0]?.line).toBeGreaterThan(0);
		const marked = await unwrap(commands.specsValidate("add-export"));
		expect(marked[0]?.message).toContain("Q-035");
		await expect(unwrap(commands.specsValidate("Bad Id"))).rejects.toThrow("invalid change id");
	});

	it("forgets a validation after a write and creates a change once", async () => {
		await unwrap(commands.specsValidate("add-auth"));
		const { text, stamp } = await unwrap(
			commands.specsRead("docs/openspec/changes/add-auth/proposal.md"),
		);
		await unwrap(
			commands.specsWrite("docs/openspec/changes/add-auth/proposal.md", `${text}x\n`, stamp, false),
		);
		expect(
			(await unwrap(commands.specsChanges())).find((c) => c.id === "add-auth")?.validated,
		).toBe(false);
		expect((await unwrap(commands.specsChangeCreate("add-new"))).artifacts[0]?.status).toBe(
			"draft",
		);
		await expect(unwrap(commands.specsChangeCreate("add-new"))).rejects.toThrow(
			"change add-new exists",
		);
	});

	it("keeps the RAID file when a save names an unknown kind or status", async () => {
		const list = await unwrap(commands.specsQuestions());
		expect(list.map((e) => [e.question.id, e.question.status])).toContainEqual([
			"Q-034",
			"withdrawn",
		]);
		const e = list.find((x) => x.question.id === "Q-020");
		if (!e) throw new Error("no Q-020");
		const before = await unwrap(commands.specsRead(e.path));
		await expect(
			unwrap(commands.specsQuestionSave(e.path, { ...e.question, kind: "idea" }, before.stamp)),
		).rejects.toThrow("unknown kind: idea");
		await expect(
			unwrap(commands.specsQuestionSave(e.path, { ...e.question, status: "closed" }, before.stamp)),
		).rejects.toThrow("unknown status: closed");
		expect(await unwrap(commands.specsRead(e.path))).toEqual(before);
		const ok = await unwrap(
			commands.specsQuestionSave(e.path, { ...e.question, status: "answered" }, before.stamp),
		);
		expect(ok.conflict).toBe(false);
		await expect(
			unwrap(commands.specsQuestionSave(e.path, { ...e.question, id: "Q-012" }, ok.stamp)),
		).rejects.toThrow("duplicate id Q-012");
	});

	it("creates a question with the next id and refuses a duplicate", async () => {
		const q = {
			id: "",
			kind: "risk",
			status: "open",
			raisedAt: "",
			raisedBy: "",
			owner: "",
			specRef: "",
			taskRef: "",
			ticket: "",
			title: "New",
			body: "",
		};
		expect(await unwrap(commands.specsQuestionCreate(q))).toBe("docs/delivery/questions/Q-036.md");
		await expect(unwrap(commands.specsQuestionCreate({ ...q, id: "Q-012" }))).rejects.toThrow(
			"duplicate id Q-012",
		);
	});

	it("reports the test plans, the broken citation and the uncovered requirement", async () => {
		const plans = await unwrap(commands.specsTestplans());
		expect(plans.map((p) => [p.title, p.scenarios, p.broken])).toEqual([
			["Login", 3, ["spec:auth#REQ-009"]],
			["Invoice", 2, []],
		]);
		expect(await unwrap(commands.specsCoverage("auth"))).toEqual(["spec:auth#REQ-002"]);
		expect(await unwrap(commands.specsCoverage("billing"))).toEqual([]);
	});

	it("folds an answer after a click and refuses a stale stamp", async () => {
		const first = await unwrap(commands.specsRead(SPEC));
		const moved = await unwrap(commands.specsWrite(SPEC, `${first.text}\n`, first.stamp, false));
		const stamp = moved.stamp ?? "";
		// The stamp of the first read is old now: nothing is folded.
		expect(
			(await unwrap(commands.specsFold(SPEC, "Q-035", "CSV", first.stamp, true))).conflict,
		).toBe(true);
		expect((await unwrap(commands.specsRead(SPEC))).text).toContain("NEEDS CLARIFICATION");
		await expect(unwrap(commands.specsFold(SPEC, "Q-035", "CSV", stamp, false))).rejects.toThrow(
			"this change needs the click of a person",
		);
		const w = await unwrap(commands.specsFold(SPEC, "Q-035", "CSV", stamp, true));
		expect(w.conflict).toBe(false);
		const { text } = await unwrap(commands.specsRead(SPEC));
		expect(text).toContain("export a report in CSV.");
		expect(text).not.toContain("NEEDS CLARIFICATION");
		expect(text).toContain("### Clarifications\n\n- Q-035 Which export formats ship first?: CSV");
		await expect(unwrap(commands.specsFold(SPEC, "Q-035", "CSV", stamp, true))).rejects.toThrow(
			"no marker cites Q-035",
		);
		await expect(
			unwrap(commands.specsFold(SPEC, "Q-099", "x", w.stamp ?? "", true)),
		).rejects.toThrow("no question Q-099");
		await expect(
			unwrap(commands.specsFold("docs/openspec/constitution.md", "Q-035", "x", "1", true)),
		).rejects.toThrow("not a spec");
	});

	it("puts the line of a second answer in the same block", () => {
		const spec =
			"## Purpose\n\nx [NEEDS CLARIFICATION: Q-001 a] y [NEEDS CLARIFICATION: Q-002 b]\n\n### Clarifications\n\n- Q-001 a: one\n\n## Requirements\n";
		expect(fold(spec, "Q-002", "b", "two")).toBe(
			"## Purpose\n\nx [NEEDS CLARIFICATION: Q-001 a] y two\n\n### Clarifications\n\n- Q-001 a: one\n- Q-002 b: two\n\n## Requirements\n",
		);
		expect(() => fold(spec, "Q-00", "b", "two")).toThrow("no marker cites Q-00");
	});

	it("applies a split once, with the row ref as a label, and creates no duplicate", async () => {
		await expect(unwrap(commands.specsSplitPreview("add-auth"))).rejects.toThrow(
			"the project has no tracker connection",
		);
		await withTracker();
		const draft = await unwrap(commands.specsSplitDraft("add-auth"));
		expect(draft.items.map((i) => i.rowId)).toEqual([
			"sessions",
			"sessions-req-001",
			"sessions-req-002",
		]);
		const preview = await unwrap(commands.specsSplitPreview("add-auth"));
		expect(preview.problems).toEqual([]);
		expect(preview.rows.map((r) => r.action)).toEqual(["create", "create", "create"]);
		await expect(unwrap(commands.specsSplitApply("add-auth", false))).rejects.toThrow(
			"this change needs the click of a person",
		);
		const before = mockState().sync.mirror.length;
		const first = await unwrap(commands.specsSplitApply("add-auth", true));
		expect(first.map((r) => r.action)).toEqual(["create", "create", "create"]);
		const made = mockState().sync.mirror.filter((t) =>
			t.labels.some((l) => l.startsWith("est:add-auth#")),
		);
		expect(made.map((t) => t.labels)).toEqual([
			["est:add-auth#sessions"],
			["est:add-auth#sessions-req-001"],
			["est:add-auth#sessions-req-002"],
		]);
		const second = await unwrap(commands.specsSplitApply("add-auth", true));
		expect(second.map((r) => r.action)).toEqual(["unchanged", "unchanged", "unchanged"]);
		expect(mockState().sync.mirror).toHaveLength(before + 3);
	});

	it("refuses a draft with a problem and keeps a saved draft", async () => {
		await withTracker();
		const d = await unwrap(commands.specsSplitDraft("add-auth"));
		await unwrap(
			commands.specsSplitSave({
				...d,
				items: [
					...d.items,
					{
						rowId: "x",
						kind: "story",
						title: "X",
						description: "",
						reqs: ["spec:auth#REQ-099"],
						parent: "none",
					},
				],
			}),
		);
		expect((await unwrap(commands.specsSplitDraft("add-auth"))).items).toHaveLength(4);
		await expect(unwrap(commands.specsSplitApply("add-auth", true))).rejects.toThrow(
			"x: parent missing; x: unknown ref spec:auth#REQ-099",
		);
	});

	it("archives a change with open items only when confirmed", async () => {
		await withTracker();
		await unwrap(commands.specsSplitApply("add-auth", true));
		await expect(unwrap(commands.specsArchive("add-auth", false))).rejects.toThrow(
			"open items: ACME-1",
		);
		expect(await unwrap(commands.specsArchive("add-auth", true))).toEqual(["sessions"]);
		expect((await unwrap(commands.specsChanges())).map((c) => c.id)).toEqual([
			"add-billing",
			"add-export",
		]);
		expect((await unwrap(commands.specsCapabilities())).map((c) => c.capability)).toContain(
			"sessions",
		);
	});

	it("shows the specs, the tests and a work item in the backlinks", async () => {
		await withTracker();
		const kinds = (ref: string) =>
			unwrap(commands.refsBacklinks(ref)).then((g) =>
				g.map((x) => [x.kind, x.items.map((i) => i.source)]),
			);
		expect(await kinds("adr:0004")).toEqual([
			["change", ["change:add-auth"]],
			[
				"doc",
				[
					"doc:docs/designs/design.md",
					"doc:docs/handbook/architecture/overview.md",
					"doc:docs/documents/client-brief.md",
					"doc:docs/slides/kickoff.md",
				],
			],
			["spec", ["spec:auth", "spec:billing"]],
		]);
		expect(await kinds("spec:auth#REQ-003")).toEqual([
			["test", ["test:auth-login"]],
			["wi", ["wi:ACME-1"]],
		]);
		expect(await unwrap(commands.refsResolve("spec:auth#REQ-003"))).toMatchObject({
			state: "resolved",
			title: "Login",
		});
		expect(await unwrap(commands.refsResolve("q:Q-035"))).toMatchObject({
			state: "resolved",
			status: "open",
		});
		expect(await unwrap(commands.refsResolve("spec:auth#REQ-009"))).toMatchObject({
			state: "broken",
		});
	});
});

import { describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { mockState, resetMock } from "./mock";
import { emptyWork } from "./mock-work";
import { unwrap } from "./result";

/** An open project with a tracker and a full mirror (the fake tracker of the sync mock). */
async function withTracker(scope: string | null = "ACME") {
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
	await unwrap(commands.connectionsSetSecret(c.id, "tok-work-mock"));
	const settings = await unwrap(commands.projectSettings());
	if (!settings?.file) throw new Error("no project file");
	await unwrap(
		commands.projectFileSave({
			...settings.file,
			connections: { tracker: c.id, forge: null, trackerScope: scope },
		}),
	);
	await unwrap(commands.syncNow());
}

const slugs = ["mvp-1", "mvp-2"];

describe("mock work: the seed", () => {
	beforeEach(() => resetMock());

	it("seeds a team of five, two sheets, a plan and time entries", async () => {
		await withTracker();
		const team = await unwrap(commands.workTeam());
		expect(team.team.members.map((m) => m.handle)).toEqual([
			"ada",
			"grace",
			"alan",
			"margaret",
			"edsger",
		]);
		const sheets = await unwrap(commands.estimateList());
		expect(sheets.map((s) => [s.slug, s.state])).toEqual([
			["mvp-1", "ready"],
			["mvp-2", "ready"],
		]);
		const plan = await unwrap(commands.planGet("mvp-1"));
		expect(plan.gantt.bars.length).toBeGreaterThan(5);
		// The fixed start and the member choice of the decision file hold.
		const web = plan.gantt.bars.find((b) => b.task === "est:mvp-1#auth-web");
		expect(web).toMatchObject({ member: "grace", start: "2026-11-09" });
		const time = await unwrap(commands.timeList(null, "2026-11"));
		expect(time.member).toBe("ada");
		expect(time.rows.map((r) => r.state)).toEqual(["in-tracker", "to-send", "to-send"]);
	});

	it("keeps the summary, the spread and the portfolio equal and computes a percent task", async () => {
		await withTracker();
		const a = await unwrap(commands.estimateGet("mvp-1"));
		const b = await unwrap(commands.estimateGet("mvp-2"));
		// The build tasks of MVP 1 hold 18 days of effort: the test pass is 25 % of them.
		expect(a.days["auth-test"]).toBe(4.5);
		const spreadDays = (v: typeof a) => v.spread.reduce((n, m) => n + (m.days ?? 0), 0);
		expect(spreadDays(a)).toBeCloseTo(a.totals.days ?? 0, 6);
		const p = await unwrap(commands.estimatePortfolio());
		expect(p.total.days).toBeCloseTo((a.totals.days ?? 0) + (b.totals.days ?? 0), 6);
		expect(p.total.price).toBeCloseTo((a.totals.price ?? 0) + (b.totals.price ?? 0), 6);
		expect(a.totals.price).toBeCloseTo((a.totals.cost ?? 0) * 1.15, 6);
		// A task that names a ticket shows the original estimate of the ticket.
		expect(a.tickets.map((t) => [t.task, t.key, t.estimateMinutes])).toEqual([
			["auth-api", "ACME-2", 1920],
			["auth-web", "ACME-1", 960],
		]);
	});

	it("moves the plan when the team changes and refuses a duplicate handle", async () => {
		await withTracker();
		const before = await unwrap(commands.planGet("mvp-1"));
		const view = await unwrap(commands.workTeam());
		const dev = view.team.members.filter((m) => m.role === "dev");
		for (const m of dev) m.availability = { absences: [{ from: "2026-11-02", to: "2026-11-13" }] };
		await unwrap(commands.workTeamSave(view.team));
		const after = await unwrap(commands.planGet("mvp-1"));
		expect(after.gantt.bars.find((b) => b.role === "dev")?.start).not.toBe(
			before.gantt.bars.find((b) => b.role === "dev")?.start,
		);
		const dup = structuredClone(view.team);
		const second = dup.members[1];
		if (second) second.handle = "ada";
		await expect(unwrap(commands.workTeamSave(dup))).rejects.toMatchObject({
			details: expect.stringContaining("ada"),
		});
	});
});

describe("mock work: the rules of the Rust commands", () => {
	beforeEach(() => resetMock());

	it("writes to the tracker only on a click, and ranks members without assigning", async () => {
		await withTracker();
		const ranked = await unwrap(commands.workSuggest("ACME-3"));
		expect(ranked).toHaveLength(5);
		expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.assignee).toBeNull();
		await expect(unwrap(commands.workAssign("ACME-3", "grace", false))).rejects.toMatchObject({
			details: expect.stringContaining("click"),
		});
		await unwrap(commands.workAssign("ACME-3", "grace", true));
		const rows = await unwrap(commands.syncItems({}));
		expect(rows.find((t) => t.key === "ACME-3")).toMatchObject({
			assignee: "Grace Hopper",
			member: "grace",
		});
		await expect(unwrap(commands.workAssign("ACME-3", "zed", true))).rejects.toMatchObject({
			details: expect.stringContaining("unknown member"),
		});
		await unwrap(commands.workMark("ACME-3", true));
		expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.labels).toContain("shipyard");
		await expect(unwrap(commands.workTransition("ACME-3", "Archived", true))).rejects.toMatchObject(
			{ details: expect.stringContaining("refused") },
		);
		await unwrap(commands.workTransition("ACME-3", "Done", true));
		expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.category).toBe("done");
	});

	it("removes a label and sets a priority only on a click and with a known value", async () => {
		await withTracker();
		await unwrap(commands.workTicketLabelAdd("ACME-3", "old", true));
		await expect(
			unwrap(commands.workTicketLabelRemove("ACME-3", "old", false)),
		).rejects.toMatchObject({ details: expect.stringContaining("click") });
		await expect(
			unwrap(commands.workTicketLabelRemove("ACME-3", "two words", true)),
		).rejects.toMatchObject({ details: expect.stringContaining("one word") });
		await unwrap(commands.workTicketLabelRemove("ACME-3", "old", true));
		expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.labels).not.toContain("old");
		await unwrap(commands.workTicketPrioritySet("ACME-3", "high", true));
		await expect(
			unwrap(commands.workTicketPrioritySet("ACME-3", "urgent", true)),
		).rejects.toMatchObject({ details: expect.stringContaining("not a priority") });
		expect((await unwrap(commands.workTicketEditCaps())).priority).toBe(true);
	});

	it("seals, locks and refuses a wrong passphrase", async () => {
		await withTracker();
		// A third developer with a rate: a cost shows only for a role of three (`work::MIN_RATED`).
		const [ada] = mockState().work.team.members;
		if (ada)
			mockState().work.team.members.push({ ...ada, name: "Linus", handle: "linus", trackers: [] });
		await unwrap(commands.workSeal("pass phrase"));
		await unwrap(commands.workLock());
		expect(await unwrap(commands.workSealState())).toEqual({ sealed: true, unlocked: false });
		expect((await unwrap(commands.estimateList())).every((s) => s.state === "locked")).toBe(true);
		await expect(unwrap(commands.estimateGet("mvp-1"))).rejects.toMatchObject({
			details: expect.stringContaining("no passphrase"),
		});
		const team = await unwrap(commands.workTeam());
		expect(team.locked).toBe(true);
		expect(team.team.members.every((m) => m.dayRate == null)).toBe(true);
		await expect(unwrap(commands.workTeamSave(team.team))).rejects.toMatchObject({
			details: expect.stringContaining("no passphrase"),
		});
		await expect(unwrap(commands.workUnlock("wrong"))).rejects.toMatchObject({
			details: expect.stringContaining("does not open"),
		});
		expect((await unwrap(commands.workUnlock("pass phrase"))).unlocked).toBe(true);
		expect((await unwrap(commands.estimateGet("mvp-1"))).totals.price).toBeGreaterThan(0);
		await unwrap(commands.workUnseal("pass phrase"));
		expect(await unwrap(commands.workSealState())).toEqual({ sealed: false, unlocked: false });
	});

	it("previews an Excel import and replaces a sheet only after the confirm", async () => {
		await withTracker();
		const pv = await unwrap(commands.excelPreview("/files/bad.xlsx", null));
		expect(pv.refused).toEqual([{ row: 7, reason: "the effort is not a number" }]);
		expect(mockState().work.sheets.import).toBeUndefined();
		await expect(unwrap(commands.excelConfirm("import", false))).rejects.toMatchObject({
			details: expect.stringContaining("confirmation"),
		});
		expect(mockState().work.sheets.import).toBeUndefined();
		const v = await unwrap(commands.excelConfirm("import", true));
		expect(v.sheet.name).toBe("Imported lot");
		await expect(unwrap(commands.excelConfirm("import", true))).rejects.toMatchObject({
			details: expect.stringContaining("no import"),
		});
		for (const bad of ["lot.xlsx", "/files/a.csv", "/files/missing.xlsx"])
			await expect(unwrap(commands.excelPreview(bad, null))).rejects.toThrow();
		await unwrap(commands.excelExport("mvp-1", "/files/out.xlsx"));
		expect(mockState().work.exports).toEqual([{ slug: "mvp-1", path: "/files/out.xlsx" }]);
	});

	it("previews, applies row by row, keeps earlier rows on a failure and creates no duplicate", async () => {
		await withTracker();
		const pv = await unwrap(commands.applyPreview(slugs));
		expect(pv.every((d) => d.action === "create")).toBe(true);
		expect(Object.keys(mockState().work.written)).toHaveLength(0);
		await expect(unwrap(commands.applyRun(slugs, false))).rejects.toMatchObject({
			details: expect.stringContaining("click"),
		});
		mockState().work.failRows = ["est:mvp-1#auth-api"];
		const out = await unwrap(commands.applyRun(slugs, true));
		expect(out.filter((r) => r.error)).toHaveLength(1);
		expect(out.find((r) => r.reference === "est:mvp-1#auth")?.key).toMatch(/^ACME-/);
		// The second apply writes the failed row only.
		mockState().work.failRows = [];
		const again = await unwrap(commands.applyRun(slugs, true));
		expect(again.filter((r) => r.action === "create").map((r) => r.reference)).toEqual([
			"est:mvp-1#auth-api",
		]);
		expect(
			(await unwrap(commands.applyPreview(slugs))).every((d) => d.action === "unchanged"),
		).toBe(true);
		// One edit of the sheet: the preview reads the new effort.
		const sheet = structuredClone((await unwrap(commands.estimateGet("mvp-1"))).sheet);
		const api = sheet.features[0]?.tasks.find((t) => t.id === "auth-api");
		if (api) api.days = 9;
		await unwrap(commands.estimateSave("mvp-1", sheet));
		const upd = (await unwrap(commands.applyPreview(["mvp-1"]))).find((d) => d.action === "update");
		expect(upd).toMatchObject({ key: expect.any(String), changes: ["estimate"] });
	});

	it("creates one item from a ref on one click and none on the second", async () => {
		await withTracker();
		const row = {
			reference: "diagram:context",
			kind: "story" as const,
			title: "Draw the context",
			description: "",
			days: null,
			parent: null,
		};
		await expect(unwrap(commands.workItemCreate(row, false))).rejects.toMatchObject({
			details: expect.stringContaining("click"),
		});
		const made = await unwrap(commands.workItemCreate(row, true));
		expect(made.key).toMatch(/^ACME-/);
		expect((await unwrap(commands.workItemPreview(row))).action).toBe("unchanged");
		expect((await unwrap(commands.workItemCreate(row, true))).action).toBe("unchanged");
		await expect(
			unwrap(commands.workItemCreate({ ...row, reference: "not a ref" }, true)),
		).rejects.toMatchObject({ details: expect.stringContaining("not a ref") });
	});

	it("never double counts a worklog: a lost answer is found again by its mark", async () => {
		await withTracker();
		const e = await unwrap(commands.timeAdd(null, "2026-11-04", 90, "review", "wi:ACME-1"));
		await expect(
			unwrap(commands.timeAdd(null, "2026-11-04", 90, "x", "ACME-404")),
		).rejects.toMatchObject({ details: expect.stringContaining("not in the mirror") });
		await expect(
			unwrap(commands.timeSend(null, e.day, e.id, 60, true, false)),
		).rejects.toMatchObject({ details: expect.stringContaining("click") });
		mockState().work.loseNextAnswer = true;
		await expect(
			unwrap(commands.timeSend(null, e.day, e.id, 60, true, true)),
		).rejects.toMatchObject({ details: expect.stringContaining("answer was lost") });
		const rows = await unwrap(commands.timeFetch(null, "ACME-1"));
		const mine = rows.find((r) => r.entry?.id === e.id);
		expect(mine).toMatchObject({ lostReceipt: true, state: "in-tracker" });
		const logs = mockState().work.logs["ACME-1"]?.length ?? 0;
		const sent = await unwrap(commands.timeSend(null, e.day, e.id, 60, true, true));
		expect(sent.alreadyThere).toBe(true);
		expect(mockState().work.logs["ACME-1"]?.length).toBe(logs);
		// A worklog that only the tracker holds shows as such. An entry with a receipt is not sent again.
		expect(rows.some((r) => r.state === "only-in-tracker")).toBe(true);
		await expect(
			unwrap(commands.timeSend(null, e.day, e.id, 60, true, true)),
		).rejects.toMatchObject({ details: expect.stringContaining("receipt") });
	});

	it("refuses a time entry that has no member", async () => {
		resetMock({ work: emptyWork() });
		await withTracker();
		await expect(unwrap(commands.timeAdd(null, "2026-11-04", 30, "", null))).rejects.toMatchObject({
			details: expect.stringContaining("cannot resolve the member"),
		});
		expect(await unwrap(commands.estimateList())).toEqual([]);
		expect((await unwrap(commands.workTeam())).team.members).toEqual([]);
	});

	it("resolves members and sheets and lists their backlinks", async () => {
		await withTracker();
		expect(await unwrap(commands.refsResolve("member:ada"))).toMatchObject({
			state: "resolved",
			title: "Ada Lovelace",
		});
		expect((await unwrap(commands.refsResolve("est:mvp-1#auth-api")))?.title).toBe("Token API");
		expect((await unwrap(commands.refsSearch("lovelace", 5))).map((h) => h.ref)).toContain(
			"member:ada",
		);
		const groups = await unwrap(commands.refsBacklinks("member:grace"));
		expect(groups.map((g) => g.kind).sort()).toEqual(["est", "wi"]);
		// The sheet that names the ticket is a backlink of the ticket.
		expect(
			(await unwrap(commands.refsBacklinks("wi:ACME-1"))).flatMap((g) =>
				g.items.map((i) => i.source),
			),
		).toEqual(["est:mvp-1"]);
	});

	it("tells the views the tracker, the flags, the scope, the label and the member", async () => {
		await withTracker("ACME");
		expect(await unwrap(commands.workContext(0))).toMatchObject({
			tracker: "acme",
			scope: "ACME",
			pickupLabel: "shipyard",
			me: "ada",
			today: "2026-11-02",
		});
	});
});

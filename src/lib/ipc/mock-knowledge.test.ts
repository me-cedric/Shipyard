import { beforeEach, describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { resetMock } from "./mock";
import { unwrap } from "./result";

const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const text = (n: number) => ({
	title: "Dossier",
	empty: "Nothing",
	gap: "Gap",
	generated: "Generated",
	sections: Array.from({ length: n }, (_, i) => `S${i}`),
});

describe("mock knowledge", () => {
	beforeEach(async () => {
		resetMock();
		await open();
	});

	it("fails without a project", async () => {
		resetMock();
		await expect(unwrap(commands.graphGet())).rejects.toMatchObject({
			details: expect.stringContaining("no active project"),
		});
	});

	it("draws the graph with the orphan and stale marks and no dangling edge", async () => {
		const g = await unwrap(commands.graphGet());
		const refs = new Set(g.nodes.map((n) => n.ref));
		expect(refs).toContain("doc:docs/handbook/getting-started.md");
		expect(g.edges.length).toBeGreaterThan(0);
		for (const e of g.edges) expect([refs.has(e.source), refs.has(e.target)]).toEqual([true, true]);
		const node = (r: string) => g.nodes.find((n) => n.ref === r);
		expect(node("spec:auth")?.stale).toBe(true);
		expect(node("adr:0004")).toMatchObject({ orphan: false, stale: false });
		expect(g.nodes.some((n) => n.orphan)).toBe(true);
	});

	it("switches to the code graph and builds the index on demand", async () => {
		const g = await unwrap(commands.graphCode());
		expect(g.state).toBe("ready");
		expect(g.nodes.map((n) => n.kind)).toEqual(expect.arrayContaining(["file", "symbol"]));
		const refs = new Set(g.nodes.map((n) => n.ref));
		for (const e of g.edges) expect([refs.has(e.source), refs.has(e.target)]).toEqual([true, true]);
		expect(await unwrap(commands.graphCodeIndex())).toBeNull();
	});

	it("explains an entity from its one hop and flags an unknown entity", async () => {
		const c = await unwrap(commands.explainContextGet("@adr:0004"));
		expect(c.found).toBe(true);
		expect(c.refs[0]?.ref).toBe("adr:0004");
		expect(c.refs.map((r) => r.ref)).toContain("doc:docs/handbook/architecture/overview.md");
		const none = await unwrap(commands.explainContextGet("adr:9999"));
		expect(none).toMatchObject({ found: false });
		expect(none.refs).toHaveLength(1);
	});

	it("lists, reads and writes pages, and warns on a changed file", async () => {
		const l = await unwrap(commands.docListGet());
		expect(l.handbook.map((p) => p.title)).toEqual([
			"Architecture overview",
			"Getting started",
			"Release",
		]);
		expect(l.slides.map((p) => p.path)).toEqual(["docs/slides/kickoff.md"]);
		const created = await unwrap(
			commands.docWriteOne("docs/handbook/new.md", "# New\n", null, true),
		);
		const again = await unwrap(
			commands.docWriteOne("docs/handbook/new.md", "# New 2\n", "9", false),
		);
		expect(again).toMatchObject({ conflict: true, stamp: created.stamp });
		expect((await unwrap(commands.docListGet())).handbook).toHaveLength(4);
		await expect(
			unwrap(commands.docWriteOne("docs/decisions/x.md", "x", null, true)),
		).rejects.toMatchObject({ details: expect.stringMatching(/path not allowed/) });
		await expect(
			unwrap(commands.docWriteOne("docs/handbook/x.txt", "x", null, true)),
		).rejects.toMatchObject({ details: expect.stringContaining("a page is a .md file") });
	});

	it("splits a deck on separators outside code and keeps the project theme", async () => {
		const deck = await commands.slideParse("# A\n---\n```\n---\n```\n---\nB\n");
		expect(deck.slides).toHaveLength(3);
		const kickoff = await unwrap(commands.docReadOne("docs/slides/kickoff.md"));
		expect((await commands.slideParse(kickoff.text)).slides).toHaveLength(5);
		const t = await unwrap(commands.slideThemeGet());
		expect(t).toMatchObject({ readOnly: false, value: { accent: "#2563eb" } });
		await expect(unwrap(commands.slideThemeSet({ accent: "red" }, t.stamp))).rejects.toMatchObject({
			details: expect.stringContaining("not a colour: red"),
		});
	});

	it("saves a dashboard and refuses a file of a newer version", async () => {
		expect((await unwrap(commands.dashboardListGet())).map((d) => d.slug)).toEqual(["team"]);
		const d = await unwrap(commands.dashboardGetOne("team"));
		expect(d.value.tiles).toHaveLength(4);
		const moved = { ...d.value, tiles: d.value.tiles.map((t) => ({ ...t, x: 1 })) };
		await unwrap(commands.dashboardSaveOne("team", moved, d.stamp));
		expect((await unwrap(commands.dashboardGetOne("team"))).value.tiles[0]?.x).toBe(1);
		await unwrap(commands.docWriteOne("docs/handbook/a.md", "# A\n", null, true));
		const bad = { ...moved, tiles: [{ id: "a", kind: "nope", x: 0, y: 0, w: 1, h: 1 }] };
		await expect(unwrap(commands.dashboardSaveOne("team", bad, null))).rejects.toMatchObject({
			details: expect.stringContaining("unknown tile: nope"),
		});
		await expect(unwrap(commands.dashboardGetOne("../x"))).rejects.toMatchObject({
			details: expect.stringMatching(/not a dashboard name/),
		});
	});

	it("gives a tile its numbers as a table and names a source that is off", async () => {
		const t = await unwrap(commands.dashboardTile("questions"));
		expect(t.columns).toEqual(["status", "count"]);
		expect(t.rows).toEqual(expect.arrayContaining([["open", "3"]]));
		expect(await unwrap(commands.dashboardTile("quality"))).toMatchObject({ off: "quality" });
		await expect(unwrap(commands.dashboardTile("nope"))).rejects.toMatchObject({
			details: expect.stringContaining("unknown tile: nope"),
		});
	});

	it("orders the learning path and reads the glossary", async () => {
		const l = await unwrap(commands.learnGet());
		const rank = l.path.map((s) => ["model", "adr", "spec"].indexOf(s.kind));
		expect(rank).toEqual([...rank].sort());
		expect(rank).not.toContain(-1);
		expect(l.path.map((s) => s.ref)).toEqual(
			expect.arrayContaining(["model:system", "adr:0001", "spec:auth"]),
		);
		expect(l.path.findIndex((s) => s.kind === "model")).toBe(0);
		expect(l.glossary.map((g) => g.term)).toEqual(["invoice", "login", "session"]);
		expect(l.glossary[1]).toMatchObject({ spec: "spec:auth" });
	});

	it("checks the export titles and the file kind", async () => {
		expect(await unwrap(commands.exportDossierFile(text(5), [], "/tmp/d.docx"))).toBeNull();
		await expect(
			unwrap(commands.exportDossierFile(text(4), [], "/tmp/d.docx")),
		).rejects.toMatchObject({ details: expect.stringContaining("expected 5 section titles") });
		await expect(
			unwrap(commands.exportFunctionalFile(text(4), "/tmp/d.pdf")),
		).rejects.toMatchObject({ details: expect.stringContaining("the file is not a .docx file") });
		expect(await unwrap(commands.exportSheetFile(text(0), [], "/tmp/s.xlsx"))).toBeNull();
	});
});

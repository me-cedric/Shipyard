import { beforeEach, describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { mockState, resetMock } from "./mock";
import { unwrap } from "./result";

const text = (n = 0) => ({
	title: "Report",
	empty: "Nothing",
	gap: "Gap",
	generated: "Generated",
	sections: Array.from({ length: n }, (_, i) => `S${i}`),
});
const done = () => mockState().reports;

describe("mock client exports", () => {
	beforeEach(async () => {
		resetMock();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
	});

	it("fails without a project", async () => {
		resetMock();
		await expect(unwrap(commands.exportRaidFile(text(), "/tmp/r.xlsx", true))).rejects.toThrow(
			"no active project",
		);
	});

	it("writes nothing without a click and checks the kind of the file", async () => {
		await expect(unwrap(commands.exportCostingFile(text(), "/tmp/c.xlsx", false))).rejects.toThrow(
			"click",
		);
		await expect(unwrap(commands.exportFlowsFile(text(), "/tmp/f.xls", true))).rejects.toThrow(
			".xlsx",
		);
		await expect(
			unwrap(commands.exportGanttFile(text(), "plan", "/tmp/g.xlsx", true)),
		).rejects.toThrow();
		expect(done().exported).toEqual([]);
		await unwrap(commands.exportCostingFile(text(), "/tmp/c.xlsx", true));
		await unwrap(commands.exportRaidFile(text(), "/tmp/r.xlsx", true));
		await unwrap(commands.exportSecurityFile(text(), "/tmp/s.xlsx", true));
		await unwrap(commands.exportFlowsFile(text(), "/tmp/f.xlsx", true));
		expect(done().exported.map((e) => e.kind)).toEqual(["costing", "raid", "security", "flows"]);
	});

	it("exports the plan of a sheet that exists and refuses one that does not", async () => {
		const slug = Object.keys(mockState().work.sheets)[0] ?? "";
		expect(slug).not.toBe("");
		await unwrap(commands.exportScheduleFile(text(), slug, "/tmp/p.xlsx", true));
		await unwrap(commands.exportGanttFile(text(), slug, "/tmp/p.svg", true));
		await expect(
			unwrap(commands.exportScheduleFile(text(), "nope", "/tmp/n.xlsx", true)),
		).rejects.toThrow("no sheet");
		expect(done().exported.map((e) => e.kind)).toEqual(["schedule", "gantt"]);
	});

	it("needs seven titles for the complete dossier", async () => {
		await expect(
			unwrap(commands.exportDossierCompleteFile(text(5), [], "/tmp/d.docx", true)),
		).rejects.toThrow("expected 7 section titles");
		await unwrap(commands.exportDossierCompleteFile(text(7), [], "/tmp/d.docx", true));
		expect(done().exported[0]).toEqual({ kind: "dossier-complete", path: "/tmp/d.docx" });
	});

	it("requires a real period and a ref for the work done", async () => {
		const run = (base: string, from: string, to: string) =>
			unwrap(commands.exportWorkDoneFile(text(), base, "HEAD", from, to, "/tmp/w.xlsx", true));
		const bad: [string, string][] = [
			["", ""],
			["2026-10-31", "2026-10-01"],
			["2026-02-30", "2026-03-01"],
		];
		for (const [from, to] of bad) await expect(run("main", from, to)).rejects.toThrow("period");
		await expect(run("--all", "2026-10-01", "2026-10-31")).rejects.toThrow("not a ref");
		await run("main", "2026-10-01", "2026-10-31");
		expect(done().exported).toHaveLength(1);
	});

	it("numbers the change requests and keeps the read-only lock", async () => {
		const run = (title: string, click = true) =>
			unwrap(commands.exportChangeRequestFiles(title, "main", "HEAD", ["Ada"], click));
		await expect(run("Add export", false)).rejects.toThrow("click");
		await expect(run("   ")).rejects.toThrow("title");
		expect(await run("Add  export")).toEqual({
			id: "CR-001",
			markdown: "docs/delivery/change-requests/CR-001.md",
			docx: "docs/delivery/change-requests/CR-001.docx",
		});
		expect((await run("Second")).id).toBe("CR-002");
		const o = await unwrap(commands.projectsActive());
		expect(o).not.toBeNull();
		mockState().projects.forEach((p) => {
			if (p.active) p.overrides.readOnly = true;
		});
		await expect(run("Third")).rejects.toThrow("read only");
		await expect(
			unwrap(commands.exportCostingFile(text(), "/mock/alpha/docs/c.xlsx", true)),
		).rejects.toThrow("read only");
		await unwrap(commands.exportCostingFile(text(), "/tmp/c.xlsx", true));
	});
});

describe("mock terminal launcher", () => {
	beforeEach(async () => {
		resetMock();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
	});

	it("lists the installed apps and keeps the choice in the preferences", async () => {
		expect((await unwrap(commands.terminalApps())).map((a) => a.id)).toEqual([
			"apple-terminal",
			"iterm2",
			"kitty",
		]);
		const p = await unwrap(commands.prefsSet({ terminalApp: " iterm2;rm " }));
		expect(p.terminalApp).toBe("iterm2rm");
		expect((await unwrap(commands.prefsGet())).terminalApp).toBe("iterm2rm");
	});

	it("needs a click, a known and installed app, and a folder inside the project", async () => {
		await expect(unwrap(commands.terminalLaunch("", false))).rejects.toThrow("click");
		for (const bad of ["..", "../x", "/etc", "src/../../x"])
			await expect(unwrap(commands.terminalLaunch(bad, true))).rejects.toThrow(
				"not a folder of the project",
			);
		await unwrap(commands.terminalLaunch("src", true));
		expect(done().launched).toEqual([{ id: "apple-terminal", folder: "src" }]);
		await unwrap(commands.prefsSet({ terminalApp: "kitty" }));
		await unwrap(commands.terminalLaunch("/mock/alpha/docs", true));
		await unwrap(commands.prefsSet({ terminalApp: "warp" }));
		await expect(unwrap(commands.terminalLaunch("", true))).rejects.toThrow("not installed");
		await unwrap(commands.prefsSet({ terminalApp: "nope" }));
		await expect(unwrap(commands.terminalLaunch("", true))).rejects.toThrow("unknown terminal app");
		expect(done().launched.map((l) => l.id)).toEqual(["apple-terminal", "kitty"]);
	});
});

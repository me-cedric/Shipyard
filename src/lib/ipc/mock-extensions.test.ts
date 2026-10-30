import { beforeEach, describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { resetMock } from "./mock";
import { PLUGIN_PATH } from "./mock-extensions";
import { unwrap } from "./result";

describe("mock extensions", () => {
	beforeEach(async () => {
		resetMock();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
	});

	it("fails without a project", async () => {
		resetMock();
		await expect(unwrap(commands.compassGet())).rejects.toMatchObject({
			details: expect.stringContaining("no active project"),
		});
	});

	it("lists the entries with a state each and the pin", async () => {
		const c = await unwrap(commands.compassGet());
		expect(c?.pinned).toBe("1.0.1");
		const kinds = new Set(c?.entries.map((e) => e.kind));
		expect(kinds).toEqual(new Set(["skill", "pack", "guide", "pattern", "contract"]));
		const states = new Set(c?.entries.map((e) => e.state));
		expect(states).toEqual(new Set(["absent", "stale", "current"]));
		expect(c?.entries.find((e) => e.id === "ui-conformance")?.suits).toBe(true);
	});

	it("previews a text, refuses a bad id, and keeps the pin on apply", async () => {
		await expect(unwrap(commands.compassPreview("skill", "review"))).resolves.toContain("review");
		await expect(unwrap(commands.compassPreview("skill", "../x"))).rejects.toMatchObject({
			details: expect.stringContaining("not allowed"),
		});
		const done = await unwrap(commands.compassApply(["contract:contract"]));
		expect(done.report.kept).toContain("AGENTS.md");
		expect(done.version).toBe("1.0.2");
		const again = await unwrap(commands.compassApply(["skill:ui-conformance"]));
		expect(again.report.written).toEqual([".agents/skills/ui-conformance/SKILL.md"]);
	});

	it("upgrades the stale entries and refuses a current selection", async () => {
		await expect(unwrap(commands.compassUpgrade(["skill:review"]))).rejects.toMatchObject({
			details: expect.stringContaining("current"),
		});
		await unwrap(commands.compassUpgrade(null));
		const c = await unwrap(commands.compassGet());
		expect(c?.entries.some((e) => e.state === "stale")).toBe(false);
	});

	it("lists the roles with who loads them", async () => {
		const rows = await unwrap(commands.rolesSkillsGet());
		expect(rows.find((r) => r.name === "reviewer")).toMatchObject({ usedBy: ["review-only"] });
		expect(rows.find((r) => r.kind === "skill")?.loaders).toEqual(["factory", "assistant"]);
	});

	it("previews a deploy with nothing written, then keeps an existing file", async () => {
		const first = await unwrap(commands.catalogPreview("agents/openspec-guidance"));
		expect(first.kept).toEqual(["AGENTS.md"]);
		expect(first.written).toEqual(["docs/openspec/specs/.gitkeep"]);
		const list = await unwrap(commands.catalogGet());
		expect(list.find((c) => c.id === "agents/openspec-guidance")?.state).toBe("absent");
		await unwrap(commands.catalogDeploy("agents/openspec-guidance"));
		const after = await unwrap(commands.catalogGet());
		expect(after.find((c) => c.id === "agents/openspec-guidance")?.state).toBe("current");
	});

	it("reviews a plugin without a write and writes only the accepted items", async () => {
		await expect(unwrap(commands.pluginReview("/mock/x.zip"))).rejects.toMatchObject({
			details: expect.stringContaining("not a valid zip"),
		});
		await expect(unwrap(commands.pluginReview("/a/../b.zip"))).rejects.toMatchObject({
			details: expect.stringContaining("path not allowed"),
		});
		const r = await unwrap(commands.pluginReview(PLUGIN_PATH));
		expect(r.items.map((i) => i.id)).toContain("mcp:docs");
		expect(r.refused).toEqual(["mcp:shell: a local command"]);
		await expect(unwrap(commands.pluginApply(PLUGIN_PATH, ["file:../x"]))).rejects.toMatchObject({
			details: expect.stringContaining("unknown item"),
		});
		const done = await unwrap(commands.pluginApply(PLUGIN_PATH, ["file:docs/team.md", "mcp:docs"]));
		expect(done.report.written).toEqual(["docs/team.md"]);
		expect(done.mcpAdded).toEqual(["docs"]);
		expect((await unwrap(commands.pluginReview(PLUGIN_PATH))).applied).toBe("1.0.0");
	});

	it("shows n of m, proposes only what the child lacks, and deploys to a branch", async () => {
		const [c] = await unwrap(commands.childList());
		expect(c).toMatchObject({ id: "api-gateway", cloned: true });
		expect(c?.held).toBeLessThan(c?.total ?? 0);
		expect(c?.proposed).not.toContain("skill:spec-flow");
		const key = c?.proposed[0] ?? "";
		const [r] = await unwrap(commands.childDeploy(["api-gateway"], [key]));
		expect(r).toMatchObject({ branch: "shipyard/extensions-1", error: null });
		expect(r?.commit).toBeTruthy();
		const [after] = await unwrap(commands.childList());
		expect(after?.held).toBe((c?.held ?? 0) + 1);
		const [again] = await unwrap(commands.childDeploy(["api-gateway"], [key]));
		expect(again?.error).toContain("not proposed");
	});

	it("adds a child that is not cloned, then clones it on a click", async () => {
		const c = await unwrap(commands.childAdd("Billing", "https://example.com/b.git"));
		expect(c).toMatchObject({ id: "billing", cloned: false, held: 0 });
		const [r] = await unwrap(commands.childDeploy(["billing"], c.proposed.slice(0, 1)));
		expect(r?.error).toContain("clone");
		await expect(unwrap(commands.childClone("billing"))).resolves.toMatchObject({ cloned: true });
		await unwrap(commands.childRemove("billing"));
		expect(await unwrap(commands.childList())).toHaveLength(1);
	});
});

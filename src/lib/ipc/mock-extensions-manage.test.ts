import { beforeEach, describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { mockState, resetMock } from "./mock";
import { PLUGIN_PATH } from "./mock-extensions";
import { unwrap } from "./result";

describe("mock extensions: manage", () => {
	beforeEach(async () => {
		resetMock();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
	});

	it("needs a click for each change", async () => {
		await expect(unwrap(commands.compassPolicyApply("solo-dev", false))).rejects.toMatchObject({
			details: expect.stringContaining("click"),
		});
		await expect(unwrap(commands.compassImport("/mock/r.md", false))).rejects.toMatchObject({
			details: expect.stringContaining("click"),
		});
		await expect(
			unwrap(commands.catalogUndeploy("devops-security/scan", false)),
		).rejects.toMatchObject({ details: expect.stringContaining("click") });
	});

	it("replaces the policy pack on a second apply", async () => {
		expect((await unwrap(commands.compassPolicies())).applied).toBeNull();
		await unwrap(commands.compassPolicyApply("solo-dev", true));
		await unwrap(commands.compassPolicyApply("strict-enterprise", true));
		expect((await unwrap(commands.compassPolicies())).applied).toBe("strict-enterprise");
		await expect(unwrap(commands.compassPolicyApply("nope", true))).rejects.toMatchObject({
			details: expect.stringContaining("unknown"),
		});
	});

	it("imports a rules file once as a pattern and removes it", async () => {
		expect(await unwrap(commands.compassImport("/mock/rules/Team Rules.md", true))).toBe(
			"pattern:team-rules",
		);
		await expect(
			unwrap(commands.compassImport("/mock/rules/Team Rules.md", true)),
		).rejects.toMatchObject({ details: expect.stringContaining("exists") });
		await expect(unwrap(commands.compassImport("/mock/a.exe", true))).rejects.toMatchObject({
			details: expect.stringContaining(".md"),
		});
		await unwrap(commands.compassRemove("pattern", "team-rules", true));
		const entries = (await unwrap(commands.compassGet()))?.entries ?? [];
		expect(entries.some((e) => e.id === "team-rules")).toBe(false);
	});

	it("sends a skill back to absent and keeps a guide and the contract", async () => {
		await unwrap(commands.compassRemove("skill", "review", true));
		const skill = (await unwrap(commands.compassGet()))?.entries.find((e) => e.id === "review");
		expect(skill?.state).toBe("absent");
		await expect(unwrap(commands.compassRemove("guide", "ui", true))).rejects.toMatchObject({
			details: expect.stringContaining("cannot"),
		});
		await expect(
			unwrap(commands.compassRemove("contract", "contract", true)),
		).rejects.toMatchObject({ details: expect.stringContaining("cannot") });
	});

	it("undeploys a component and refuses one that is not deployed", async () => {
		const out = await unwrap(commands.catalogUndeploy("devops-security/scan", true));
		expect(out.removed).toEqual([]);
		await expect(
			unwrap(commands.catalogUndeploy("devops-security/scan", true)),
		).rejects.toMatchObject({ details: expect.stringContaining("not deployed") });
		await unwrap(commands.catalogDeploy("devcontainers/node"));
		const gone = await unwrap(commands.catalogUndeploy("devcontainers/node", true));
		expect(gone.removed).toEqual([".devcontainer/devcontainer.json"]);
		expect(mockState().extensions.files).not.toContain(".devcontainer/devcontainer.json");
	});

	it("lists, switches and removes a plugin", async () => {
		expect(await unwrap(commands.pluginList())).toEqual([]);
		await unwrap(commands.pluginApply(PLUGIN_PATH, ["file:docs/team.md", "mcp:docs"]));
		const [p] = await unwrap(commands.pluginList());
		expect(p).toMatchObject({ name: "team-kit", enabled: true, mcp: ["docs"] });
		await unwrap(commands.pluginSetEnabled("team-kit", false, true));
		expect((await unwrap(commands.pluginList()))[0]?.enabled).toBe(false);
		const out = await unwrap(commands.pluginRemove("team-kit", true));
		expect(out.removed).toEqual(["docs/team.md"]);
		expect(await unwrap(commands.pluginList())).toEqual([]);
		await expect(unwrap(commands.pluginRemove("team-kit", true))).rejects.toMatchObject({
			details: expect.stringContaining("unknown"),
		});
	});
});

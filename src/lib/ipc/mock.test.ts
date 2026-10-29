import { describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { mockState } from "./mock";
import { unwrap } from "./result";

describe("mock ipc", () => {
	it("serves the app info and the preferences", async () => {
		expect(await commands.appInfo()).toEqual({ name: "Shipyard", version: "0.1.0", os: "browser" });
		const prefs = await unwrap(commands.prefsSet({ theme: "dark" }));
		expect(prefs.theme).toBe("dark");
		expect(mockState().prefs.theme).toBe("dark");
	});

	it("parses refs with the same grammar as the Rust command", async () => {
		expect(await commands.refsParse("adr:0004")).toEqual({ ref: "adr:0004", kind: "adr" });
		expect(await commands.refsParse("adr:12")).toBeNull();
	});

	it("opens, switches and reports an error for a folder with no repository", async () => {
		expect((await unwrap(commands.projectsOpen("/mock/plain", false))).status).toBe(
			"not-repository",
		);
		expect((await unwrap(commands.projectsOpen("/mock/bare", false))).status).toBe(
			"needs-project-file",
		);
		const a = await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.projectsOpen("/mock/beta", false));
		expect((await unwrap(commands.projectsActive()))?.name).toBe("beta");
		expect((await unwrap(commands.projectsSwitch(a.project?.id ?? ""))).name).toBe("alpha");
		expect(await unwrap(commands.projectsList())).toHaveLength(2);
	});
});

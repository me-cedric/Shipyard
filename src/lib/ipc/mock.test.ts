import { describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { DEMO_FOLDER, installMockIpc, mockState, pickMock } from "./mock";
import { unwrap } from "./result";

describe("mock ipc", () => {
	it("serves the app info and the preferences", async () => {
		expect(await commands.appInfo()).toEqual({ name: "Shipyard", version: "0.1.0", os: "browser" });
		const prefs = await unwrap(commands.prefsSet({ theme: "dark" }));
		expect(prefs.theme).toBe("dark");
		expect(mockState().prefs.theme).toBe("dark");
	});

	it("creates a repository only after a click, and serves the update notes and the sources", async () => {
		const c = await unwrap(
			commands.connectionsAdd({
				name: "Acme",
				group: "forge",
				kind: "github",
				url: "https://github.com",
				user: null,
			}),
		);
		expect((await commands.connectionsCreateRepo(c.id, "acme/new", false)).status).toBe("error");
		await expect(unwrap(commands.connectionsCreateRepo(c.id, "new", true))).rejects.toBeTruthy();
		expect((await unwrap(commands.connectionsCreateRepo(c.id, "acme/new", true))).slug).toBe(
			"acme/new",
		);
		const prefs = await unwrap(commands.prefsSet({ notifyOff: ["update"], seenVersion: "0.0.9" }));
		expect([prefs.notifyOff, prefs.seenVersion]).toEqual([["update"], "0.0.9"]);
		expect((await unwrap(commands.updateCheck())).notes).toContain("0.2.0");
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

	it("opens a demo project first in the browser build, with a tracker and every Work space filled", async () => {
		installMockIpc({ demo: true });
		expect(pickMock()).toBe(DEMO_FOLDER);
		const demo = await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		expect(demo.status).toBe("opened");
		const settings = await unwrap(commands.projectSettings());
		expect(settings?.file?.connections).toMatchObject({
			tracker: "demo-tracker",
			trackerScope: "ACME",
		});
		expect((await unwrap(commands.syncItems({}))).length).toBeGreaterThan(0);
		expect((await unwrap(commands.estimateList())).length).toBeGreaterThan(0);
		expect((await unwrap(commands.workTeam())).team.members.length).toBeGreaterThan(0);
		// The demo comes once. The next pick walks the folders.
		expect(pickMock()).toBe("/mock/alpha");
		// Without the option (tests, e2e) the picker starts with the first folder.
		installMockIpc();
		mockState().projects = [];
		expect(pickMock()).toBe("/mock/beta");
	});

	it("keeps connections, flags and a write-only secret like the Rust commands", async () => {
		const add = (name: string, kind: "linear" | "github") =>
			unwrap(commands.connectionsAdd({ name, group: "tracker", kind, url: "https://github.com" }));
		const linear = await add("Acme Linear", "linear");
		expect(linear).toMatchObject({ id: "acme-linear", url: "", secret: false, state: "untested" });
		expect(linear.capabilities?.timeTracking).toBe(false);
		expect((await add("Acme Linear", "github")).id).toBe("acme-linear-2");
		const saved = await unwrap(commands.connectionsSetSecret("acme-linear", "tok-1"));
		expect(saved.secret).toBe(true);
		expect(JSON.stringify(await unwrap(commands.connectionsList()))).not.toContain("tok-1");
		expect(await unwrap(commands.connectionsTest("acme-linear"))).toMatchObject({ kind: "passed" });
		expect(await unwrap(commands.connectionsTest("acme-linear-2"))).toMatchObject({
			kind: "failed",
		});
		expect((await unwrap(commands.refsResolve("conn:acme-linear")))?.title).toBe("Acme Linear");
		await unwrap(commands.connectionsRemove("acme-linear"));
		expect(mockState().secrets).toEqual({});
		await expect(unwrap(commands.connectionsTest("acme-linear"))).rejects.toThrow("unknown");
	});

	it("refuses a bad draft", async () => {
		const bad = (d: Partial<Parameters<typeof commands.connectionsAdd>[0]>) =>
			unwrap(
				commands.connectionsAdd({
					name: "A",
					group: "tracker",
					kind: "github",
					url: "https://github.com",
					...d,
				}),
			);
		await expect(bad({ name: " " })).rejects.toThrow();
		await expect(bad({ url: "http://github.com" })).rejects.toThrow("https");
		await expect(bad({ kind: "jira-cloud", url: "https://a.atlassian.net" })).rejects.toThrow(
			"email",
		);
		await expect(bad({ group: "forge", kind: "linear" })).rejects.toThrow("not a forge");
		expect(mockState().connections).toEqual([]);
	});
});

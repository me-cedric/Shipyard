import { screen, waitFor, within } from "@testing-library/react";
import { en } from "@/lib/i18n/en";
import { mockState } from "@/lib/ipc/mock";
import { ROLES } from "@/lib/prefs";
import { mountApp } from "@/test/mount";
import { orderedSpaces, ROLE_HOME, SPACE_IDS, SPACES } from "./spaces";

const sidebar = () => screen.findByRole("navigation", { name: "Sidebar" });

describe("role homes (shell REQ-009)", () => {
	it("gives the home of the spec to each role", () => {
		expect(ROLE_HOME).toEqual({
			none: "home",
			pm: "work",
			architect: "design",
			developer: "factory",
			qa: "specs",
			ba: "specs",
			lead: "specs",
			junior: "knowledge",
		});
		expect(Object.keys(ROLE_HOME).sort()).toEqual(["none", ...ROLES].sort());
	});

	it.each(["none", ...ROLES] as const)("keeps every space for role %s, Settings last", (role) => {
		const order = orderedSpaces(role);
		expect([...order].sort()).toEqual([...SPACE_IDS].sort());
		expect(order[0]).toBe("home");
		expect(order.at(-1)).toBe("settings");
		expect(order.indexOf(ROLE_HOME[role])).toBeLessThanOrEqual(1);
	});

	it("opens Knowledge on Learn for a junior and still lists the seven spaces and Settings", async () => {
		mockState().prefs.role = "junior";
		const router = mountApp("/");
		const nav = await sidebar();
		const links = within(nav).getAllByRole("link");
		expect(links).toHaveLength(8);
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		await within(tabs).findByRole("link", { name: "Graph" });
		// The tab of the role comes first and opens first.
		expect(within(tabs).getAllByRole("link")[0]).toHaveAccessibleName("Learn");
		await waitFor(() => expect(router.state.location.pathname).toBe("/knowledge/learn"));
		expect(links.find((l) => l.getAttribute("aria-current") === "page")).toHaveAccessibleName(
			"Knowledge",
		);
	});
});

describe("tab names", () => {
	it("opens Work on the Board for a PM, and Settings has no Team: Work / Team is the one place", async () => {
		mockState().prefs.role = "pm";
		const router = mountApp("/work");
		await waitFor(() => expect(router.state.location.pathname).toBe("/work/board"));
		expect(SPACES.settings).not.toContain("team");
	});

	it("opens Specs on the Test plans for a tester", async () => {
		mockState().prefs.role = "qa";
		const router = mountApp("/specs");
		await waitFor(() => expect(router.state.location.pathname).toBe("/specs/test-plans"));
	});

	it("lets the tabs wrap, so a narrow main view cuts none off", async () => {
		mountApp("/code/changes");
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		await within(tabs).findByRole("link", { name: "Terminal" });
		expect(tabs.firstElementChild).toHaveClass("flex-wrap");
		expect(tabs).not.toHaveClass("overflow-x-auto");
	});

	it("gives each tab a name that no other space uses", () => {
		const names = SPACE_IDS.flatMap((s) =>
			SPACES[s].map((tab) => (en.tabs[s] as Record<string, string>)[tab]),
		);
		expect(new Set(names).size).toBe(names.length);
	});
});

describe("no tour and no hidden tab (shell REQ-016)", () => {
	it("shows every tab of a space, with no tour or help text", async () => {
		mountApp("/work");
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		expect(within(tabs).getAllByRole("link")).toHaveLength(SPACES.work.length);
		expect(screen.queryByText(/tour|welcome|tip/i)).toBeNull();
	});
});

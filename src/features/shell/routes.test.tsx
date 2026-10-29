import { screen, within } from "@testing-library/react";
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

	it("opens Knowledge for a junior and still lists the seven spaces and Settings", async () => {
		mockState().prefs.role = "junior";
		mountApp("/");
		const nav = await sidebar();
		const links = within(nav).getAllByRole("link");
		expect(links).toHaveLength(8);
		await within(await screen.findByRole("navigation", { name: "Tabs" })).findByRole("link", {
			name: "Graph",
		});
		expect(links.find((l) => l.getAttribute("aria-current") === "page")).toHaveAccessibleName(
			"Knowledge",
		);
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

import { screen, waitFor, within } from "@testing-library/react";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { TEAM_ROLES } from "@/lib/prefs";
import { mountApp } from "@/test/mount";
import {
	barTabs,
	FIRST_TAB,
	firstPath,
	orderedSpaces,
	SPACE_IDS,
	SPACES,
	type SpaceId,
	tabIcon,
} from "./spaces";

const sidebar = () => screen.findByRole("navigation", { name: "Sidebar" });

describe("role homes (shell REQ-009, team-rights REQ-013)", () => {
	it("gives each of the nine roles a first tab", () => {
		expect(FIRST_TAB).toEqual({
			po: "/work/backlog",
			pm: "/work/board",
			architect: "/design/decisions",
			techlead: "/factory/runs",
			ba: "/specs/changes",
			developer: "/factory/runs",
			qa: "/specs/test-plans",
			designer: "/design/screens",
			viewer: "/home/today",
		});
		expect(Object.keys(FIRST_TAB).sort()).toEqual([...TEAM_ROLES].sort());
	});

	it.each([null, ...TEAM_ROLES] as const)(
		"keeps every space for role %s, the space of the first tab second, Settings last",
		(role) => {
			const order = orderedSpaces(role);
			expect([...order].sort()).toEqual([...SPACE_IDS].sort());
			expect(order[0]).toBe("home");
			expect(order.at(-1)).toBe("settings");
			expect(order.indexOf(firstPath(role).split("/")[1] as SpaceId)).toBeLessThanOrEqual(1);
		},
	);

	it("opens Design on Decisions for an architect and still lists the seven spaces and Settings", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().person = {
			member: "ana",
			found: "email",
			role: "architect",
			admin: false,
			readOnly: false,
			rights: ["work.edit"],
		};
		const router = mountApp("/");
		const nav = await sidebar();
		const links = within(nav).getAllByRole("link");
		expect(links).toHaveLength(8);
		await waitFor(() => expect(router.state.location.pathname).toBe("/design/decisions"));
		expect(links[1]).toHaveAccessibleName("Design");
	});

	it("opens a viewer on Today and lists every space", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().person = {
			member: null,
			found: "unknown",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		const router = mountApp("/");
		expect(within(await sidebar()).getAllByRole("link")).toHaveLength(8);
		await waitFor(() => expect(router.state.location.pathname).toBe("/home/today"));
	});

	it("hides a space at the level none and shows No access on its route; Settings / Me stays", async () => {
		const level = (a: string) => (a === "code" || a === "settings" ? "none" : "read");
		expect(orderedSpaces("developer", level)).not.toContain("code");
		expect(orderedSpaces("developer", level)).toContain("settings");
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const view = await unwrap(commands.rightsGet());
		mockState().person = {
			member: "bo",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: [],
			access: { ...view.person.access, code: "none", settings: "none" },
		};
		const router = mountApp("/code/history");
		expect(await screen.findByText(en.rights.noAccess)).toBeInTheDocument();
		const nav = await sidebar();
		await waitFor(() =>
			expect(within(nav).queryByRole("link", { name: "Code" })).not.toBeInTheDocument(),
		);
		expect(within(nav).getByRole("link", { name: "Settings" })).toBeInTheDocument();
		await router.navigate({ to: "/settings" });
		await waitFor(() => expect(router.state.location.pathname).toBe("/settings/me"));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("maps the role of an older Shipyard: a junior opens like a developer", async () => {
		// The Rust reader maps an old prefs file; an old registry entry can still hold the text.
		(mockState().prefs as { role: string }).role = "junior";
		const router = mountApp("/");
		await waitFor(() => expect(router.state.location.pathname).toBe("/factory/runs"));
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
		await within(tabs).findByRole("link", { name: "Impacts" });
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

describe("twin tabs (ux-declutter REQ-014, REQ-021)", () => {
	it("keeps Terminal and Manual out of the tab bars: Code and Knowledge show 6 tabs", async () => {
		mountApp("/code/changes");
		const code = await screen.findByRole("navigation", { name: "Tabs" });
		expect(within(code).getAllByRole("link")).toHaveLength(6);
		expect(within(code).queryByRole("link", { name: "Terminal" })).toBeNull();
		expect(barTabs("knowledge", null)).toHaveLength(6);
		expect(barTabs("knowledge", null)).not.toContain("manual");
	});

	it("opens the terminal drawer from /code/terminal and lands on the first Code tab", async () => {
		const router = mountApp("/code/terminal");
		await waitFor(() => expect(router.state.location.pathname).toBe("/code/changes"));
		expect(await screen.findByRole("tab", { name: "Terminal 1" })).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows the manual at /knowledge/manual with no selected tab", async () => {
		const router = mountApp("/knowledge/manual");
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		expect(await screen.findByRole("article", { name: "Getting started" })).toBeInTheDocument();
		expect(within(tabs).queryByRole("link", { current: "page" })).toBeNull();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("gives each tab of the bar an icon", () => {
		for (const s of SPACE_IDS)
			for (const tab of barTabs(s, null)) expect(tabIcon(s, tab), `${s}/${tab}`).toBeDefined();
	});

	it.each(SPACE_IDS)(
		"draws each icon of the tabs of %s as decoration: the name stays the text",
		async (space) => {
			mountApp(`/${space}`);
			const tabs = await screen.findByRole("navigation", { name: "Tabs" });
			const links = await within(tabs).findAllByRole("link");
			for (const link of links) {
				const icons = [...link.querySelectorAll("svg")];
				expect(icons.length, link.textContent ?? "").toBeGreaterThan(0);
				for (const icon of icons) expect(icon.closest("[aria-hidden='true']")).not.toBeNull();
			}
		},
	);
});

describe("no tour and no hidden tab (shell REQ-016)", () => {
	it("shows every tab of a space, with no tour or help text", async () => {
		mountApp("/work");
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		expect(within(tabs).getAllByRole("link")).toHaveLength(SPACES.work.length);
		expect(screen.queryByText(/tour|welcome|tip/i)).toBeNull();
	});
});

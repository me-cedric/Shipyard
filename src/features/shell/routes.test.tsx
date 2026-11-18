import { screen, waitFor, within } from "@testing-library/react";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { TEAM_ROLES } from "@/lib/prefs";
import { mountApp } from "@/test/mount";
import { barSections, PLACE_IDS } from "./places";
import {
	barTabs,
	FIRST_TAB,
	firstPath,
	orderedSpaces,
	SPACE_IDS,
	SPACES,
	type SpaceId,
	tabIcon,
	tabLabel,
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

	it("opens Library on Decisions for an architect and still lists the six places and Setup", async () => {
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
		expect(links).toHaveLength(7);
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/decisions"));
		expect(within(nav).getByRole("link", { current: "page" })).toHaveAccessibleName("Library");
	});

	it("opens a viewer on Today and lists every place", async () => {
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
		expect(within(await sidebar()).getAllByRole("link")).toHaveLength(7);
		await waitFor(() => expect(router.state.location.pathname).toBe("/today/today"));
	});

	it("hides a place at the level none and shows No access on its route; Setup / Me stays", async () => {
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
			expect(within(nav).queryByRole("link", { name: /^Code/ })).not.toBeInTheDocument(),
		);
		expect(within(nav).getByRole("link", { name: "Setup" })).toBeInTheDocument();
		await router.navigate({ to: "/settings" });
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/me"));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("maps the role of an older Shipyard: a junior opens like a developer", async () => {
		// The Rust reader maps an old prefs file; an old registry entry can still hold the text.
		(mockState().prefs as { role: string }).role = "junior";
		const router = mountApp("/");
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/flow"));
	});
});

describe("tab names", () => {
	it("opens Flow on the Board for a PM, and Settings has no Team: Work / Team is the one place", async () => {
		mockState().prefs.role = "pm";
		const router = mountApp("/work");
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/flow"));
		expect(SPACES.settings).not.toContain("team");
	});

	it.each([
		["/factory", "/flow/flow"],
		["/specs", "/flow/list"],
		["/knowledge", "/library/graph"],
		["/design", "/library/diagrams"],
		["/home", "/today/today"],
		["/settings", "/setup/project"],
	])("opens the old index %s on the view of that space: %s", async (from, to) => {
		const router = mountApp(from);
		await waitFor(() => expect(router.state.location.pathname).toBe(to));
	});

	it("opens the old Specs index on the Test plans for a tester", async () => {
		mockState().prefs.role = "qa";
		const router = mountApp("/specs");
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/test-plans"));
	});

	// spec:app-redesign#REQ-020: the role picks the first page of the app, not the page of Library.
	it("opens Library on its doors for a tester", async () => {
		mockState().prefs.role = "qa";
		const router = mountApp("/library");
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/home"));
	});

	it("lets the tabs wrap, so a narrow main view cuts none off", async () => {
		mountApp("/code/changes");
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		await within(tabs).findByRole("link", { name: "Branches" });
		expect(tabs.firstElementChild).toHaveClass("flex-wrap");
		expect(tabs).not.toHaveClass("overflow-x-auto");
	});

	it("gives each tab a name that no other space uses", () => {
		const names = SPACE_IDS.flatMap((s) => SPACES[s].map((tab) => tabLabel(en, s, tab)));
		expect(new Set(names).size).toBe(names.length);
	});
});

describe("twin tabs (ux-declutter REQ-014, REQ-021)", () => {
	it("keeps Manual out of the section switch; Terminal is a section of Code: Code shows 4 sections", async () => {
		mountApp("/code/changes");
		const code = await screen.findByRole("navigation", { name: "Tabs" });
		expect(within(code).getAllByRole("link")).toHaveLength(4);
		expect(within(code).getByRole("link", { name: "Terminal" })).toBeInTheDocument();
		expect(barTabs("knowledge", null)).toHaveLength(6);
		expect(barTabs("knowledge", null)).not.toContain("manual");
		expect(barSections("library").map(([, tab]) => tab)).not.toContain("manual");
	});

	// spec:app-redesign#REQ-022: the terminal is a page of Code, not a redirect to the drawer.
	it("shows the terminal as a page at /code/terminal, selected in the section switch", async () => {
		const router = mountApp("/code/terminal");
		expect(await screen.findByRole("heading", { level: 1, name: "Terminal" })).toBeInTheDocument();
		expect(router.state.location.pathname).toBe("/code/terminal");
		const code = await screen.findByRole("navigation", { name: "Tabs" });
		expect(
			within(code).getByRole("link", { name: "Terminal", current: "page" }),
		).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows the manual at /knowledge/manual with the back link and no section switch", async () => {
		const router = mountApp("/knowledge/manual");
		expect(await screen.findByRole("article", { name: "Getting started" })).toBeInTheDocument();
		expect(
			within(screen.getByRole("main")).getByRole("link", { name: en.library.back }),
		).toHaveAttribute("href", "/library/home");
		expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("gives each tab of the bar an icon", () => {
		for (const s of SPACE_IDS)
			for (const tab of barTabs(s, null)) expect(tabIcon(s, tab), `${s}/${tab}`).toBeDefined();
	});

	// The section switch of adr:0023 draws names only: the name is the text, as on the tabs before.
	// Library has no switch: `library.test.tsx` checks the name of each chip of its doors.
	it.each(PLACE_IDS.filter((p) => p !== "library"))(
		"names each section of %s by its text",
		async (place) => {
			mountApp(`/${place}`);
			const tabs = await screen.findByRole("navigation", { name: "Tabs" });
			const links = await within(tabs).findAllByRole("link");
			expect(links.map((l) => l.textContent)).toEqual(
				barSections(place).map(([space, tab]) => tabLabel(en, space, tab)),
			);
			for (const icon of tabs.querySelectorAll("svg"))
				expect(icon.closest("[aria-hidden='true']")).not.toBeNull();
		},
	);
});

describe("no tour and no hidden tab (shell REQ-016)", () => {
	it("shows every section of a place, with no tour or help text", async () => {
		mountApp("/work");
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		expect(within(tabs).getAllByRole("link")).toHaveLength(barSections("flow").length);
		expect(screen.queryByText(/tour|welcome|tip/i)).toBeNull();
	});
});

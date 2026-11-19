import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { TEAM_ROLES } from "@/lib/prefs";
import { mountApp } from "@/test/mount";
import {
	barSections,
	FIRST_PAGE,
	firstPath,
	PLACE_IDS,
	sections,
	sectionView,
	visiblePlaces,
	visibleSections,
} from "./places";
import { SPACE_IDS, SPACES, tabIcon, tabLabel } from "./spaces";
import { openSync } from "./test-open";

const sidebar = () => screen.findByRole("navigation", { name: "Sidebar" });

describe("role homes (shell REQ-009, team-rights REQ-013, app-redesign REQ-006)", () => {
	// Picture 066 of the design source names the first page of each role.
	it("gives each of the nine roles a first page, a section of a place", () => {
		expect(FIRST_PAGE).toEqual({
			po: "/flow/list",
			pm: "/plan/timeline",
			architect: "/library/decisions",
			techlead: "/flow/flow",
			ba: "/library/capabilities",
			developer: "/flow/flow",
			qa: "/library/test-plans",
			designer: "/library/screens",
			viewer: "/today/today",
		});
		expect(Object.keys(FIRST_PAGE).sort()).toEqual([...TEAM_ROLES].sort());
		for (const page of Object.values(FIRST_PAGE)) {
			const [, place, slug] = page.split("/");
			expect(sectionView(place as (typeof PLACE_IDS)[number], slug ?? ""), page).toBeDefined();
		}
	});

	it.each([null, ...TEAM_ROLES] as const)(
		"keeps every place for role %s in menu order: the role picks the first page, not the order",
		(role) => {
			expect(visiblePlaces()).toEqual(PLACE_IDS);
			expect(firstPath(role)).toBe(role ? FIRST_PAGE[role] : "/today/today");
		},
	);

	it("opens Today when the role does not see its first page", () => {
		const level = (a: string) => (a === "design" ? "none" : "read");
		expect(firstPath("architect", level)).toBe("/today/today");
		expect(firstPath("qa", level)).toBe("/library/test-plans");
	});

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

	// The team file has an admin and this person is not in it: the role viewer with its default levels.
	const teamWithAdmin = () =>
		unwrap(
			commands.workTeamSave({
				members: [{ name: "Cy Lead", handle: "cy", role: "techlead", admin: true }],
			}),
		);

	it("opens a viewer on Today and lists every place that the levels of the role show", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await teamWithAdmin();
		const router = mountApp("/");
		expect(within(await sidebar()).getAllByRole("link")).toHaveLength(6);
		await waitFor(() => expect(router.state.location.pathname).toBe("/today/today"));
	});

	// spec:app-redesign#REQ-006, scenario "A viewer": the default level of the viewer for code is none.
	it("opens a viewer on Today and shows no Code place, no Code destination and no link to the changes", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().prefs.role = "viewer";
		await teamWithAdmin();
		const router = mountApp("/");
		const nav = await sidebar();
		await waitFor(() => expect(router.state.location.pathname).toBe("/today/today"));
		await waitFor(() =>
			expect(within(nav).queryByRole("link", { name: /^Code/ })).not.toBeInTheDocument(),
		);
		expect(within(nav).getAllByRole("link")).toHaveLength(6);
		// The card of the sync mark holds the links to the changes.
		const card = await openSync(user);
		expect(card.queryByRole("link", { name: /lines added/ })).toBeNull();
		expect(card.queryByRole("link", { name: /^Changed files/ })).toBeNull();
		await user.keyboard("{Escape}");
		await user.keyboard("{Control>}k{/Control}");
		const panel = within(await screen.findByRole("listbox"));
		expect(await panel.findByRole("option", { name: "Today / Needs you" })).toBeInTheDocument();
		expect(panel.queryByRole("option", { name: /^Code/ })).toBeNull();
		expect(panel.queryByRole("option", { name: "Flow / Impacts" })).toBeNull();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	// A hidden view does not open by its address, and no old address opens it either.
	it.each([
		["/code", "code"],
		["/code/now", "code"],
		["/code/history", "code"],
		["/code/branches", "code"],
		["/code/terminal", "code"],
		["/code/changes", "code"],
		["/code/pull-requests/pr-1", "code"],
		["/flow/impacts", "code"],
		["/code/impacts", "code"],
		["/flow/flow", "work,runs"],
		["/flow/runs/r1", "work,runs"],
		["/flow/feature/f1", "work,runs"],
		["/flow/new", "work,specs"],
		["/flow/list", "work,specs"],
		["/plan/timeline", "work"],
		["/crew/sessions", "runs"],
		["/crew/rights", "work"],
		["/library/decisions", "design"],
		["/library/questions", "specs"],
		["/design/screens", "design"],
		["/setup/project", "settings"],
		["/setup/computer", "settings"],
		["/settings/connections", "settings"],
	])("shows No access at %s with the level none for %s", async (path, areas) => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const view = await unwrap(commands.rightsGet());
		const none = Object.fromEntries(areas.split(",").map((a) => [a, "none"]));
		mockState().person = {
			member: "bo",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: [],
			access: { ...view.person.access, ...none },
		};
		const router = mountApp(path);
		expect(await screen.findByText(en.rights.noAccess)).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("keeps Today, Health, the guided start and Me for a person with the level none in each area", () => {
		const shown = PLACE_IDS.flatMap((p) =>
			visibleSections(p, () => "none").map(([, tab]) => `${p}/${tab}`),
		);
		expect(shown).toEqual([
			"today/today",
			"today/news",
			"today/activity",
			"flow/health",
			"setup/start",
			"setup/me",
		]);
		expect(visiblePlaces(() => "none")).toEqual(["today", "flow", "setup"]);
	});

	it("shows no link to the sessions on Today / Activity when the role sees no Sessions", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const view = await unwrap(commands.rightsGet());
		mockState().person = {
			member: "bo",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: [],
			access: { ...view.person.access, runs: "none" },
		};
		const router = mountApp("/today/activity");
		const part = await screen.findByRole("region", { name: en.panels.sessions.title });
		await waitFor(() =>
			expect(within(part).queryByRole("link", { name: en.panels.sessions.all })).toBeNull(),
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("turns the New feature action off the list when the role sees no List", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const view = await unwrap(commands.rightsGet());
		mockState().person = {
			member: "bo",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: [],
			access: { ...view.person.access, work: "none", specs: "none" },
		};
		const router = mountApp("/today/today");
		await sidebar();
		await user.keyboard("{Control>}k{/Control}");
		const panel = within(await screen.findByRole("listbox"));
		expect(await panel.findByRole("option", { name: "Today / Needs you" })).toBeInTheDocument();
		await waitFor(() =>
			expect(panel.queryByRole("option", { name: en.flow.newAction })).toBeNull(),
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	// One person of the mock project with some areas at the level none.
	const withNone = async (...areas: string[]) => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const view = await unwrap(commands.rightsGet());
		mockState().person = {
			member: "bo",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: [],
			access: { ...view.person.access, ...Object.fromEntries(areas.map((a) => [a, "none"])) },
		};
	};

	it("lists no Setup / Tickets destination when the role sees no settings", async () => {
		const user = userEvent.setup();
		await withNone("settings");
		const router = mountApp("/today/today");
		await sidebar();
		await user.keyboard("{Control>}k{/Control}");
		const panel = within(await screen.findByRole("listbox"));
		expect(await panel.findByRole("option", { name: "Today / Needs you" })).toBeInTheDocument();
		// The project file loads after the list opens: wait for a door that needs no right.
		expect(await panel.findByRole("option", { name: en.tabs.home.projects })).toBeInTheDocument();
		await waitFor(() =>
			expect(
				panel.queryByRole("option", { name: `Setup / ${en.projects.ticketsConfig.title}` }),
			).toBeNull(),
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows no New feature and no Add idea on Flow when the role sees no List", async () => {
		await withNone("work", "specs");
		const router = mountApp("/flow/flow");
		expect(await screen.findByRole("heading", { name: en.ui.place.flow })).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
		expect(screen.queryByRole("button", { name: en.flow.newAction })).toBeNull();
		expect(screen.queryByRole("button", { name: en.flow.addIdea })).toBeNull();
	});

	it("shows no link to Flow on Today / Activity when the role sees no Flow", async () => {
		await withNone("work", "runs");
		const router = mountApp("/today/activity");
		const part = await screen.findByRole("region", { name: en.shell.runs });
		await waitFor(() => expect(router.state.status).toBe("idle"));
		const name = new RegExp(`^${en.shell.runs}`);
		expect(within(part).queryByRole("link", { name })).toBeNull();
		expect(within(part).getByRole("heading", { name })).toBeInTheDocument();
	});

	it("hides a place at the level none and shows No access on its route; Setup / Me stays", async () => {
		const level = (a: string) => (a === "code" || a === "settings" ? "none" : "read");
		expect(visiblePlaces(level)).not.toContain("code");
		expect(visiblePlaces(level)).toContain("setup");
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
	it("opens the old Work index on the Timeline for a PM, and Settings has no Team: Work / Team is the one place", async () => {
		mockState().prefs.role = "pm";
		const router = mountApp("/work");
		await waitFor(() => expect(router.state.location.pathname).toBe("/plan/timeline"));
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
		await unwrap(commands.projectsOpen("/mock/alpha", false));
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
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/code/changes");
		const code = await screen.findByRole("navigation", { name: "Tabs" });
		expect(within(code).getAllByRole("link")).toHaveLength(4);
		expect(within(code).getByRole("link", { name: "Terminal" })).toBeInTheDocument();
		const library = barSections("library").map(([, tab]) => tab);
		expect(library).toHaveLength(sections("library").length - 1);
		expect(library).not.toContain("manual");
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

	// The manual is help, not a page of Library: it has no way back to the doors, and it shows for
	// a role that hides Library (`manual.test.tsx`).
	it("shows the manual at /knowledge/manual with no back link and no section switch", async () => {
		const router = mountApp("/knowledge/manual");
		expect(await screen.findByRole("article", { name: "Getting started" })).toBeInTheDocument();
		expect(
			within(screen.getByRole("main")).queryByRole("link", { name: en.library.back }),
		).toBeNull();
		expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("gives each section of a place an icon", () => {
		for (const place of PLACE_IDS)
			for (const [space, tab] of sections(place))
				expect(tabIcon(space, tab), `${space}/${tab}`).toBeDefined();
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
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/work");
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		expect(within(tabs).getAllByRole("link")).toHaveLength(barSections("flow").length);
		expect(screen.queryByText(/tour|welcome|tip/i)).toBeNull();
	});
});

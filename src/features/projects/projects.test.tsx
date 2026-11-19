import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { openAccount } from "@/features/shell/test-open";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const open = (path = "/mock/alpha") => unwrap(commands.projectsOpen(path, false));
/** The first run starts with the role. Continue shows the three starts. */
const next = async (user: ReturnType<typeof userEvent.setup>, name = "Continue") =>
	user.click(await screen.findByRole("button", { name }));
const firstRunButtons = () => within(screen.getByRole("main")).getAllByRole("button");

describe("first run", () => {
	beforeEach(() => localStorage.removeItem("shipyard.cloneFolder"));
	it("shows the role as tiles, then three starts, with one primary action", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		const go = await screen.findByRole("button", { name: "Continue" });
		expect(screen.queryByRole("button", { name: "Open a local folder" })).toBeNull();
		// A bare page: no rail, no top row. The skip link stays.
		expect(screen.queryByRole("navigation")).toBeNull();
		expect(screen.queryByRole("combobox", { name: "Ask or tell Shipyard" })).toBeNull();
		expect(screen.getByRole("button", { name: "Skip to the content" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { level: 1, name: "What is your job?" })).toBeVisible();
		expect(screen.getByRole("img", { name: "Step 1 of 3" })).toBeVisible();
		const roles = within(screen.getByRole("group", { name: "What is your job?" })).getAllByRole(
			"button",
		);
		expect(roles.map((r) => r.textContent)).toEqual([
			"Product owner",
			"Project manager",
			"Business analyst",
			"Architect",
			"Tech lead",
			"Developer",
			"Tester",
			"Designer",
			"I only look",
			"Other",
		]);
		expect(screen.getByRole("button", { name: "Other", pressed: true })).toBeInTheDocument();
		// Continue is the one primary action of the step.
		expect(firstRunButtons().filter((b) => b.className.includes("bg-primary"))).toEqual([go]);
		// The large button: 52 px high, 220 px wide or more. The block is in the middle of the window.
		expect(go).toHaveClass("min-h-13", "min-w-55", "text-17");
		expect(go).not.toHaveClass("min-h-control");
		expect(go.parentElement).toHaveClass("min-h-full", "justify-center");
		await user.click(screen.getByRole("button", { name: "Tech lead" }));
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Tech lead", pressed: true })).toBeInTheDocument(),
		);
		expect(screen.getByRole("button", { name: "Other", pressed: false })).toBeInTheDocument();
		// A click selects. Continue saves and shows the three starts.
		expect(mockState().prefs.role).not.toBe("techlead");
		await next(user);
		await screen.findByRole("button", { name: "Open a local folder" });
		expect(mockState().prefs.role).toBe("techlead");
		const buttons = firstRunButtons();
		expect(buttons.map((b) => b.textContent)).toEqual([
			"Open a local folder",
			"Clone a repository",
			"Create a project",
		]);
		// Each start is a tile of the same weight: the step has no primary button.
		expect(buttons.filter((b) => b.className.includes("bg-primary"))).toHaveLength(0);
	});

	it("starts at the three starts for a saved role, and keeps the role", async () => {
		mockState().prefs.role = "qa";
		mountApp("/home/today");
		await screen.findByRole("button", { name: "Open a local folder" });
		expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
		// The role step did not show, so it does not count.
		expect(screen.getByRole("heading", { level: 1, name: "How do you start?" })).toBeVisible();
		expect(screen.getByRole("img", { name: "Step 1 of 2" })).toBeVisible();
		expect(mockState().prefs.role).toBe("qa");
	});

	it("starts at the three starts when the list holds a project", async () => {
		await open("/mock/alpha");
		await unwrap(commands.projectsClose());
		mountApp("/home/today");
		await screen.findByRole("button", { name: "Open a local folder" });
		expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
	});

	it("moves the focus to the start step after Continue", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		await next(user);
		await waitFor(() =>
			expect(screen.getByRole("heading", { level: 1, name: "How do you start?" })).toHaveFocus(),
		);
		expect(screen.getByRole("img", { name: "Step 2 of 3" })).toBeVisible();
	});

	it("opens a local folder and lists it in the switcher", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		await next(user);
		await user.click(await screen.findByRole("button", { name: "Open a local folder" }));
		expect(
			await screen.findByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^Project/ })).toHaveTextContent("alpha");
		expect(mockState().projects).toHaveLength(1);
	});

	it("opens a folder with no project file at once and writes the file without a question", async () => {
		const user = userEvent.setup();
		mockState().nextFolder = "/mock/bare";
		mountApp("/home/today");
		await next(user);
		await user.click(await screen.findByRole("button", { name: "Open a local folder" }));
		expect(
			await screen.findByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
		).toBeInTheDocument();
		expect(mockState().projects[0]?.path).toBe("/mock/bare");
	});

	it("names the missing repository, opens nothing and offers to make it a project", async () => {
		const user = userEvent.setup();
		mockState().nextFolder = "/mock/plain";
		mountApp("/home/today");
		await next(user);
		await user.click(await screen.findByRole("button", { name: "Open a local folder" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("No Git repository in /mock/plain");
		expect(mockState().projects).toHaveLength(0);
		await user.click(screen.getByRole("button", { name: "Make it a project" }));
		expect(
			await screen.findByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
		).toBeInTheDocument();
		expect(mockState().projects[0]?.path).toBe("/mock/plain");
	});

	it("creates a project from a name alone: the key comes from the name, the folder from Projects", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		await next(user);
		await user.click(await screen.findByRole("button", { name: "Create a project" }));
		// All steps shows the folder and the key. The guided steps keep their defaults.
		await user.click(await screen.findByRole("button", { name: "All steps" }));
		expect(await screen.findByDisplayValue("/mock/Projects")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Create the project" })).toBeDisabled();
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Acme Web");
		expect(screen.getByRole("textbox", { name: "Short key for tickets" })).toHaveValue("ACMEWE");
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Create the project" })).toBeEnabled(),
		);
		await user.click(screen.getByRole("button", { name: "Create the project" }));
		await user.click(await screen.findByRole("button", { name: "Open" }));
		expect(
			await screen.findByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
		).toBeInTheDocument();
		expect(mockState().projects[0]).toMatchObject({
			name: "Acme Web",
			key: "ACMEWE",
			path: "/mock/Projects/acme-web",
		});
	});

	it("clones into a folder named after the repository", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		await next(user);
		await user.click(await screen.findByRole("button", { name: "Clone a repository" }));
		await user.type(
			screen.getByRole("textbox", { name: "Repository address" }),
			"git@host:team/shipyard.git",
		);
		await user.click(screen.getByRole("button", { name: "Choose a folder" }));
		await user.click(screen.getByRole("button", { name: "Clone" }));
		await screen.findByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ });
		expect(mockState().projects[0]?.path).toBe("/mock/alpha/shipyard");
	});

	it("reads French", async () => {
		mockState().prefs.lang = "fr";
		mountApp("/home/today");
		await next(userEvent.setup(), "Continuer");
		expect(
			await screen.findByRole("button", { name: "Ouvrir un dossier local" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Créer un projet" })).toBeInTheDocument();
	});
});

describe("project switcher", () => {
	beforeEach(() => localStorage.removeItem("shipyard.cloneFolder"));
	it("lists each project with the state of its working copy and switches", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		const beta = await open("/mock/beta");
		Object.assign(mockState().projects[0] ?? {}, { state: "missing" });
		mountApp("/home/today");
		const switcher = await screen.findByRole("button", { name: /^Project/ });
		await waitFor(() => expect(switcher).toHaveTextContent("beta"));
		await user.click(switcher);
		const option = await screen.findByRole("menuitemradio", { name: /alpha/ });
		expect(within(option).getByRole("img", { name: "Missing" })).toBeInTheDocument();
		expect(
			within(screen.getByRole("menuitemradio", { name: /beta/ })).getByRole("img", {
				name: "Clean",
			}),
		).toBeInTheDocument();
		await user.click(option);
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.name).toBe("alpha"),
		);
		expect(beta.project?.id).toBe("beta");
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
	});

	it("changes the project with the keyboard", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await open("/mock/beta");
		mountApp("/home/today");
		const switcher = await screen.findByRole("button", { name: /^Project/ });
		await waitFor(() => expect(switcher).toHaveTextContent("beta"));
		switcher.focus();
		await user.keyboard("{Enter}");
		await screen.findByRole("menuitemradio", { name: /alpha/ });
		// The focus starts on the first project.
		await user.keyboard("{Enter}");
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.name).toBe("alpha"),
		);
	});

	it("offers Projects, Open folder, Clone, Close project and Remove from list in the one menu", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mountApp("/home/today");
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		const menu = within(await screen.findByRole("menu"));
		expect(menu.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
			"Projects",
			"Open a local folder",
			"Clone a repository",
			"Close project",
			"Remove from list",
		]);
	});

	it("opens the Projects page from the project name, with no section switch", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		const router = mountApp("/home/today");
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Projects" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
		// The page is a lazy chunk: under the load of the full run it can take more than a second.
		await screen.findByRole("heading", { level: 1, name: "Projects" }, { timeout: 5000 });
		// The heading of the loading state leaves when the cards come: read the one that stays.
		await waitFor(() =>
			expect(screen.getByRole("heading", { level: 1, name: "Projects" })).toBeInTheDocument(),
		);
		expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("opens a folder from the menu", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mockState().nextFolder = "/mock/beta";
		mountApp("/home/today");
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Open a local folder" }));
		await waitFor(async () => expect((await unwrap(commands.projectsActive()))?.name).toBe("beta"));
	});

	it("clones from the menu", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mountApp("/home/today");
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Clone a repository" }));
		const dialog = within(await screen.findByRole("dialog"));
		await user.type(
			dialog.getByRole("textbox", { name: "Repository address" }),
			"git@host:team/shipyard.git",
		);
		await user.click(dialog.getByRole("button", { name: "Choose a folder" }));
		await user.click(dialog.getByRole("button", { name: "Clone" }));
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.name).toBe("shipyard"),
		);
	});

	it("closes the project, keeps it in the list and opens it again from the first run", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mountApp("/home/today");
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Close project" }));
		const recent = await screen.findByRole("list", { name: "Recent projects" });
		expect(await unwrap(commands.projectsActive())).toBeNull();
		expect(mockState().projects).toHaveLength(1);
		await user.click(within(recent).getByRole("button", { name: /alpha/ }));
		expect(
			await screen.findByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
		).toBeInTheDocument();
		expect((await unwrap(commands.projectsActive()))?.name).toBe("alpha");
	});

	// The submenu of Remove from list opens with the focus on its first project.
	const removeFirst = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Remove from list" }));
		await user.keyboard("{ArrowRight}");
		await waitFor(() => expect(document.activeElement).toHaveTextContent(name));
		await user.keyboard("{Enter}");
	};

	it("keeps the list when the person refuses the confirm", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await open("/mock/beta");
		mockState().confirm = false;
		mountApp("/home/today");
		await removeFirst(user, /alpha/);
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		expect(mockState().projects).toHaveLength(2);
	});

	it("removes a project from the list after a confirm", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await open("/mock/beta");
		mountApp("/home/today");
		await removeFirst(user, /alpha/);
		await waitFor(() => expect(mockState().projects.map((p) => p.id)).toEqual(["beta"]));
		expect((await unwrap(commands.projectsActive()))?.name).toBe("beta");
	});

	it("removes the active project and shows the first run", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mountApp("/home/today");
		await removeFirst(user, /alpha/);
		await next(user);
		await screen.findByRole("button", { name: "Open a local folder" });
		expect(await unwrap(commands.projectsActive())).toBeNull();
		expect(mockState().projects).toHaveLength(0);
	});

	it("stays reachable as an icon button when the sidebar is collapsed", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mockState().prefs.sidebarOpen = false;
		mountApp("/home/today");
		// The switcher sits in the rail (look pass 1). A closed rail shows icons only: the name stays in the spoken name.
		const trigger = await screen.findByRole("button", { name: /^Project/ });
		await waitFor(() => expect(trigger).toHaveAccessibleName("Project alpha"));
		await user.click(trigger);
		expect(await screen.findByRole("menuitemradio", { name: /alpha/ })).toBeInTheDocument();
	});

	it("shows the recent projects of the registry, the last used first, on the first run", async () => {
		await open("/mock/alpha");
		await open("/mock/beta");
		await unwrap(commands.projectsClose());
		Object.assign(mockState().projects[0] ?? {}, { lastUsed: 200 });
		Object.assign(mockState().projects[1] ?? {}, { lastUsed: 100 });
		mountApp("/home/today");
		const recent = await screen.findByRole("list", { name: "Recent projects" });
		expect(
			within(recent)
				.getAllByRole("button")
				.map((b) => b.textContent),
		).toEqual(["alpha", "beta"]);
	});

	it("goes back to the last view of the project", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		Object.assign(mockState().projects[0] ?? {}, { lastView: "/settings/health" });
		mountApp("/home/today");
		// The old address of Health opens Health of this project, under This project.
		expect(
			await screen.findByRole("link", { name: "This project", current: "page" }),
		).toBeInTheDocument();
		expect(await screen.findByRole("button", { name: "Check again" })).toBeInTheDocument();
		await user.click(screen.getByRole("link", { name: "Library" }));
		await waitFor(() => expect(mockState().projects[0]?.lastView).toBe("/library/home"));
	});
});

describe("Settings / Project", () => {
	it("saves the paths to the project file and shows one primary action", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/setup/project");
		const input = await screen.findByRole("textbox", { name: "Decisions" });
		expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
		await user.clear(input);
		await user.type(input, "adr");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().files.alpha?.paths.decisions).toBe("adr"));
		await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
	});

	it("lists every path key and writes only the keys that the person changes", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/setup/project");
		for (const name of ["Diagrams", "Models", "Flows", "Test plans", "Dashboards", "Data models"])
			expect(await screen.findByRole("textbox", { name })).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Models" })).toHaveValue("docs/models");
		const models = screen.getByRole("textbox", { name: "Models" });
		await user.clear(models);
		await user.type(models, "docs/diagrams");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().files.alpha?.paths.models).toBe("docs/diagrams"));
		// A key that holds its default stays out of the file.
		expect(mockState().files.alpha?.paths.api).toBeUndefined();
	});

	it("edits the tracker scope and keeps it when the paths are saved", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/setup/project");
		const scope = await screen.findByRole("textbox", { name: "Issue tracker scope" });
		await user.type(scope, "PROJ");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().files.alpha?.connections?.trackerScope).toBe("PROJ"));
		const decisions = await screen.findByRole("textbox", { name: "Decisions" });
		await user.clear(decisions);
		await user.type(decisions, "adr");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().files.alpha?.paths.decisions).toBe("adr"));
		expect(mockState().files.alpha?.connections?.trackerScope).toBe("PROJ");
	});

	it("links the only tracker and picks its scope from the projects that it lists", async () => {
		const user = userEvent.setup();
		await open();
		const c = await unwrap(
			commands.connectionsAdd({
				name: "Acme",
				group: "tracker",
				kind: "jira-cloud",
				url: "https://acme.atlassian.net",
				user: "ada@example.com",
			}),
		);
		await unwrap(commands.connectionsSetSecret(c.id, "tok-scope-1"));
		mountApp("/setup/project");
		await user.click(await screen.findByRole("combobox", { name: "Issue tracker scope" }));
		await user.click(await screen.findByRole("option", { name: "OPS" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().files.alpha?.connections?.trackerScope).toBe("OPS"));
		expect(mockState().files.alpha?.connections?.tracker).toBe(c.id);
	});

	it("records the tracker and the forge of the project by connection id", async () => {
		const user = userEvent.setup();
		await unwrap(
			commands.connectionsAdd({
				name: "Acme",
				group: "tracker",
				kind: "linear",
				url: "",
				user: null,
			}),
		);
		await unwrap(
			commands.connectionsAdd({
				name: "Code",
				group: "forge",
				kind: "github",
				url: "https://github.com",
				user: null,
			}),
		);
		await open();
		mountApp("/setup/project");
		await user.click(await screen.findByRole("combobox", { name: "Issue tracker" }));
		await user.click(await screen.findByRole("option", { name: "Acme" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().files.alpha?.connections).toEqual({ tracker: "acme" }));
		// The forge list holds forges only, and no secret or address reaches the file.
		await user.click(screen.getByRole("combobox", { name: "Code host" }));
		expect(screen.queryByRole("option", { name: "Acme" })).toBeNull();
		await user.click(await screen.findByRole("option", { name: "Code" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().files.alpha?.connections).toEqual({ tracker: "acme", forge: "code" }),
		);
		expect(JSON.stringify(mockState().files.alpha)).not.toContain("github.com");
	});

	it("marks an override and applies the accent while the project is active", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/setup/project");
		await user.click(await screen.findByRole("combobox", { name: "Accent" }));
		await user.click(await screen.findByRole("option", { name: "Violet" }));
		await waitFor(() => expect(document.documentElement.dataset.accent).toBe("violet"));
		await user.click(screen.getByRole("combobox", { name: "Theme" }));
		await user.click(await screen.findByRole("option", { name: "Dark" }));
		await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
		expect(screen.getAllByRole("img", { name: "Set by the project" }).length).toBeGreaterThan(0);
		router.history.push("/setup/me");
		await screen.findByRole("combobox", { name: "Language" });
		expect(screen.getAllByRole("img", { name: "Set by the project" })).toHaveLength(1);
		expect(mockState().prefs.theme).toBe("light");
	});

	it("shows the first-run action when no project is active", async () => {
		mountApp("/setup/project");
		expect(await screen.findByRole("button", { name: "Open a local folder" })).toBeInTheDocument();
	});
});

describe("Settings / Project, project import", () => {
	it("imports from a folder and lists the copied, skipped and conflicting files", async () => {
		const user = userEvent.setup();
		await open();
		const spy = vi.spyOn(commands, "projectImport").mockResolvedValue({
			status: "ok",
			data: {
				copied: ["docs/a.md"],
				skipped: [{ path: "docs/b.md", reason: "not a project file" }],
				conflicts: ["docs/c.md"],
			},
		});
		mountApp("/setup/project");
		await user.click(await screen.findByRole("button", { name: "Import a project" }));
		expect(await screen.findByRole("heading", { name: "Copied (1)" })).toBeInTheDocument();
		expect(spy).toHaveBeenCalledOnce();
		expect(screen.getByRole("heading", { name: "Skipped (1)" })).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "docs/b.md" })).toHaveTextContent(
			"not a project file",
		);
		expect(screen.getByRole("heading", { name: "Conflicts (1)" })).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "docs/c.md" })).toHaveTextContent("Exists");
		spy.mockRestore();
	});

	it("shows the refusal of the command", async () => {
		const user = userEvent.setup();
		await open();
		const spy = vi.spyOn(commands, "projectImport").mockResolvedValue({
			status: "error",
			error: { code: "unknown", details: "no source folder", action: null },
		});
		mountApp("/setup/project");
		await user.click(await screen.findByRole("button", { name: "Import a project" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("no source folder");
		spy.mockRestore();
	});
});

describe("Settings / Health", () => {
	it("lists the groups of the project with a count, the group of this computer apart, and one fix for each finding", async () => {
		await open();
		const router = mountApp("/setup/computer?page=health");
		expect(await screen.findByRole("heading", { name: "Tools (0)" })).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: /^Compliance/ })).not.toBeInTheDocument();
		router.history.push("/setup/project?page=health");
		const compliance = await screen.findByRole("heading", { name: "Compliance (1)" });
		expect(compliance).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: /^Tools \(/ })).not.toBeInTheDocument();
		for (const name of ["Broken refs (1)", "Generated files (0)"])
			expect(screen.getByRole("heading", { name })).toBeInTheDocument();
		expect(screen.getByText("Broken ref adr:0009")).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: /^(Write|Open|Recheck)$/ })).toHaveLength(2);
	});

	it("shows the new file first and writes it only after the confirm click", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/setup/project?page=health");
		await user.click(await screen.findByRole("button", { name: "Write" }));
		expect(await screen.findByLabelText(".gitignore")).toHaveTextContent(".DS_Store");
		expect(mockState().fixed).toEqual([]);
		await user.click(screen.getByRole("button", { name: "Confirm" }));
		await waitFor(() => expect(mockState().fixed).toEqual(["ignore-missing"]));
		await screen.findByRole("heading", { name: "Compliance (0)" });
	});

	it("shows ghost rows and the ok shape for a healthy project", async () => {
		await open();
		mockState().fixed = ["ignore-missing", "ref-broken:adr:0009>spec:auth"];
		mountApp("/setup/project?page=health");
		const main = await screen.findByRole("main");
		expect(await within(main).findByRole("img", { name: "Success" })).toBeInTheDocument();
		// No fix button of a finding: the bootstrap, console and feedback panels have their own.
		expect(
			within(main).queryAllByRole("button", { name: /^(Write|Open|Apply|Recheck)$/ }),
		).toHaveLength(0);
	});

	it("links each health page to the findings of the other scope, with their count", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/setup/computer?page=health");
		await user.click(await screen.findByRole("link", { name: "Health of this project (2)" }));
		await waitFor(() => expect(router.state.location.href).toBe("/setup/project?page=health"));
		// This computer has no finding: no link.
		expect(await screen.findByRole("heading", { name: "Compliance (1)" })).toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: /^Health of this computer/ }),
		).not.toBeInTheDocument();
	});

	it("shows on the health of the project that a tool of this computer has a finding", async () => {
		await open();
		const run = vi.spyOn(commands, "healthRun").mockResolvedValue({
			status: "ok",
			data: [
				{
					id: "tool-missing:git",
					group: "tools",
					severity: "error",
					code: "tool-missing",
					detail: "git",
					source: null,
					fix: { kind: "recheck" },
				},
			],
		} as Awaited<ReturnType<typeof commands.healthRun>>);
		mountApp("/setup/project?page=health");
		expect(
			await screen.findByRole("link", { name: "Health of this computer (1)" }),
		).toHaveAttribute("href", "/setup/computer?page=health");
		run.mockRestore();
	});

	it("shows the worst finding in the account menu and opens Health from it", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/home/today");
		const link = await (await openAccount(user)).findByRole("menuitem", { name: /Health \(2\)/ });
		expect(within(link).getByRole("img", { name: "Warning" })).toBeInTheDocument();
		await user.click(link);
		expect(await screen.findByRole("heading", { name: "Compliance (1)" })).toBeInTheDocument();
	});

	it("reads French", async () => {
		await open();
		mockState().prefs.lang = "fr";
		mountApp("/setup/project?page=health");
		expect(await screen.findByRole("heading", { name: "Conformité (1)" })).toBeInTheDocument();
		expect(screen.getByText("Référence rompue adr:0009")).toBeInTheDocument();
	});
});

describe("Settings / Project, delivery files", () => {
	it("edits a persona rate and refuses a negative one with the reason", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/setup/project");
		const section = await screen.findByRole("region", { name: "Personas" });
		const rates = within(section).getAllByRole("spinbutton", { name: "Daily sale rate" });
		await user.clear(rates[0] as HTMLElement);
		await user.type(rates[0] as HTMLElement, "650");
		await user.click(within(section).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().delivery.personas[0]?.tjm).toBe(650));
		// A save resets the draft: the region is a new element.
		const again = () => within(screen.getByRole("region", { name: "Personas" }));
		await user.click(await screen.findByRole("button", { name: "Add persona" }));
		await user.click(again().getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().delivery.personas).toHaveLength(3));
		const low = await screen.findAllByRole("spinbutton", { name: "Daily cost" });
		fireEvent.change(low[0] as HTMLElement, { target: { value: "-5" } });
		await user.click(again().getByRole("button", { name: "Save" }));
		expect(await again().findByRole("alert")).toHaveTextContent("must be zero or more");
	}, 20_000);

	it("saves the issue types and the hours of a day, and refuses 0 hours", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/setup/project?page=tickets");
		const section = within(await screen.findByRole("region", { name: "Tickets" }));
		const story = section.getByRole("textbox", { name: "Story type" });
		await user.clear(story);
		await user.type(story, "Récit");
		const hours = section.getByRole("spinbutton", { name: "Hours per day" });
		await user.clear(hours);
		await user.type(hours, "0");
		await user.click(section.getByRole("button", { name: "Save" }));
		expect(await section.findByRole("alert")).toHaveTextContent("between 1 and 24");
		await user.clear(hours);
		await user.type(hours, "8");
		await user.click(section.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().delivery.tickets.story).toBe("Récit"));
		expect(mockState().delivery.tickets.hoursPerDay).toBe(8);
	});

	it("shows the folder and the remote, and saves how often the app looks at the remote", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/setup/project");
		const section = within(await screen.findByRole("region", { name: "Project" }));
		expect(await section.findByText("/mock/alpha")).toBeInTheDocument();
		expect(await section.findByText("https://example.com/acme/project.git")).toBeInTheDocument();
		await user.click(await section.findByRole("combobox", { name: "Look at the remote every" }));
		await user.click(await screen.findByRole("option", { name: "60 min" }));
		await waitFor(() => expect(mockState().code?.watchMinutes).toBe(60));
	});
});

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const open = (path = "/mock/alpha") => unwrap(commands.projectsOpen(path, false));
const firstRunButtons = () => within(screen.getByRole("main")).getAllByRole("button");

describe("first run", () => {
	it("shows the role as named cards, then three starts, with one primary action", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		await screen.findByRole("button", { name: "Open a local folder" });
		const roles = within(screen.getByRole("radiogroup", { name: "Role" })).getAllByRole("radio");
		expect(roles.map((r) => r.closest("label")?.textContent)).toEqual([
			"Project manager",
			"Architect",
			"Developer",
			"Tester",
			"Business analyst",
			"Functional lead",
			"Junior",
			"Other",
		]);
		expect(screen.getByRole("radio", { name: "Other" })).toBeChecked();
		await user.click(screen.getByRole("radio", { name: "Junior" }));
		await waitFor(() => expect(screen.getByRole("radio", { name: "Junior" })).toBeChecked());
		expect(mockState().prefs.role).toBe("junior");
		const buttons = firstRunButtons();
		expect(buttons.map((b) => b.textContent)).toEqual([
			"Open a local folder",
			"Clone a repository",
			"Create a project",
		]);
		expect(buttons.filter((b) => b.className.includes("bg-accent"))).toHaveLength(1);
		expect(buttons[0]?.className).toContain("bg-accent");
	});

	it("opens a local folder and lists it in the switcher", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: "Open a local folder" }));
		expect(await screen.findByRole("heading", { name: "Needs you" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^Project/ })).toHaveTextContent("alpha");
		expect(mockState().projects).toHaveLength(1);
	});

	it("opens a folder with no project file at once and writes the file without a question", async () => {
		const user = userEvent.setup();
		mockState().nextFolder = "/mock/bare";
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: "Open a local folder" }));
		expect(await screen.findByRole("heading", { name: "Needs you" })).toBeInTheDocument();
		expect(mockState().projects[0]?.path).toBe("/mock/bare");
	});

	it("names the missing repository, opens nothing and offers to make it a project", async () => {
		const user = userEvent.setup();
		mockState().nextFolder = "/mock/plain";
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: "Open a local folder" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("No Git repository in /mock/plain");
		expect(mockState().projects).toHaveLength(0);
		await user.click(screen.getByRole("button", { name: "Make it a project" }));
		expect(await screen.findByRole("heading", { name: "Needs you" })).toBeInTheDocument();
		expect(mockState().projects[0]?.path).toBe("/mock/plain");
	});

	it("creates a project from a name alone: the key comes from the name, the folder from Projects", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: "Create a project" }));
		expect(await screen.findByDisplayValue("/mock/Projects")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
		expect(screen.queryByRole("textbox", { name: "Key" })).toBeNull();
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Acme Web");
		await user.click(screen.getByRole("button", { name: "Create" }));
		expect(await screen.findByRole("heading", { name: "Needs you" })).toBeInTheDocument();
		expect(mockState().projects[0]).toMatchObject({
			name: "Acme Web",
			key: "ACMEWE",
			path: "/mock/Projects/acme-web",
		});
	});

	it("clones into a folder named after the repository", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: "Clone a repository" }));
		await user.type(
			screen.getByRole("textbox", { name: "Repository address" }),
			"git@host:team/shipyard.git",
		);
		await user.click(screen.getByRole("button", { name: "Choose a folder" }));
		await user.click(screen.getByRole("button", { name: "Clone" }));
		await screen.findByRole("heading", { name: "Needs you" });
		expect(mockState().projects[0]?.path).toBe("/mock/alpha/shipyard");
	});

	it("reads French", async () => {
		mockState().prefs.lang = "fr";
		mountApp("/home/inbox");
		expect(
			await screen.findByRole("button", { name: "Ouvrir un dossier local" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Créer un projet" })).toBeInTheDocument();
	});
});

describe("project switcher", () => {
	it("lists each project with the state of its working copy and switches", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		const beta = await open("/mock/beta");
		Object.assign(mockState().projects[0] ?? {}, { state: "missing" });
		mountApp("/home/inbox");
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
		mountApp("/home/inbox");
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

	it("offers Open folder, Clone, Close project and Remove from list in the one menu", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		const menu = within(await screen.findByRole("menu"));
		expect(menu.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
			"Open a local folder",
			"Clone a repository",
			"Close project",
			"Remove from list",
		]);
	});

	it("opens a folder from the menu", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mockState().nextFolder = "/mock/beta";
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Open a local folder" }));
		await waitFor(async () => expect((await unwrap(commands.projectsActive()))?.name).toBe("beta"));
	});

	it("clones from the menu", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mountApp("/home/inbox");
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
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Close project" }));
		const recent = await screen.findByRole("list", { name: "Recent projects" });
		expect(await unwrap(commands.projectsActive())).toBeNull();
		expect(mockState().projects).toHaveLength(1);
		await user.click(within(recent).getByRole("button", { name: /alpha/ }));
		expect(await screen.findByRole("heading", { name: "Needs you" })).toBeInTheDocument();
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
		mountApp("/home/inbox");
		await removeFirst(user, /alpha/);
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		expect(mockState().projects).toHaveLength(2);
	});

	it("removes a project from the list after a confirm", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await open("/mock/beta");
		mountApp("/home/inbox");
		await removeFirst(user, /alpha/);
		await waitFor(() => expect(mockState().projects.map((p) => p.id)).toEqual(["beta"]));
		expect((await unwrap(commands.projectsActive()))?.name).toBe("beta");
	});

	it("removes the active project and shows the first run", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mountApp("/home/inbox");
		await removeFirst(user, /alpha/);
		await screen.findByRole("button", { name: "Open a local folder" });
		expect(await unwrap(commands.projectsActive())).toBeNull();
		expect(mockState().projects).toHaveLength(0);
	});

	it("stays reachable as an icon button when the sidebar is collapsed", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mockState().prefs.sidebarOpen = false;
		mountApp("/home/inbox");
		// The switcher sits in the context bar since W10: it keeps the name when the sidebar folds.
		const trigger = await screen.findByRole("button", { name: /^Project/ });
		await waitFor(() => expect(trigger).toHaveTextContent("alpha"));
		await user.click(trigger);
		expect(await screen.findByRole("menuitemradio", { name: /alpha/ })).toBeInTheDocument();
	});

	it("shows the recent projects of the registry, the last used first, on the first run", async () => {
		await open("/mock/alpha");
		await open("/mock/beta");
		await unwrap(commands.projectsClose());
		Object.assign(mockState().projects[0] ?? {}, { lastUsed: 200 });
		Object.assign(mockState().projects[1] ?? {}, { lastUsed: 100 });
		mountApp("/home/inbox");
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
		mountApp("/home/inbox");
		expect(
			await screen.findByRole("link", { name: "Health", current: "page" }),
		).toBeInTheDocument();
		await user.click(screen.getByRole("link", { name: "Specs" }));
		await waitFor(() => expect(mockState().projects[0]?.lastView).toBe("/specs/changes"));
	});
});

describe("Settings / Project", () => {
	it("saves the paths to the project file and shows one primary action", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/settings/project");
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
		mountApp("/settings/project");
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
		mountApp("/settings/project");
		const scope = await screen.findByRole("textbox", { name: "Tracker scope" });
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
		mountApp("/settings/project");
		await user.click(await screen.findByRole("combobox", { name: "Tracker scope" }));
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
		mountApp("/settings/project");
		await user.click(await screen.findByRole("combobox", { name: "Tracker" }));
		await user.click(await screen.findByRole("option", { name: "Acme" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().files.alpha?.connections).toEqual({ tracker: "acme" }));
		// The forge list holds forges only, and no secret or address reaches the file.
		await user.click(screen.getByRole("combobox", { name: "Forge" }));
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
		mountApp("/settings/project");
		await user.click(await screen.findByRole("combobox", { name: "Accent" }));
		await user.click(await screen.findByRole("option", { name: "Violet" }));
		await waitFor(() => expect(document.documentElement.dataset.accent).toBe("violet"));
		await user.click(screen.getByRole("combobox", { name: "Theme" }));
		await user.click(await screen.findByRole("option", { name: "Dark" }));
		await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
		expect(screen.getAllByRole("img", { name: "Set by the project" }).length).toBeGreaterThan(0);
		await user.click(screen.getByRole("link", { name: "Me" }));
		await screen.findByRole("combobox", { name: "Language" });
		expect(screen.getAllByRole("img", { name: "Set by the project" })).toHaveLength(1);
		expect(mockState().prefs.theme).toBe("system");
	});

	it("shows the first-run action when no project is active", async () => {
		mountApp("/settings/project");
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
		mountApp("/settings/project");
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
		mountApp("/settings/project");
		await user.click(await screen.findByRole("button", { name: "Import a project" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("no source folder");
		spy.mockRestore();
	});
});

describe("Settings / Health", () => {
	it("lists four groups with a count and offers one fix for each finding", async () => {
		await open();
		mountApp("/settings/health");
		const compliance = await screen.findByRole("heading", { name: "Compliance (1)" });
		expect(compliance).toBeInTheDocument();
		for (const name of ["Tools (0)", "Broken refs (1)", "Generated files (0)"])
			expect(screen.getByRole("heading", { name })).toBeInTheDocument();
		expect(screen.getByText("Broken ref adr:0009")).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: /^(Write|Open|Recheck)$/ })).toHaveLength(2);
	});

	it("shows the new file first and writes it only after the confirm click", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/settings/health");
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
		mountApp("/settings/health");
		const main = await screen.findByRole("main");
		expect(await within(main).findByRole("img", { name: "Success" })).toBeInTheDocument();
		// No fix button of a finding: the bootstrap, console and feedback panels have their own.
		expect(
			within(main).queryAllByRole("button", { name: /^(Write|Open|Apply|Recheck)$/ }),
		).toHaveLength(0);
	});

	it("shows the worst finding in the status bar and opens Health from it", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/home/inbox");
		const bar = await screen.findByRole("contentinfo");
		const link = await within(bar).findByRole("link", { name: /Health \(2\)/ });
		expect(within(link).getByRole("img", { name: "Warning" })).toBeInTheDocument();
		await user.click(link);
		expect(await screen.findByRole("heading", { name: "Compliance (1)" })).toBeInTheDocument();
	});

	it("reads French", async () => {
		await open();
		mockState().prefs.lang = "fr";
		mountApp("/settings/health");
		expect(await screen.findByRole("heading", { name: "Conformité (1)" })).toBeInTheDocument();
		expect(screen.getByText("Référence rompue adr:0009")).toBeInTheDocument();
	});
});

describe("Settings / Project, delivery files", () => {
	it("edits a persona rate and refuses a negative one with the reason", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/settings/project");
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
		mountApp("/settings/project");
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
		mountApp("/settings/project");
		const section = within(await screen.findByRole("region", { name: "Project" }));
		expect(await section.findByText("/mock/alpha")).toBeInTheDocument();
		expect(await section.findByText("https://example.com/acme/project.git")).toBeInTheDocument();
		await user.click(await section.findByRole("combobox", { name: "Look at the remote every" }));
		await user.click(await screen.findByRole("option", { name: "60 min" }));
		await waitFor(() => expect(mockState().code?.watchMinutes).toBe(60));
	});
});

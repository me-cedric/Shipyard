import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const open = (path = "/mock/alpha") => unwrap(commands.projectsOpen(path, false));
const firstRunButtons = () => within(screen.getByRole("main")).getAllByRole("button");

describe("first run", () => {
	it("shows the role choice and three starts, with one primary action", async () => {
		mountApp("/home/inbox");
		await screen.findByRole("button", { name: "Open a local folder" });
		expect(screen.getByRole("combobox", { name: "Role" })).toBeInTheDocument();
		const buttons = firstRunButtons().filter((b) => b.getAttribute("role") !== "combobox");
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
		expect(screen.getByRole("combobox", { name: "Project" })).toHaveTextContent("alpha");
		expect(mockState().projects).toHaveLength(1);
	});

	it("asks before it writes a project file, and writes nothing on a refusal", async () => {
		const user = userEvent.setup();
		mockState().nextFolder = "/mock/bare";
		mockState().confirm = false;
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: "Open a local folder" }));
		await waitFor(() => expect(mockState().nextFolder).toBeUndefined());
		expect(mockState().projects).toHaveLength(0);
		mockState().nextFolder = "/mock/bare";
		mockState().confirm = true;
		await user.click(screen.getByRole("button", { name: "Open a local folder" }));
		expect(await screen.findByRole("heading", { name: "Needs you" })).toBeInTheDocument();
	});

	it("names the missing repository and opens nothing", async () => {
		const user = userEvent.setup();
		mockState().nextFolder = "/mock/plain";
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: "Open a local folder" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("No Git repository in /mock/plain");
		expect(mockState().projects).toHaveLength(0);
	});

	it("creates a project from a name, a key and a folder, with the keyboard", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: "Create a project" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Acme");
		await user.type(screen.getByRole("textbox", { name: "Key" }), "acme");
		expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Choose a folder" }));
		await user.click(screen.getByRole("button", { name: "Create" }));
		expect(await screen.findByRole("heading", { name: "Needs you" })).toBeInTheDocument();
		expect(mockState().projects[0]).toMatchObject({ name: "Acme", key: "ACME" });
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
		const switcher = await screen.findByRole("combobox", { name: "Project" });
		expect(switcher).toHaveTextContent("beta");
		await user.click(switcher);
		const option = await screen.findByRole("option", { name: /alpha/ });
		expect(within(option).getByRole("img", { name: "Missing" })).toBeInTheDocument();
		expect(
			within(screen.getByRole("option", { name: /beta/ })).getByRole("img", { name: "Clean" }),
		).toBeInTheDocument();
		await user.click(option);
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.name).toBe("alpha"),
		);
		expect(beta.project?.id).toBe("beta");
	});

	it("changes the project with the arrow keys and Enter", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await open("/mock/beta");
		mountApp("/home/inbox");
		const switcher = await screen.findByRole("combobox", { name: "Project" });
		switcher.focus();
		await user.keyboard("{Enter}");
		// The list loads after it opens: keys sent before the options exist are lost.
		await screen.findByRole("option", { name: /alpha/ });
		await screen.findByRole("option", { name: /beta/ });
		await user.keyboard("{ArrowUp}{Enter}");
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.name).toBe("alpha"),
		);
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

describe("Settings / Project, Legacy import", () => {
	it("imports from a folder and lists the copied, skipped and conflicting files", async () => {
		const user = userEvent.setup();
		await open();
		const spy = vi.spyOn(commands, "projectImport").mockResolvedValue({
			status: "ok",
			data: {
				copied: ["docs/a.md"],
				skipped: [{ path: "docs/b.md", reason: "not a Legacy file" }],
				conflicts: ["docs/c.md"],
			},
		});
		mountApp("/settings/project");
		await user.click(await screen.findByRole("button", { name: "Import Legacy project" }));
		expect(await screen.findByRole("heading", { name: "Copied (1)" })).toBeInTheDocument();
		expect(spy).toHaveBeenCalledOnce();
		expect(screen.getByRole("heading", { name: "Skipped (1)" })).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "docs/b.md" })).toHaveTextContent("not a Legacy file");
		expect(screen.getByRole("heading", { name: "Conflicts (1)" })).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "docs/c.md" })).toHaveTextContent("Exists");
		spy.mockRestore();
	});

	it("shows the refusal of the command", async () => {
		const user = userEvent.setup();
		await open();
		const spy = vi
			.spyOn(commands, "projectImport")
			.mockResolvedValue({ status: "error", error: "no Legacy folder" });
		mountApp("/settings/project");
		await user.click(await screen.findByRole("button", { name: "Import Legacy project" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("no Legacy folder");
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
		expect(within(main).queryAllByRole("button")).toHaveLength(0);
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

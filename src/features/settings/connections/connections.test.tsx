import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ConnectionDraft_Deserialize, commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const TOKEN = "tok-view-secret-9";

const draft = (over: Partial<ConnectionDraft_Deserialize> = {}): ConnectionDraft_Deserialize => ({
	name: "Acme",
	group: "tracker",
	kind: "linear",
	url: "",
	user: null,
	...over,
});

/** A connection that exists before the view opens. */
async function seed(over: Partial<ConnectionDraft_Deserialize> = {}, secret = TOKEN) {
	const c = await unwrap(commands.connectionsAdd(draft(over)));
	if (secret) await unwrap(commands.connectionsSetSecret(c.id, secret));
	return c;
}

const row = (name: string) => screen.findByRole("group", { name });
const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));

describe("Settings / Connections", () => {
	it("offers the actions of a connection in its context menu", async () => {
		const user = userEvent.setup();
		await seed({ name: "Acme" });
		mountApp("/settings/connections");
		fireEvent.contextMenu(await row("Acme"));
		const menu = await screen.findByRole("menu");
		expect(
			within(menu)
				.getAllByRole("menuitem")
				.map((i) => i.textContent),
		).toEqual(["Test", "Edit", "Remove", "Copy ref"]);
		await user.click(within(menu).getByRole("menuitem", { name: "Copy ref" }));
		expect(await navigator.clipboard.readText()).toBe("conn:acme");
		fireEvent.contextMenu(await row("Acme"));
		await user.click(await screen.findByRole("menuitem", { name: "Test" }));
		expect(await within(await row("Acme")).findByRole("status")).toHaveTextContent("Passed");
	});

	it("shows ghost rows and one primary action when no connection exists", async () => {
		mountApp("/settings/connections");
		const main = await screen.findByRole("main");
		const add = await within(main).findByRole("button", { name: "Connection" });
		expect(add.className).toContain("bg-accent");
		expect(main.querySelectorAll("[aria-hidden] > *").length).toBeGreaterThanOrEqual(5);
		// The runners are detected, not added: they come first. The MCP servers (with the recommended
		// set), the outside agents server and the certificates wait in Advanced.
		expect(
			within(main)
				.getAllByRole("heading", { level: 2 })
				.map((h) => h.textContent),
		).toEqual(["Runners (5)", "MCP servers (0)", "Outside agents", "Certificates"]);
		expect(within(main).getByText("Advanced").closest("details")).not.toHaveAttribute("open");
	});

	it("groups the connections by kind with a count and one primary action", async () => {
		await seed({ name: "Acme" });
		await seed({ name: "Beta", kind: "github", url: "https://github.com" });
		await seed({ name: "Code", group: "forge", kind: "github", url: "https://github.com" });
		mountApp("/settings/connections");
		expect(await screen.findByRole("heading", { name: "Trackers (2)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Forges (1)" })).toBeInTheDocument();
		const primary = within(screen.getByRole("main"))
			.getAllByRole("button")
			.filter((b) => b.className.includes("bg-accent"));
		expect(primary.map((b) => b.textContent)).toEqual(["Connection"]);
	});

	it("shows the six flags of a tracker, on or off, with a shape each", async () => {
		await seed({ name: "Acme" });
		await seed({ name: "Beta", kind: "github", url: "https://github.com" });
		mountApp("/settings/connections");
		const flags = within(await row("Acme")).getByRole("list", { name: "Flags" });
		expect(within(flags).getAllByRole("listitem")).toHaveLength(6);
		const shape = (list: HTMLElement, name: string) =>
			within(within(list).getByText(name).closest("li") as HTMLElement)
				.getByRole("img")
				.getAttribute("data-shape");
		expect(shape(flags, "Time tracking")).toBe("dash");
		expect(shape(flags, "Hierarchy")).toBe("circle");
		const github = within(await row("Beta")).getByRole("list", { name: "Flags" });
		expect(shape(github, "Hierarchy")).toBe("dash");
	});

	it("adds a Linear tracker with a secret and never shows the secret again", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Connection" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Acme");
		await user.click(screen.getByRole("combobox", { name: "Product" }));
		await user.click(await screen.findByRole("option", { name: "Linear" }));
		expect(screen.queryByRole("textbox", { name: "Address" })).toBeNull();
		const secret = screen.getByLabelText("API key", { selector: "input" });
		expect(secret).toHaveAttribute("type", "password");
		await user.type(secret, TOKEN);
		await user.click(screen.getByRole("button", { name: "Save" }));
		const created = await row("Acme");
		expect(within(created).getByText("Linear")).toBeInTheDocument();
		expect(mockState().secrets.acme).toBe(TOKEN);
		expect(screen.queryByDisplayValue(TOKEN)).toBeNull();
		// Open the connection again: the field is empty and shows the mask.
		await user.click(within(created).getByRole("button", { name: "Edit" }));
		const again = screen.getByLabelText("API key", { selector: "input" });
		expect(again).toHaveValue("");
		expect(again).toHaveAttribute("placeholder", "••••••••");
		expect(document.body.innerHTML).not.toContain(TOKEN);
	});

	it("fills the name and the address from the git remote, and a token link opens the product page", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Connection" }));
		await waitFor(() =>
			expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("GitHub"),
		);
		expect(screen.getByRole("textbox", { name: "Address" })).toHaveValue("https://github.com");
		expect(screen.getByRole("combobox", { name: "Product" })).toHaveTextContent("GitHub Issues");
		expect(screen.getByLabelText("Personal access token", { selector: "input" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Create a token" }));
		await waitFor(() =>
			expect(mockState().openedPages).toEqual(["https://github.com/settings/tokens"]),
		);
	});

	it("runs the test on Save and keeps the form when the token is refused", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Connection" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Acme");
		await user.click(screen.getByRole("combobox", { name: "Product" }));
		await user.click(await screen.findByRole("option", { name: "Linear" }));
		await user.type(screen.getByLabelText("API key", { selector: "input" }), "revoked");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("the token was rejected");
		expect(screen.getByRole("textbox", { name: "Name" })).toBeVisible();
		expect(mockState().connections[0]?.state).toBe("failed");
	});

	it("links the only tracker connection to the open project", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Connection" }));
		// Another product drops the name and the address that the remote gave.
		await user.click(screen.getByRole("combobox", { name: "Product" }));
		await user.click(await screen.findByRole("option", { name: "Linear" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Acme");
		await user.type(screen.getByLabelText("API key", { selector: "input" }), TOKEN);
		await user.click(screen.getByRole("button", { name: "Save" }));
		await row("Acme");
		const project = (await unwrap(commands.projectSettings()))?.file;
		expect(project?.connections?.tracker).toBe("acme");
	});

	it("offers the projects of the new tracker and saves the pick as the scope", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Connection" }));
		await user.click(screen.getByRole("combobox", { name: "Product" }));
		await user.click(await screen.findByRole("option", { name: "Linear" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Acme");
		await user.type(screen.getByLabelText("API key", { selector: "input" }), TOKEN);
		await user.click(screen.getByRole("button", { name: "Save" }));
		await user.click(await screen.findByRole("combobox", { name: "Tracker scope" }));
		await user.click(await screen.findByRole("option", { name: "OPS" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(async () =>
			expect((await unwrap(commands.projectSettings()))?.file?.connections?.trackerScope).toBe(
				"OPS",
			),
		);
	});

	it("names a bad value and keeps the form", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Connection" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Acme");
		await user.type(
			screen.getByRole("textbox", { name: "Address" }),
			"http://insecure.example{Enter}",
		);
		expect(await screen.findByRole("alert")).toHaveTextContent("https");
		expect(mockState().connections).toHaveLength(0);
	});

	it("edits the name and keeps the saved secret", async () => {
		const user = userEvent.setup();
		await seed({ name: "Acme" });
		mountApp("/settings/connections");
		await user.click(within(await row("Acme")).getByRole("button", { name: "Edit" }));
		const name = screen.getByRole("textbox", { name: "Name" });
		await user.clear(name);
		await user.type(name, "Renamed");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await row("Renamed")).toBeInTheDocument();
		expect(mockState().secrets.acme).toBe(TOKEN);
		expect(mockState().connections[0]?.secret).toBe(true);
	});

	it("tests a connection and shows the result and the state", async () => {
		const user = userEvent.setup();
		await seed({ name: "Acme" });
		mountApp("/settings/connections");
		const acme = await row("Acme");
		expect(within(acme).getByRole("img", { name: "Untested" })).toBeInTheDocument();
		await user.click(within(acme).getByRole("button", { name: "Test" }));
		expect(await within(acme).findByRole("status")).toHaveTextContent("Passed: Ada Lovelace");
		await waitFor(() =>
			expect(within(acme).getAllByRole("img", { name: "Passed" }).length).toBeGreaterThan(0),
		);
	});

	it("names the missing scope when the test fails", async () => {
		const user = userEvent.setup();
		await seed({
			name: "Code",
			group: "forge",
			kind: "github",
			url: "https://noscope.example.com",
		});
		mountApp("/settings/connections");
		const code = await row("Code");
		await user.click(within(code).getByRole("button", { name: "Test" }));
		expect(await within(code).findByRole("status")).toHaveTextContent(
			"Missing scope: Pull requests: read",
		);
		expect(within(code).getAllByRole("img", { name: "Failed" }).length).toBeGreaterThan(0);
	});

	it("tests with the keyboard", async () => {
		const user = userEvent.setup();
		await seed({ name: "Acme" }, "revoked");
		mountApp("/settings/connections");
		const acme = await row("Acme");
		const test = within(acme).getByRole("button", { name: "Test" });
		// The button is on the Tab path.
		for (let i = 0; i < 80 && document.activeElement !== test; i++) await user.tab();
		expect(test).toHaveFocus();
		await user.keyboard("{Enter}");
		expect(await within(acme).findByRole("status")).toHaveTextContent("the token was rejected");
	});

	it("lists the project that names the connection before it removes it", async () => {
		const user = userEvent.setup();
		const c = await seed({ name: "Acme" });
		await open();
		await unwrap(
			commands.projectFileSave({
				name: "alpha",
				key: "ALPHA",
				paths: {},
				defaultWorkflow: null,
				gates: [],
				connections: { tracker: c.id },
			}),
		);
		mountApp("/settings/connections");
		await user.click(within(await row("Acme")).getByRole("button", { name: "Remove" }));
		expect(await screen.findByRole("heading", { name: "Project (1)" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /project:alpha/ })).toBeInTheDocument();
	});

	it("lists a project that is not the active one and waits for the list before it confirms", async () => {
		const user = userEvent.setup();
		const c = await seed({ name: "Acme" });
		await open();
		await unwrap(
			commands.projectFileSave({
				name: "alpha",
				key: "ALPHA",
				paths: {},
				defaultWorkflow: null,
				gates: [],
				connections: { tracker: c.id },
			}),
		);
		await unwrap(commands.projectsOpen("/mock/beta", false));
		mountApp("/settings/connections");
		await user.click(within(await row("Acme")).getByRole("button", { name: "Remove" }));
		expect(await screen.findByRole("button", { name: /project:alpha/ })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
	});

	it("lists the entities that use a connection, then removes it with its secret", async () => {
		const user = userEvent.setup();
		await open();
		await seed({ name: "Linear" });
		mountApp("/settings/connections");
		const linear = await row("Linear");
		await user.click(within(linear).getByRole("button", { name: "Remove" }));
		expect(
			await within(linear).findByRole("button", { name: "spec:auth, Spec: auth, Resolved" }),
		).toBeInTheDocument();
		// Cancel keeps both.
		await user.click(within(linear).getByRole("button", { name: "Cancel" }));
		expect(mockState().connections).toHaveLength(1);
		expect(mockState().secrets.linear).toBe(TOKEN);
		await user.click(within(linear).getByRole("button", { name: "Remove" }));
		await user.click(within(linear).getByRole("button", { name: "Confirm" }));
		await waitFor(() => expect(screen.queryByRole("group", { name: "Linear" })).toBeNull());
		expect(mockState().connections).toHaveLength(0);
		expect(mockState().secrets).toEqual({});
	});

	it("lists the repositories of a forge and marks the one with no push right", async () => {
		const user = userEvent.setup();
		await seed({ name: "Code", group: "forge", kind: "github", url: "https://github.com" });
		await seed({ name: "Acme" });
		mountApp("/settings/connections");
		expect(within(await row("Acme")).queryByRole("button", { name: "Repositories" })).toBeNull();
		const code = await row("Code");
		await user.click(within(code).getByRole("button", { name: "Repositories" }));
		expect(
			await within(code).findByRole("heading", { name: "Repositories (2)" }),
		).toBeInTheDocument();
		const docs = within(code).getByRole("group", { name: "acme/docs" });
		expect(within(docs).getByText("No push")).toBeInTheDocument();
		expect(
			within(within(code).getByRole("group", { name: "acme/web" })).queryByText("No push"),
		).toBeNull();
	});

	it("creates a repository from the name and shows the refusal of a bad name", async () => {
		const user = userEvent.setup();
		await seed({ name: "Code", group: "forge", kind: "github", url: "https://github.com" });
		mountApp("/settings/connections");
		const code = await row("Code");
		await user.click(within(code).getByRole("button", { name: "Repositories" }));
		const field = await within(code).findByRole("textbox", { name: "Repository name" });
		const create = within(code).getByRole("button", { name: "Create repository" });
		expect(create).toBeDisabled();
		await user.type(field, "web");
		await user.click(create);
		expect(await within(code).findByRole("alert")).toHaveTextContent("owner/name");
		await user.clear(field);
		await user.type(field, "acme/new");
		await user.click(create);
		await waitFor(() => expect(field).toHaveValue(""));
		expect(within(code).queryByRole("alert")).toBeNull();
	});

	it("shows one form at a time", async () => {
		const user = userEvent.setup();
		await seed({ name: "Acme" });
		mountApp("/settings/connections");
		await user.click(within(await row("Acme")).getByRole("button", { name: "Edit" }));
		expect(screen.getByRole("button", { name: "Connection" }).className).not.toContain("bg-accent");
		const primary = within(screen.getByRole("main"))
			.getAllByRole("button")
			.filter((b) => b.className.includes("bg-accent"));
		expect(primary.map((b) => b.textContent)).toEqual(["Save"]);
	});

	it("reads French", async () => {
		mockState().prefs.lang = "fr";
		await seed({ name: "Acme" });
		mountApp("/settings/connections");
		expect(await screen.findByRole("heading", { name: "Trackers (1)" })).toBeInTheDocument();
		const acme = await row("Acme");
		expect(within(acme).getByRole("button", { name: "Tester" })).toBeInTheDocument();
		expect(within(acme).getByRole("list", { name: "Capacités" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Connexion" })).toBeInTheDocument();
	});

	it("makes a forge connection from a gh login, and a refused token leaves none", async () => {
		const user = userEvent.setup();
		mockState().logins = [{ tool: "gh", host: "github.com", user: "ana-dev" }];
		mockState().refusedLogins = ["github.com"];
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Connection" }));
		// The add form opens on a tracker: the logins belong to a forge.
		expect(screen.queryByText("ana-dev on github.com (gh)")).toBeNull();
		await user.click(screen.getByRole("combobox", { name: "Type" }));
		await user.click(await screen.findByRole("option", { name: "Forge" }));
		const login = await screen.findByRole("group", { name: "ana-dev on github.com (gh)" });
		await user.click(within(login).getByRole("button", { name: "Use this login" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("The token was refused");
		expect(mockState().connections).toHaveLength(0);

		mockState().refusedLogins = [];
		await user.click(within(login).getByRole("button", { name: "Use this login" }));
		expect(await row("github.com (gh)")).toBeInTheDocument();
		expect(mockState().connections[0]?.group).toBe("forge");
		expect(screen.queryByText("from the tool")).toBeNull();
	}, 20_000);
});

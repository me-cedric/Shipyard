import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { errorMessages } from "@/lib/i18n/errors";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const open = (path: string) => unwrap(commands.projectsOpen(path, false));

// spec:app-redesign#REQ-003
describe("Projects", () => {
	it("shows the open project with what needs the person and its agents, and the ones opened before", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await open("/mock/beta");
		mountApp("/projects");
		const now = within(await screen.findByRole("list", { name: "Open" }));
		const beta = within(now.getByRole("listitem", { name: "beta" }));
		// The chips are sentences from the real counts.
		expect(
			await beta.findByText(/^(\d+ need you|1 needs you|Nothing needs you)$/),
		).toBeInTheDocument();
		expect(
			beta.getByText(/^(\d+ agents at work|1 agent at work|No agent at work)$/),
		).toBeInTheDocument();
		expect(beta.getByText("Open", { selector: "span" })).toBeInTheDocument();
		const close = beta.getByRole("button", { name: "Close project" });
		expect(close).toHaveClass("min-h-control");
		expect(close).toHaveTextContent(/^Close$/);
		// The open project keeps Remove in the menu of the project switch.
		expect(beta.queryByRole("button", { name: /^Remove/ })).toBeNull();
		const before = within(screen.getByRole("list", { name: "Opened before" }));
		const alpha = within(before.getByRole("listitem", { name: "alpha" }));
		expect(alpha.queryByText(/need you|needs you/)).toBeNull();
		expect(alpha.queryByRole("button", { name: "Close project" })).toBeNull();
		const remove = alpha.getByRole("button", { name: "Remove from the list: alpha" });
		expect(remove).toHaveTextContent(/^Remove from the list$/);
		// The card shows the name, the chips and two buttons. The rest stays behind Details.
		expect(alpha.queryByText("2 ahead")).toBeNull();
		expect(alpha.queryByText("example.com")).toBeNull();
		expect(alpha.queryByText("/mock/alpha")).toBeNull();
		expect(screen.queryByRole("button", { name: "Open remote alpha" })).toBeNull();
		const details = screen.getByRole("button", { name: "Details alpha" });
		expect(details).toHaveAttribute("aria-expanded", "false");
		await user.click(details);
		expect(details).toHaveAttribute("aria-expanded", "true");
		expect(alpha.getByText("/mock/alpha")).toBeInTheDocument();
		expect(alpha.getByText("2 ahead")).toBeInTheDocument();
		expect(alpha.getByText("main")).toBeInTheDocument();
		// The details name the code host of the remote, or Local, and the last commit with a plain date.
		expect(alpha.getByText("example.com")).toBeInTheDocument();
		expect(
			alpha.getByText(/^feat: first commit · \d+ \w+ 2026|^feat: first commit · \w+ \d+, 2026/),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Open remote alpha" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Details beta" }));
		expect(beta.getByText("Local")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Open remote beta" })).toBeNull();
		expect(screen.getByText("Drop a folder here")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Open alpha" }));
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.name).toBe("alpha"),
		);
	});

	it("opens the open project on the page before Projects", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		const router = mountApp("/code/history");
		await screen.findByRole("main");
		router.history.push("/projects");
		await user.click(await screen.findByRole("button", { name: "Open alpha" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/code/history"));
	});

	it("opens the open project on its first page when Projects is the first page", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		Object.assign(mockState().projects[0] ?? {}, { lastView: "/projects" });
		const router = mountApp("/projects");
		await user.click(await screen.findByRole("button", { name: "Open alpha" }));
		await waitFor(() => expect(router.state.location.pathname).not.toBe("/projects"));
	});

	it("closes the open project and removes one from the list after a confirm", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await open("/mock/beta");
		// No agent works: a close asks nothing.
		for (const r of mockState().factory.runs) r.state = "Done";
		mountApp("/projects");
		await user.click(await screen.findByRole("button", { name: "Remove from the list: alpha" }));
		await waitFor(() => expect(mockState().projects.map((p) => p.name)).toEqual(["beta"]));
		await user.click(screen.getByRole("button", { name: "Close project" }));
		await waitFor(async () => expect(await unwrap(commands.projectsActive())).toBeNull());
	});

	it("offers the four ways to start as text buttons, and Import projects opens This project", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		const router = mountApp("/projects");
		await screen.findByRole("list", { name: "Open" });
		for (const name of ["Import projects", "Open a folder", "Clone from the code host"]) {
			const button = screen.getByRole("button", { name });
			expect(button).toHaveClass("min-h-control");
			expect(button.querySelector("svg")).toBeNull();
		}
		expect(screen.getByRole("button", { name: "New project" })).toHaveClass(
			"min-h-control",
			"bg-primary",
		);
		// New project is a page with its own address: Back comes back to Projects.
		await user.click(screen.getByRole("button", { name: "New project" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/projects/new"));
		await screen.findByRole("navigation", { name: "Steps" });
		await user.click(screen.getByRole("button", { name: "Back" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
		await user.click(await screen.findByRole("button", { name: "Clone from the code host" }));
		const clone = await screen.findByRole("dialog", { name: "Get a project from the code host" });
		await user.click(within(clone).getByRole("button", { name: "Close" }));
		await user.click(screen.getByRole("button", { name: "Import projects" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/project"));
		expect(router.state.location.hash).toBe("section-import");
	});

	it("names a folder with no Git and offers to make it a project", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mountApp("/projects");
		mockState().nextFolder = "/mock/plain";
		await user.click(await screen.findByRole("button", { name: "Open a folder" }));
		expect(await screen.findByText("No Git repository in /mock/plain")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Make it a project" }));
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.path).toBe("/mock/plain"),
		);
	});
});

describe("Projects errors", () => {
	it("shows the sentence of the error code, not the raw text or the error name", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await open("/mock/beta");
		vi.spyOn(commands, "projectsSwitch").mockResolvedValue({
			status: "error",
			error: { code: "read_only", details: "the project is read only", action: null },
		});
		mountApp("/projects");
		await user.click(await screen.findByRole("button", { name: "Open alpha" }));
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(errorMessages.en.read_only);
		expect(alert).not.toHaveTextContent("AppFailure");
	});
});

describe("Settings / Project overrides and profile", () => {
	it("saves the opt-outs and the profile in the registry, not in the repository", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mountApp("/setup/project");
		await user.click(await screen.findByRole("switch", { name: "Watch the remote" }));
		await waitFor(() => expect(mockState().projects[0]?.overrides.remoteWatch).toBe(false));
		await user.click(screen.getByRole("switch", { name: "Read only" }));
		await waitFor(() => expect(mockState().projects[0]?.overrides.readOnly).toBe(true));
	});
});

describe("Clone dialog repo picker", () => {
	beforeEach(() => localStorage.removeItem("shipyard.cloneFolder"));
	const hub = () =>
		unwrap(
			commands.connectionsAdd({
				name: "Hub",
				group: "forge",
				kind: "github",
				url: "https://github.com",
				user: null,
			}),
		);
	const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
		mountApp("/home/today");
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		await user.click(
			await screen.findByRole("menuitem", { name: "Get a project from the code host" }),
		);
		return within(await screen.findByRole("dialog"));
	};

	it("shows the lock, the read-only badge, the description and the branch of each row", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await hub();
		const dialog = await openDialog(user);
		const web = await dialog.findByRole("button", { name: "Clone acme/web" });
		expect(within(web).getByRole("img", { name: "Private" })).toBeInTheDocument();
		expect(web).toHaveAttribute("title", "The web app");
		expect(within(web).getByText("main")).toBeInTheDocument();
		const docs = dialog.getByRole("button", { name: "Clone acme/docs" });
		expect(within(docs).getByText("Read-only")).toBeInTheDocument();
		expect(within(docs).queryByRole("img", { name: "Private" })).toBeNull();
	});

	it("searches the name and the description, and clones with Enter into the default folder", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await hub();
		const dialog = await openDialog(user);
		await dialog.findByRole("button", { name: "Clone acme/web" });
		const search = dialog.getByRole("searchbox", { name: "Search repositories" });
		await user.type(search, "notes");
		expect(dialog.queryByRole("button", { name: "Clone acme/web" })).toBeNull();
		await user.clear(search);
		await user.type(search, "{ArrowDown}{Enter}");
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.path).toBe("/mock/Projects/docs"),
		);
	});

	it("loads every page and says when the list is capped", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await hub();
		const one = (n: number) => ({
			slug: `acme/r${n}`,
			url: `https://example.com/acme/r${n}`,
			defaultBranch: "main",
			archived: false,
			canPush: true,
			description: "",
			private: false,
		});
		const spy = vi.spyOn(commands, "connectionsRepos").mockImplementation(async (_id, cursor) => {
			const page = Number(cursor ?? 0);
			return {
				status: "ok",
				data: {
					items: Array.from({ length: 100 }, (_, i) => one(page * 100 + i)),
					next: String(page + 1),
				},
			};
		});
		const dialog = await openDialog(user);
		expect(await dialog.findByText("1000+")).toBeInTheDocument();
		expect(
			dialog.getByTitle(/The list shows only the first 1000 repositories/),
		).toBeInTheDocument();
		expect(spy).toHaveBeenCalledTimes(10);
		spy.mockRestore();
	});

	it("filters by owner", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await hub();
		const repo = (slug: string) => ({
			slug,
			url: `https://example.com/${slug}`,
			defaultBranch: "main",
			archived: false,
			canPush: true,
			description: "",
			private: false,
		});
		const spy = vi.spyOn(commands, "connectionsRepos").mockResolvedValue({
			status: "ok",
			data: { items: [repo("acme/web"), repo("zed/api")], next: null },
		});
		const dialog = await openDialog(user);
		await dialog.findByRole("button", { name: "Clone zed/api" });
		await user.click(dialog.getByRole("combobox", { name: "Owner" }));
		await user.click(await screen.findByRole("option", { name: "zed" }));
		expect(dialog.queryByRole("button", { name: "Clone acme/web" })).toBeNull();
		expect(dialog.getByRole("button", { name: "Clone zed/api" })).toBeInTheDocument();
		spy.mockRestore();
	});

	it("tells a person with no account to sign in with gh or glab, and offers to add one", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		const dialog = await openDialog(user);
		expect(await dialog.findByText("gh auth login")).toBeInTheDocument();
		expect(dialog.getByText("glab auth login")).toBeInTheDocument();
		expect(dialog.getByRole("button", { name: "Add account" })).toBeInTheDocument();
	});

	it("lists a gh login with its source and makes a connection when it is picked", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mockState().logins = [{ tool: "gh", host: "github.com", user: "ana-dev" }];
		const dialog = await openDialog(user);
		await user.click(await dialog.findByRole("combobox", { name: "Account" }));
		await user.click(await screen.findByRole("option", { name: "ana-dev (gh)" }));
		await dialog.findByRole("button", { name: "Clone acme/web" });
	});

	it("still takes a link and a new remote repository", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await hub();
		const dialog = await openDialog(user);
		await dialog.findByRole("button", { name: "Clone acme/web" });
		await user.type(dialog.getByRole("textbox", { name: "New remote repository" }), "acme/fresh");
		await user.click(dialog.getByRole("button", { name: "Create repository" }));
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.path).toBe("/mock/Projects/fresh"),
		);
	});
});

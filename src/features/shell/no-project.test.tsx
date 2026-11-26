import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

/** Open the menu of Open a project. */
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(await screen.findByRole("button", { name: "Open a project" }));
	return within(await screen.findByRole("menu"));
};

describe("No-project page (REQ-006)", () => {
	it.each([
		"/work/backlog",
		"/specs/capabilities",
		"/code/changes",
		"/design/architecture",
		"/factory/runs",
		"/knowledge/graph",
	])("%s offers the ways to open a project on a bare page with one h1", async (path) => {
		const user = userEvent.setup();
		const router = mountApp(path);
		// One compact card: New project (outline) and Open a project (primary).
		expect(await screen.findByRole("button", { name: "Open a project" })).toHaveClass(
			"min-h-control",
			"bg-primary",
		);
		expect(screen.getByRole("button", { name: "New project" })).not.toHaveClass("bg-primary");
		const menu = await openMenu(user);
		expect(menu.getByRole("menuitem", { name: "Open a local folder" })).toBeInTheDocument();
		expect(
			menu.getByRole("menuitem", { name: "Get a project from the code host" }),
		).toBeInTheDocument();
		await user.keyboard("{Escape}");
		// The title of the page is the one h1: the page shows without the shell.
		expect(within(screen.getByRole("main")).getAllByRole("heading", { level: 1 })).toHaveLength(1);
		expect(screen.getByRole("heading", { level: 1, name: "No project is open" })).toBeVisible();
		expect(screen.queryByRole("navigation")).toBeNull();
		expect(screen.queryByRole("combobox", { name: "Ask or tell Shipyard" })).toBeNull();
		expect(screen.getByRole("button", { name: "Skip to the content" })).toBeInTheDocument();
		for (const b of within(screen.getByRole("region", { name: "No project is open" })).getAllByRole(
			"button",
		))
			expect(b).toHaveClass("min-h-control");
		// New project is a page with its own address, not a dialog.
		await user.click(screen.getByRole("button", { name: "New project" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/projects/new"));
		expect(await screen.findByRole("navigation", { name: "Steps" })).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("draws no rail before the first page and keeps the Ask layer closed after Mod+K on a bare page", async () => {
		const user = userEvent.setup();
		const router = mountApp("/");
		// The first paint is bare: the rail does not show before the first run.
		expect(screen.queryByRole("navigation")).toBeNull();
		await screen.findByRole("button", { name: "Continue" });
		expect(screen.queryByRole("navigation")).toBeNull();
		await user.keyboard("{Control>}k{/Control}");
		// A project opens: the shell shows and the Ask layer stays closed.
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await router.navigate({ to: "/projects" });
		expect(await screen.findByRole("combobox", { name: "Ask or tell Shipyard" })).toHaveAttribute(
			"aria-expanded",
			"false",
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("goes to the project list, which shows with the shell", async () => {
		const user = userEvent.setup();
		const router = mountApp("/work/backlog");
		await user.click((await openMenu(user)).getByRole("menuitem", { name: "Projects" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
		expect(await screen.findByRole("navigation", { name: "Sidebar" })).toBeInTheDocument();
		expect(await screen.findByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows the shell again when a project opens", async () => {
		const user = userEvent.setup();
		const router = mountApp("/work/backlog");
		await user.click((await openMenu(user)).getByRole("menuitem", { name: "Open a local folder" }));
		expect(await screen.findByRole("navigation", { name: "Sidebar" })).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows the error when the folder is not a repository", async () => {
		const user = userEvent.setup();
		const router = mountApp("/work/backlog");
		mockState().nextFolder = "/mock/plain";
		await user.click((await openMenu(user)).getByRole("menuitem", { name: "Open a local folder" }));
		expect(await screen.findByText("No Git repository in /mock/plain")).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});

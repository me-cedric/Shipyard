import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const open = (path: string) => unwrap(commands.projectsOpen(path, false));

describe("Home / Projects", () => {
	it("lists a card for each project, grouped by host, and opens one", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await open("/mock/beta");
		mountApp("/home/projects");
		const group = await screen.findByRole("region", { name: "example.com" });
		expect(within(group).getByText("alpha")).toBeInTheDocument();
		expect(within(group).getByText("2 ahead")).toBeInTheDocument();
		expect(screen.getByRole("region", { name: "Local" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Details alpha" }));
		expect(screen.getByText("/mock/alpha")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Open remote alpha" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Open remote beta" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Open alpha" }));
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.name).toBe("alpha"),
		);
	});
});

describe("Settings / Project overrides and profile", () => {
	it("saves the opt-outs and the profile in the registry, not in the repository", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		mountApp("/settings/project");
		await user.click(await screen.findByRole("switch", { name: "Watch the remote" }));
		await waitFor(() => expect(mockState().projects[0]?.overrides.remoteWatch).toBe(false));
		await user.click(screen.getByRole("switch", { name: "Read only" }));
		await waitFor(() => expect(mockState().projects[0]?.overrides.readOnly).toBe(true));
		await user.click(screen.getByRole("switch", { name: "Spaces Factory" }));
		await waitFor(() =>
			expect(mockState().projects[0]?.overrides.profileTabs).not.toContain("factory"),
		);
	});

	it("hides the spaces that the profile hides and keeps Home and Settings", async () => {
		await open("/mock/alpha");
		const p = mockState().projects[0];
		if (p) p.overrides.profileTabs = ["code"];
		mountApp("/home/inbox");
		await screen.findByRole("link", { name: /Code/ });
		expect(screen.queryByRole("link", { name: /Factory/ })).toBeNull();
		expect(screen.getByRole("link", { name: /Settings/ })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Home/ })).toBeInTheDocument();
	});
});

describe("Clone dialog repo picker", () => {
	it("lists the repositories of a forge account, marks the ones that cannot be pushed and fills the address", async () => {
		const user = userEvent.setup();
		await open("/mock/alpha");
		await unwrap(
			commands.connectionsAdd({
				name: "Hub",
				group: "forge",
				kind: "github",
				url: "https://github.com",
				user: null,
			}),
		);
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Clone a repository" }));
		const dialog = within(await screen.findByRole("dialog"));
		await dialog.findByRole("button", { name: "Use acme/web" });
		expect(dialog.getByText("Cannot push")).toBeInTheDocument();
		await user.type(dialog.getByRole("searchbox", { name: "Search repositories" }), "docs");
		expect(dialog.queryByRole("button", { name: "Use acme/web" })).toBeNull();
		await user.click(dialog.getByRole("button", { name: "Use acme/docs" }));
		expect(dialog.getByRole("textbox", { name: "Repository address" })).toHaveValue(
			"https://example.com/acme/docs",
		);
		await user.type(dialog.getByRole("textbox", { name: "New remote repository" }), "acme/fresh");
		await user.click(dialog.getByRole("button", { name: "Create repository" }));
		await waitFor(() =>
			expect(dialog.getByRole("textbox", { name: "Repository address" })).toHaveValue(
				"https://example.com/acme/fresh",
			),
		);
	});
});

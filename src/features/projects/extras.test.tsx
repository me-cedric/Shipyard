import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Settings / Project and Health: name, logo, git tools, linked inspect, feedback e-mail", () => {
	beforeEach(async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
	}, 20_000);

	it("renames the project and sets its logo, which shows in the top bar", async () => {
		const user = userEvent.setup();
		mountApp("/settings/project");
		// The name is the first field of the project form; Save writes the project file.
		const [name] = await screen.findAllByRole("textbox", { name: "Name" });
		if (!name) throw new Error("no name field");
		await user.clear(name);
		await user.type(name, "Alpha web");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(async () =>
			expect((await unwrap(commands.projectSettings()))?.file?.name).toBe("Alpha web"),
		);
		mockState().nextFile = "/Users/ada/logo.png";
		const fresh = await screen.findByRole("region", { name: "Project" });
		await user.click(within(fresh).getByRole("button", { name: "Choose a picture" }));
		await waitFor(() => expect(mockState().extras.pictures.logo).toBeDefined());
		expect(await screen.findByRole("img", { name: "Alpha web" })).toBeInTheDocument();
	}, 20_000);

	it("shows and restores a stash, and brings a lagging branch up to date after a click", async () => {
		const user = userEvent.setup();
		await unwrap(commands.codeStashPush("Half done"));
		mockState().extras.behind["feat/auth/login"] = 2;
		mountApp("/settings/project");
		const panel = await screen.findByRole("region", { name: "Repository" });
		await user.click(
			await within(panel).findByRole("button", { name: "Show the changes of Half done" }),
		);
		expect(await within(panel).findAllByRole("region", { name: /^Diff of / })).not.toHaveLength(0);
		await user.click(within(panel).getByRole("button", { name: "Restore Half done" }));
		await waitFor(async () => expect(await unwrap(commands.codeStashList())).toHaveLength(0));
		await user.click(
			await within(panel).findByRole("button", { name: "Bring feat/auth/login up to date" }),
		);
		expect(await screen.findByText("feat/auth/login is up to date now")).toBeInTheDocument();
		await expect(unwrap(commands.gitBranchFastForward("main", false))).rejects.toThrow(
			"Confirm this action",
		);
	}, 20_000);

	it("inspects a linked project and writes a feedback e-mail", async () => {
		const user = userEvent.setup();
		mountApp("/settings/health");
		const panel = await screen.findByRole("region", { name: "Linked projects" });
		await user.click(await within(panel).findByRole("button", { name: "Inspect API gateway" }));
		expect(await screen.findByText("chore: deploy compass")).toBeInTheDocument();
		await user.type(screen.getByRole("textbox", { name: "Title" }), "Slow board");
		await user.click(screen.getByRole("button", { name: "Open in mail" }));
		await waitFor(() => expect(mockState().extras.mails).toHaveLength(1));
		expect(mockState().extras.mails[0]).toContain("subject=Slow%20board");
	}, 20_000);
});

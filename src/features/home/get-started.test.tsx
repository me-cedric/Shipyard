import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

describe("Home / Get started", () => {
	it("marks each step from the real state and opens the place of the next one", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/inbox");
		const list = await screen.findByRole("list", { name: "Get started" });
		const steps = within(list).getAllByRole("link");
		expect(steps.map((s) => s.textContent)).toEqual([
			"1Connect a tracker",
			"2Connect a forge",
			"Set the team Done",
			"Write the first spec Done",
			"Start the first run Done",
		]);
		expect(steps[0]).toHaveAttribute("aria-current", "step");
		expect(screen.getByRole("progressbar", { name: "Get started (3)" })).toHaveAttribute(
			"aria-valuenow",
			"3",
		);
		await user.click(steps[0] as HTMLElement);
		expect(await screen.findByRole("link", { name: "Connections", current: "page" })).toBeVisible();
	});

	it("goes away when every step is done", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/inbox");
		await screen.findByRole("list", { name: "Get started" });
		const draft = { url: "https://github.com", user: null } as const;
		const tracker = await unwrap(
			commands.connectionsAdd({ ...draft, name: "Issues", group: "tracker", kind: "github" }),
		);
		const forge = await unwrap(
			commands.connectionsAdd({ ...draft, name: "Hub", group: "forge", kind: "github" }),
		);
		const settings = await unwrap(commands.projectSettings());
		if (!settings?.file) throw new Error("no project file");
		await unwrap(
			commands.projectFileSave({
				...settings.file,
				connections: { tracker: tracker.id, forge: forge.id },
			}),
		);
		// A new visit reads the state again.
		await user.click(screen.getByRole("link", { name: "Activity" }));
		await user.click(await screen.findByRole("link", { name: "Inbox" }));
		await waitFor(() => expect(screen.queryByRole("list", { name: "Get started" })).toBeNull());
	});
});

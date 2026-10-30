import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Settings / Project screens", () => {
	it("hides a tab of a space for this project, in the registry, and never lists Settings", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/settings/project");
		const card = await screen.findByRole("region", { name: "Screens" });
		expect(within(card).queryByRole("group", { name: "Settings" })).toBeNull();
		const code = within(card).getByRole("group", { name: "Code" });
		await user.click(within(code).getByRole("checkbox", { name: "Terminal" }));
		await waitFor(() =>
			expect(mockState().projects[0]?.overrides.hiddenTabs).toEqual(["code/terminal"]),
		);
		await user.click(screen.getByRole("link", { name: /Code/ }));
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		await within(tabs).findByRole("link", { name: "Changes" });
		expect(within(tabs).queryByRole("link", { name: "Terminal" })).toBeNull();
	});

	it("sends a visit of a hidden tab to the first kept tab, and keeps the last tab of a space", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const p = mockState().projects[0];
		if (p) p.overrides.hiddenTabs = ["home/inbox", "home/my-work", "home/activity"];
		const router = mountApp("/home/inbox");
		await waitFor(() => expect(router.state.location.pathname).toBe("/home/projects"));
		await router.navigate({ to: "/settings/project" });
		const home = within(await screen.findByRole("group", { name: "Home" }));
		expect(home.getByRole("checkbox", { name: "Projects" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
	});
});

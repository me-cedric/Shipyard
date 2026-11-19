import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Settings / Project: agent review of each pull request", () => {
	it("is off by default, turns on as a draft and saves one of the modes", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/code/changes");
		const on = await screen.findByRole("switch", { name: "Agent review of each pull request" });
		expect(on).not.toBeChecked();
		expect(screen.queryByRole("group", { name: "Review mode" })).toBeNull();
		await user.click(on);
		await waitFor(() => expect(mockState().sync.automation.auto_review).toBe("draft"));
		const mode = await screen.findByRole("group", { name: "Review mode" });
		await user.click(within(mode).getByRole("button", { name: "Post" }));
		await waitFor(() => expect(mockState().sync.automation.auto_review).toBe("post"));
		await user.click(screen.getByRole("switch", { name: "Agent review of each pull request" }));
		await waitFor(() => expect(mockState().sync.automation.auto_review).toBe("off"));
	});
});

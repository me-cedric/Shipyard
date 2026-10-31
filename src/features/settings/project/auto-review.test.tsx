import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Settings / Project: agent review of each pull request", () => {
	it("is off by default and saves one of three choices", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/settings/project");
		const choice = await screen.findByRole("combobox", {
			name: "Agent review of each pull request",
		});
		expect(choice).toHaveTextContent("Off");
		await user.click(choice);
		await user.click(await screen.findByRole("option", { name: "Draft" }));
		await waitFor(() => expect(mockState().sync.automation.auto_review).toBe("draft"));
		await user.click(
			await screen.findByRole("combobox", { name: "Agent review of each pull request" }),
		);
		expect(await screen.findAllByRole("option")).toHaveLength(3);
	});
});

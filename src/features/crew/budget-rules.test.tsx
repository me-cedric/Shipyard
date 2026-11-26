import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

// spec:runs-recipes#REQ-006: Warn at is one percent for the project, and each budget has a row Then.
describe("Warn at and Then of budgets", () => {
	it("edits Warn at on Spend, and the file holds the percent", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/crew/spend");
		const limits = within(
			(await screen.findByRole("heading", { name: "Limits" })).parentElement as HTMLElement,
		);
		expect(limits.getByText("80%")).toBeVisible();
		await user.click(limits.getByRole("button", { name: "Edit Warn at" }));
		const field = limits.getByRole("spinbutton", { name: "Warn at, in percent" });
		await user.clear(field);
		await user.type(field, "70");
		await user.click(limits.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().factory.budgets.warn_at).toBe(70));
		expect(await limits.findByText("70%")).toBeVisible();
	});

	it("refuses a percent out of 1 to 100 and keeps the old one", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/crew/spend");
		await user.click(await screen.findByRole("button", { name: "Edit Warn at" }));
		for (const bad of ["0", "101", "x"]) {
			const field = screen.getByRole("spinbutton", { name: "Warn at, in percent" });
			await user.clear(field);
			await user.type(field, bad);
			await user.click(screen.getByRole("button", { name: "Save" }));
			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Warn at: a whole number from 1 to 100",
			);
		}
		expect(mockState().factory.budgets.warn_at).toBeUndefined();
	});

	it("sets Then of the budget of each day, and the other budgets keep Stop and ask", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/crew/spend?page=budgets");
		await user.click(await screen.findByRole("combobox", { name: "Then, each day" }));
		await user.click(await screen.findByRole("option", { name: "Go on" }));
		await waitFor(() => expect(mockState().factory.budgets.at_limit?.day).toBe("go_on"));
		expect(mockState().factory.budgets.at_limit).toEqual({
			feature: "stop_ask",
			day: "go_on",
			member: "stop_ask",
		});
		expect(screen.getByRole("combobox", { name: "Then, each feature" })).toHaveTextContent(
			"Stop and ask",
		);
		expect(screen.getByRole("combobox", { name: "Then, each day" })).toHaveTextContent("Go on");
	});
});

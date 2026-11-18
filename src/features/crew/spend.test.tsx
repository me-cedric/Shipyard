import { screen, waitFor, within } from "@testing-library/react";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
import { renderApp } from "@/ui/test-utils";
import { Spend } from "./spend";

// spec:app-redesign#REQ-016: Spend is a section of Crew, and the budgets have their place on it.
describe("Crew / Spend: the budgets", () => {
	const mount = () =>
		renderApp(
			<ShellProvider>
				<Spend />
			</ShellProvider>,
		);

	it("shows the budgets of the project and of this computer under the one heading Crew", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.budgetSet("day", "*", 5));
		mount();
		const budgets = within(await screen.findByRole("region", { name: "Budgets" }));
		expect(budgets.getByText("Per day")).toBeInTheDocument();
		expect(budgets.getByText("$5.00")).toBeInTheDocument();
		expect(budgets.getByText("Ada Lovelace")).toBeInTheDocument();
		expect(await screen.findByRole("spinbutton", { name: "Monthly budget (USD)" })).toBeVisible();
		const heads = screen.getAllByRole("heading", { level: 1 });
		expect(heads).toHaveLength(1);
		expect(heads[0]).toHaveTextContent("Crew");
	});

	it("turns Set budget off without project.settings, with the reason", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		mount();
		const budgets = within(await screen.findByRole("region", { name: "Budgets" }));
		(await budgets.findByRole("button", { name: "Edit" })).click();
		const set = await budgets.findByRole("button", { name: "Set budget" });
		await waitFor(() =>
			expect(set).toHaveAccessibleDescription(
				"Needs the right project.settings (your role: Viewer)",
			),
		);
	});
});

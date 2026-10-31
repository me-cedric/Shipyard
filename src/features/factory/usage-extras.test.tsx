import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
import { renderApp } from "@/ui/test-utils";
import { Usage } from "./index";

describe("Factory / Usage: iterations and prices", () => {
	it("counts the iterations of each run and shows the prices only after a click", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const u = await unwrap(commands.usageGet());
		const run = u.runs.find((r) => r.iterations > 0);
		if (!run) throw new Error("no run");
		renderApp(
			<ShellProvider>
				<Usage />
			</ShellProvider>,
		);
		const table = await screen.findByRole("table", { name: "Usage" });
		expect(within(table).getByRole("columnheader", { name: "Iterations" })).toBeInTheDocument();
		expect(within(table).getAllByText("Hidden").length).toBeGreaterThan(0);
		expect(within(table).queryByText(`$${(run.usd ?? 0).toFixed(2)}`)).toBeNull();
		await user.click(screen.getByRole("switch", { name: "Show prices" }));
		expect(within(table).getAllByText(`$${(run.usd ?? 0).toFixed(2)}`).length).toBeGreaterThan(0);
	});
});

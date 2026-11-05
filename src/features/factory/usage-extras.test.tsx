import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
import { clearViewState, setViewProject } from "@/lib/shell/view-state";
import { renderApp } from "@/ui/test-utils";
import { Usage } from "./index";

describe("Factory / Usage: iterations and prices", () => {
	beforeEach(() => clearViewState());

	it("counts the iterations of each run, shows the prices by default and hides them on a click", async () => {
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
		expect(screen.getByRole("switch", { name: "Show prices" })).toBeChecked();
		expect(within(table).getAllByText(`$${(run.usd ?? 0).toFixed(2)}`).length).toBeGreaterThan(0);
		await user.click(screen.getByRole("switch", { name: "Show prices" }));
		expect(within(table).queryByText(`$${(run.usd ?? 0).toFixed(2)}`)).toBeNull();
	});

	it("remembers the switch, and a money tile shows tokens and never Hidden when it is off", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		setViewProject("demo");
		const shown = () =>
			renderApp(
				<ShellProvider>
					<Usage />
				</ShellProvider>,
			);
		const first = shown();
		await screen.findByRole("table", { name: "Usage" });
		await user.click(screen.getByRole("switch", { name: "Show prices" }));
		expect(screen.getByText("Tokens today")).toBeInTheDocument();
		expect(screen.getByText("Runs")).toBeInTheDocument();
		expect(screen.queryByText("Spend today")).toBeNull();
		first.unmount();
		shown();
		await screen.findByRole("table", { name: "Usage" });
		expect(screen.getByRole("switch", { name: "Show prices" })).not.toBeChecked();
		setViewProject("");
	});

	it("shows the loading skeleton and no zero while the usage loads", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		vi.spyOn(commands, "usageGet").mockReturnValue(new Promise(() => {}));
		vi.spyOn(commands, "machineSpend").mockReturnValue(new Promise(() => {}));
		renderApp(
			<ShellProvider>
				<Usage />
			</ShellProvider>,
		);
		expect((await screen.findAllByRole("status", { name: "Loading" })).length).toBeGreaterThan(0);
		expect(screen.queryByText("$0.00")).toBeNull();
		expect(screen.queryByRole("table")).toBeNull();
		vi.restoreAllMocks();
	});

	it("the Show prices switch also shows the prices of this computer", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		vi.spyOn(commands, "machineSpend").mockResolvedValue({
			status: "ok",
			data: {
				rows: [
					{
						day: new Date().toISOString().slice(0, 10),
						runner: "claude",
						model: "m",
						project: "p",
						tokens: 10,
						costUsd: 12.34,
					},
				],
				budgets: [],
			},
		});
		renderApp(
			<ShellProvider>
				<Usage />
			</ShellProvider>,
		);
		await screen.findByRole("table", { name: "Usage" });
		await screen.findByRole("table", { name: /computer|machine/i });
		expect(screen.getAllByText("$12.34").length).toBeGreaterThan(0);
		await user.click(screen.getByRole("switch", { name: "Show prices" }));
		expect(screen.queryByText("$12.34")).toBeNull();
		expect(screen.getByText("Tokens this month")).toBeInTheDocument();
		vi.restoreAllMocks();
	});
});

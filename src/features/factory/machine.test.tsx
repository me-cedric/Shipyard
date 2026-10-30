import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
import { renderApp } from "@/ui/test-utils";
import { Sessions, Usage } from "./index";
import { group } from "./usage/machine-usage";

async function renderTab(tab: React.ReactNode) {
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	return renderApp(<ShellProvider>{tab}</ShellProvider>);
}

describe("Factory / machine-wide AI sessions and spend", () => {
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	});

	it("Sessions: lists every session on the computer and stops a running one", async () => {
		const user = userEvent.setup();
		await renderTab(<Sessions />);
		const table = await screen.findByRole("table", { name: "This computer" });
		expect(await within(table).findByText("Fix the login")).toBeInTheDocument();
		expect(within(table).getByText("Done")).toBeInTheDocument();
		// A finished session has no process: only the two running ones can stop.
		expect(screen.getAllByRole("button", { name: /^Stop (claude|codex) / })).toHaveLength(2);
		await user.click(screen.getByRole("button", { name: "Stop claude alpha" }));
		await waitFor(async () =>
			expect((await unwrap(commands.machineSessions())).map((s) => s.pid)).toEqual([4188, null]),
		);
		await waitFor(() => expect(screen.queryByText("Fix the login")).not.toBeInTheDocument());
	});

	it("Sessions: a stop of a process that is gone shows the reason", async () => {
		await renderTab(<Sessions />);
		await expect(unwrap(commands.machineSessionStop(1, true))).rejects.toThrow(
			"no AI session runs",
		);
		await expect(unwrap(commands.machineSessionStop(4188, false))).rejects.toThrow("click");
	});

	it("Usage: a chart by day, spend by runner, and a monthly budget with its meter", async () => {
		const user = userEvent.setup();
		await renderTab(<Usage />);
		expect(await screen.findByRole("img", { name: "Spend by day" })).toBeInTheDocument();
		const table = await screen.findByRole("table", { name: "This computer" });
		expect(within(table).getByText("claude")).toBeInTheDocument();
		expect(within(table).getByText("codex")).toBeInTheDocument();

		await user.click(screen.getByRole("combobox", { name: "Group by" }));
		await user.click(await screen.findByRole("option", { name: "By model" }));
		expect(await within(table).findByText("claude-opus-4")).toBeInTheDocument();

		await user.type(screen.getByRole("spinbutton", { name: "Monthly budget (USD)" }), "0.01");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(async () =>
			expect((await unwrap(commands.machineSpend(30))).budgets).toEqual([
				{ runner: "", usd: 0.01 },
			]),
		);
		expect(await screen.findByRole("meter", { name: /Monthly budget/ })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Remove" }));
		await waitFor(async () =>
			expect((await unwrap(commands.machineSpend(30))).budgets).toEqual([]),
		);
	});

	it("a negative budget is refused", async () => {
		await expect(unwrap(commands.machineBudgetSet("claude", -1))).rejects.toThrow("0 or more");
	});

	it("groups spend by key and sorts days newest first and the rest by spend", () => {
		const row = (day: string, runner: string, costUsd: number) => ({
			day,
			runner,
			model: "m",
			project: "p",
			tokens: 10,
			costUsd,
		});
		const rows = [row("2026-10-01", "a", 1), row("2026-10-02", "b", 5), row("2026-10-02", "a", 2)];
		expect(group(rows, "day").map((l) => l.name)).toEqual(["2026-10-02", "2026-10-01"]);
		expect(group(rows, "runner")).toEqual([
			{ name: "b", tokens: 10, usd: 5 },
			{ name: "a", tokens: 20, usd: 3 },
		]);
	});
});

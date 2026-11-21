import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { group } from "./usage/machine-usage";

let router: ReturnType<typeof mountApp> | undefined;
afterEach(() => waitFor(() => expect(router?.state.status ?? "idle").toBe("idle")));

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
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		router = mountApp("/crew/sessions");
		const here = await screen.findByRole("region", { name: "On this machine" });
		expect(await within(here).findByText("Fix the login")).toBeInTheDocument();
		expect(within(here).getByText("Done")).toBeInTheDocument();
		// A finished session has no process: only the two running ones can stop.
		expect(screen.getAllByRole("button", { name: /^Stop (claude|codex) / })).toHaveLength(2);
		await user.click(screen.getByRole("button", { name: "Stop claude alpha" }));
		await waitFor(async () =>
			expect((await unwrap(commands.machineSessions())).map((s) => s.pid)).toEqual([4188, null]),
		);
		await waitFor(() => expect(screen.queryByText("Fix the login")).not.toBeInTheDocument());
	});

	it("Sessions: lists the Orca sessions and brings one forward after a click", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		router = mountApp("/crew/sessions");
		const card = await screen.findByRole("region", { name: "Orca sessions" });
		expect(await within(card).findByText("Approve file edit")).toBeInTheDocument();
		await user.click(within(card).getByRole("button", { name: "Open in Orca Claude Code" }));
		await waitFor(() => expect(mockState().orcaOpened).toEqual(["t1"]));
		await expect(unwrap(commands.orcaOpen("t1", false))).rejects.toMatchObject({
			details: expect.stringMatching(/click/),
		});
	});

	it("Sessions: a stop of a process that is gone shows the reason", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		router = mountApp("/crew/sessions");
		await screen.findByRole("region", { name: "On this machine" });
		await expect(unwrap(commands.machineSessionStop(1, true))).rejects.toMatchObject({
			details: expect.stringContaining("no AI session runs"),
		});
		await expect(unwrap(commands.machineSessionStop(4188, false))).rejects.toMatchObject({
			details: expect.stringContaining("click"),
		});
	});

	it("Usage: a chart by day and spend by runner on How agents do", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/crew/spend?page=usage");
		expect(await screen.findByRole("img", { name: "Spend by day" })).toBeInTheDocument();
		const table = await screen.findByRole("table", { name: "This computer" });
		expect(within(table).getByText("Claude Code")).toBeInTheDocument();
		expect(within(table).getByText("Codex")).toBeInTheDocument();

		await user.click(screen.getByRole("combobox", { name: "Group by" }));
		await user.click(await screen.findByRole("option", { name: "By model" }));
		expect(await within(table).findByText("claude-opus-4")).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("Usage: Budgets sets the monthly budget of this computer, and a blank amount clears it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/crew/spend?page=budgets");
		await user.click(await screen.findByRole("button", { name: "Edit the limit of each month" }));
		await user.type(screen.getByRole("spinbutton", { name: "Monthly budget (USD)" }), "0.01");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(async () =>
			expect((await unwrap(commands.machineSpend(30))).budgets).toEqual([
				{ runner: "", usd: 0.01 },
			]),
		);
		await user.click(await screen.findByRole("button", { name: "Edit the limit of each month" }));
		await user.clear(screen.getByRole("spinbutton", { name: "Monthly budget (USD)" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(async () =>
			expect((await unwrap(commands.machineSpend(30))).budgets).toEqual([]),
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("a negative budget is refused", async () => {
		await expect(unwrap(commands.machineBudgetSet("claude", -1))).rejects.toMatchObject({
			details: expect.stringContaining("0 or more"),
		});
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

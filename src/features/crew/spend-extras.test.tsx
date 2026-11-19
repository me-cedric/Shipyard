import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { clearViewState, setViewProject } from "@/lib/shell/view-state";
import { mountApp } from "@/test/mount";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

// spec:app-redesign#REQ-016: How agents do holds the success rate, the requests, the machine and the usage.
describe("Crew / Spend / How agents do", () => {
	beforeEach(() => clearViewState());

	it("counts the iterations of each run, shows the prices by default and hides them on a click", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const u = await unwrap(commands.usageGet());
		const run = u.runs.find((r) => r.iterations > 0);
		if (!run) throw new Error("no run");
		const router = mountApp("/crew/spend?page=how");
		const table = await screen.findByRole("table", { name: "Usage" });
		expect(within(table).getByRole("columnheader", { name: "Iterations" })).toBeInTheDocument();
		expect(screen.getByRole("switch", { name: "Show prices" })).toBeChecked();
		expect(within(table).getAllByText(`$${(run.usd ?? 0).toFixed(2)}`).length).toBeGreaterThan(0);
		await user.click(screen.getByRole("switch", { name: "Show prices" }));
		expect(within(table).queryByText(`$${(run.usd ?? 0).toFixed(2)}`)).toBeNull();
		await idle(router);
	});

	it("remembers the switch, and a money tile shows tokens and never Hidden when it is off", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		setViewProject("demo");
		const first = mountApp("/crew/spend?page=how");
		await screen.findByRole("table", { name: "Usage" });
		await user.click(screen.getByRole("switch", { name: "Show prices" }));
		expect(screen.getByText("Tokens today")).toBeInTheDocument();
		expect(screen.getByText("Runs")).toBeInTheDocument();
		expect(screen.queryByText("Spend today")).toBeNull();
		// The switch holds on the other pages of Spend.
		await first.navigate({ to: "/crew/spend", search: {} as never });
		expect((await screen.findAllByText("Hidden")).length).toBeGreaterThan(0);
		expect(screen.getByRole("switch", { name: "Show prices" })).not.toBeChecked();
		await idle(first);
		setViewProject("");
	});

	it("shows the loading skeleton and no zero while the usage loads", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		vi.spyOn(commands, "usageGet").mockReturnValue(new Promise(() => {}));
		vi.spyOn(commands, "machineSpend").mockReturnValue(new Promise(() => {}));
		mountApp("/crew/spend?page=how");
		expect((await screen.findAllByRole("status", { name: "Loading" })).length).toBeGreaterThan(0);
		expect(screen.queryByText("$0.00")).toBeNull();
		expect(screen.queryByRole("table", { name: "Usage" })).toBeNull();
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
		const router = mountApp("/crew/spend?page=how");
		await screen.findByRole("table", { name: "Usage" });
		await screen.findByRole("table", { name: /computer|machine/i });
		expect(screen.getAllByText("$12.34").length).toBeGreaterThan(0);
		await user.click(screen.getByRole("switch", { name: "Show prices" }));
		expect(screen.queryByText("$12.34")).toBeNull();
		expect(screen.getByText("Tokens this month")).toBeInTheDocument();
		vi.restoreAllMocks();
		await idle(router);
	});

	it("shows the success rate with one block for each run: two done runs of four ended", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const states = ["Done", "Merged", "Failed", "Cancelled"] as const;
		mockState().factory.runs.forEach((r, i) => {
			r.state = states[i] ?? "Working";
		});
		const router = mountApp("/crew/spend?page=how");
		await screen.findByRole("table", { name: "Usage" });
		const strip = await screen.findByRole("img", { name: "Outcome of the last 4 runs" });
		expect(strip.children).toHaveLength(4);
		expect((await screen.findAllByText("50 %")).length).toBeGreaterThan(1);
		expect(screen.getByText("2/4")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "The runs" })).toHaveAttribute("href", "/flow/done");
		await idle(router);
	});

	it("nests the requests of a run under its steps, and the Flame switch draws a bar for each step", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const u = await unwrap(commands.usageGet());
		const trees = await Promise.all(u.runs.map((r) => unwrap(commands.usageTreeGet(r.run))));
		const at = trees.findIndex((x) => x.steps.some((s) => s.tokens > 0));
		const run = u.runs[at];
		const tree = trees[at];
		const step = tree?.steps.find((s) => s.tokens > 0);
		if (!run || !tree || !step) throw new Error("the demo has a started run");
		// The run of the address is the one that shows.
		const router = mountApp(`/crew/spend?page=how&run=${run.run}`);
		await screen.findByRole("heading", { name: "Requests of one run" });
		const shown = tree.steps.reduce((n, s) => n + s.requests.length, 0);
		await waitFor(() => expect(document.querySelectorAll("details li")).toHaveLength(shown));
		await user.click(screen.getByRole("button", { name: "Flame" }));
		const graph = await screen.findByRole("region", { name: "Spend flame graph" });
		const bar = await within(graph).findByRole("button", {
			name: `${step.step}: ${step.tokens} tokens`,
		});
		bar.focus();
		expect(bar).toHaveFocus();
		await idle(router);
	});

	it("opens the sessions from the machine card", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/crew/spend?page=how");
		expect(await screen.findByRole("link", { name: /sessions? runs?$/ })).toHaveAttribute(
			"href",
			"/crew/sessions",
		);
		await idle(router);
	});
});

describe("Crew / Spend: the empty page", () => {
	it("titles the empty page for no budget, and Set budget opens Budgets", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().factory.runs.length = 0;
		mockState().factory.budgets = { day: {}, member: {} };
		const router = mountApp("/crew/spend");
		expect(await screen.findByText("No budget")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Set budget" }));
		expect(await screen.findByRole("heading", { level: 1, name: "Budgets" })).toBeInTheDocument();
		await idle(router);
	});

	it("titles the empty page for budgets with no usage", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().factory.runs.length = 0;
		mockState().factory.budgets.day["*"] = 5;
		const router = mountApp("/crew/spend");
		expect(await screen.findByText("No usage yet")).toBeInTheDocument();
		expect(screen.queryByText("No budget")).toBeNull();
		await idle(router);
	});
});

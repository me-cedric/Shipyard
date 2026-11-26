import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

const viewer = () => {
	mockState().person = {
		member: "bo",
		found: "email",
		role: "viewer",
		admin: false,
		readOnly: false,
		rights: [],
	};
};

// spec:app-redesign#REQ-016: Spend shows the spend of each feature against its limit.
describe("Crew / Spend", () => {
	it("shows the total, one bar for each feature, the limits and the links, under the one heading Crew", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/crew/spend");
		const main = within(await screen.findByRole("main"));
		const u = await unwrap(commands.usageGet());
		const total = u.runs.reduce((n, r) => n + (r.usd ?? 0), 0);
		expect(await main.findByText(`$${total.toFixed(2)}`)).toBeInTheDocument();
		expect(main.getByText(`on ${u.runs.length} features`)).toBeInTheDocument();
		expect(main.getByText(/^Limit \$/)).toBeInTheDocument();
		expect(main.getAllByRole("img", { name: /over the limit$/ }).length).toBeGreaterThan(0);
		const limits = within(
			main.getByRole("heading", { name: "Limits" }).parentElement as HTMLElement,
		);
		expect(limits.getByText("Each feature")).toBeInTheDocument();
		expect(limits.getByText("80%")).toBeInTheDocument();
		expect(limits.getByRole("link", { name: "All budgets" })).toBeInTheDocument();
		for (const name of ["Success rate", "Requests of one run", "Use of this machine"])
			expect(main.getByRole("link", { name })).toBeInTheDocument();
		// The agents switch lives on the Crew section, not here.
		expect(main.queryByRole("switch", { name: "Agents on" })).toBeNull();
		const heads = main.getAllByRole("heading", { level: 1 });
		expect(heads).toHaveLength(1);
		expect(heads[0]).toHaveTextContent("Crew");
		await idle(router);
	});

	it("names the agent that stopped at its limit, and Raise adds budget to the run", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = mockState().factory.runs.find((r) => r.state === "Paused");
		if (!run?.budgetUsd) throw new Error("the demo has a run at its limit");
		const before = run.budgetUsd;
		const router = mountApp("/crew/spend");
		const card = await screen.findByRole("article");
		expect(
			within(card).getByRole("heading", { name: `${run.title} reached its limit` }),
		).toBeVisible();
		await user.click(
			within(card).getByRole("button", { name: `Raise to $${(before + 2).toFixed(2)}` }),
		);
		await waitFor(() => expect(run.budgetUsd).toBe(before + 2));
		await idle(router);
	});

	it("Stop here asks first, then stops the run", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = mockState().factory.runs.find((r) => r.state === "Paused");
		const router = mountApp("/crew/spend");
		const card = within(await screen.findByRole("article"));
		await user.click(card.getByRole("button", { name: "Stop here" }));
		expect(run?.state).toBe("Paused");
		await user.click(card.getByRole("button", { name: /^Stop .* reached|^Stop /i }));
		await waitFor(() => expect(run?.state).toBe("Cancelled"));
		await idle(router);
	});

	it("Stop all agents asks first, stops each live run and leaves the agents on", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/crew/spend");
		await user.click(await screen.findByRole("button", { name: "Stop all agents" }));
		expect(mockState().factory.runs.some((r) => r.state === "Working")).toBe(true);
		await user.click(screen.getByRole("button", { name: "Stop all running agents?" }));
		await waitFor(() =>
			expect(mockState().factory.runs.some((r) => r.state === "Working")).toBe(false),
		);
		expect(await unwrap(commands.killSwitchGet())).toBe(false);
		await idle(router);
	});

	it("keeps the agents on when the person says No to the stop-all question", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().confirm = false;
		const router = mountApp("/crew/crew");
		const toggle = await screen.findByRole("switch", { name: "Agents on" });
		await user.click(toggle);
		await waitFor(() => expect(mockState().asked.length).toBeGreaterThan(0));
		expect(screen.getByRole("switch", { name: "Agents on" })).toBeChecked();
		expect(await unwrap(commands.killSwitchGet())).toBe(false);
		mockState().confirm = true;
		await idle(router);
	});

	it("turns Stop all agents off without runs.start, with the reason", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		viewer();
		const router = mountApp("/crew/spend");
		await screen.findByRole("button", { name: "Stop all agents" });
		// The button is drawn again when the reason arrives: ask for it again.
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Stop all agents" })).toHaveAccessibleDescription(
				"Needs the right runs.start (your role: Viewer)",
			),
		);
		await idle(router);
	});
});

describe("Crew / Spend / Budgets", () => {
	it("shows one row for each kind of limit, with Edit, under a back link and its own title", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.budgetSet("day", "*", 5));
		const router = mountApp("/crew/spend?page=budgets");
		const limits = within(await screen.findByRole("region", { name: "Budgets" }));
		for (const kind of ["feature", "day", "month", "person", "AI tool"])
			expect(limits.getByText(`Each ${kind}`)).toBeInTheDocument();
		expect(await limits.findByText("$5.00")).toBeInTheDocument();
		// One Edit for each kind with a command, and a person's own limit under them.
		expect(await limits.findByText("Ada Lovelace")).toBeInTheDocument();
		expect(limits.queryByRole("button", { name: "Edit the limit of each feature" })).toBeNull();
		expect(limits.getByRole("button", { name: "Edit the limit of each day" })).toBeInTheDocument();
		// The section tab and the way back.
		expect(screen.getAllByRole("link", { name: "Spend" })).toHaveLength(2);
		const heads = within(screen.getByRole("main")).getAllByRole("heading", { level: 1 });
		expect(heads).toHaveLength(1);
		expect(heads[0]).toHaveTextContent("Budgets");
		expect(screen.getByRole("group", { name: "Group by" })).toBeInTheDocument();
		await idle(router);
	});

	it("opens the form under its row and refuses a negative amount", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const write = vi.spyOn(commands, "budgetSet");
		const router = mountApp("/crew/spend?page=budgets");
		await user.click(await screen.findByRole("button", { name: "Edit the limit of each day" }));
		const amount = screen.getByRole("spinbutton", { name: "Budget (USD)" });
		expect(amount).toHaveFocus();
		await user.type(amount, "-5");
		await user.click(screen.getByRole("button", { name: "Set budget" }));
		expect(await screen.findByRole("alert")).toBeVisible();
		expect(write).not.toHaveBeenCalled();
		write.mockRestore();
		await idle(router);
	});

	it("keeps the form of a named limit open while its key changes", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().factory.budgets.day.alice = 3;
		const router = mountApp("/crew/spend?page=budgets");
		await user.click(await screen.findByRole("button", { name: "Edit the limit of alice" }));
		await user.type(screen.getByRole("textbox", { name: "Day or member" }), "x");
		expect(screen.getByRole("button", { name: "Set budget" })).toBeInTheDocument();
		await idle(router);
	});

	it("sets the limit of each day in place, and a blank amount clears it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/crew/spend?page=budgets");
		await user.click(await screen.findByRole("button", { name: "Edit the limit of each day" }));
		// The form of the default limit has the amount only: no scope and no name.
		expect(screen.queryByText("Budget for")).toBeNull();
		await user.type(screen.getByRole("spinbutton", { name: "Budget (USD)" }), "4");
		await user.click(screen.getByRole("button", { name: "Set budget" }));
		await waitFor(() => expect(mockState().factory.budgets.day["*"]).toBe(4));
		// The form closes after the write.
		await waitFor(() => expect(screen.queryByRole("button", { name: "Set budget" })).toBeNull());
		await user.click(screen.getByRole("button", { name: "Edit the limit of each day" }));
		await user.clear(screen.getByRole("spinbutton", { name: "Budget (USD)" }));
		await user.click(screen.getByRole("button", { name: "Set budget" }));
		await waitFor(() => expect(mockState().factory.budgets.day["*"]).toBeUndefined());
		await idle(router);
	});

	it("turns Set budget off without project.settings, with the reason", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		viewer();
		const router = mountApp("/crew/spend?page=budgets");
		await user.click(await screen.findByRole("button", { name: "Edit the limit of each day" }));
		const set = await screen.findByRole("button", { name: "Set budget" });
		await waitFor(() =>
			expect(set).toHaveAccessibleDescription(
				"Needs the right project.settings (your role: Viewer)",
			),
		);
		await idle(router);
	});
});

// Accessibility: a heading never skips a level under the page heading.
describe("Crew / Spend: heading order", () => {
	it("puts an h2 before the h3 of the card of the run at its limit", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/crew/spend");
		const main = within(await screen.findByRole("main"));
		await main.findByRole("article");
		const levels = main.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
		for (const [i, n] of levels.entries()) expect(n - (levels[i - 1] ?? 0)).toBeLessThanOrEqual(1);
		await idle(router);
	});
});

// The meter of a monthly limit depends on today: it shows in the row of that limit on Budgets.
describe("Crew / Budgets: the monthly meter", () => {
	it("shows the meter of the monthly budget in the row Each month", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.machineBudgetSet("", 1000));
		const router = mountApp("/crew/spend?page=budgets");
		const row = (await screen.findByText("Each month")).closest("div") as HTMLElement;
		expect(await within(row).findByRole("meter", { name: "Monthly budget" })).toBeVisible();
		await idle(router);
	});
});

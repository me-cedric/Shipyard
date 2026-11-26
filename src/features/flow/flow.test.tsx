import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize } from "@/lib/ipc/bindings";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

/** The exact name of a card: the title, then its key when it has one. */
const exact = (title: string) => new RegExp(`^${title}( ?[A-Z]+-\\d+)?$`);

const feature = (f: Partial<FlowFeature_Serialize> & { title: string }): FlowFeature_Serialize => ({
	stage: "build",
	mark: null,
	ticket: null,
	change: null,
	run: null,
	pr: null,
	who: null,
	runState: null,
	approvals: 0,
	questions: 0,
	checks: null,
	stop: null,
	...f,
});

const FEATURES = [
	feature({ title: "Pick a logo", stage: "idea", who: { name: "Grace", agent: false } }),
	feature({ title: "Write the guide", stage: "spec", runState: "PlanReview", mark: "needs_you" }),
	feature({
		title: "Fix the French menu",
		ticket: "wi:ACME-1",
		run: "run:r-blocked",
		runState: "Blocked",
		mark: "blocked",
		who: { name: "Builder", agent: true },
	}),
	feature({
		title: "Add the health dot",
		ticket: "wi:ACME-2",
		run: "run:r-work",
		runState: "Working",
		who: { name: "Builder", agent: true },
	}),
	feature({ title: "Add export", approvals: 2, runState: "Working", run: "run:r-app" }),
	feature({
		title: "Rework settings",
		stage: "review",
		pr: "pr:gh:7",
		runState: "ChangesRequested",
	}),
	feature({ title: "Audit keychain", stage: "review", pr: "pr:gh:8", checks: "failing" }),
	feature({ title: "Rename the tab", stage: "ready", pr: "pr:gh:9", checks: "passing" }),
];

async function open(path = "/flow/flow", list = FEATURES) {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	vi.spyOn(commands, "featuresList").mockResolvedValue({ status: "ok", data: list });
	const router = mountApp(path);
	await screen.findByRole("heading", { level: 1, name: "Flow" });
	// The first feature is on the page once the list has loaded.
	const [first] = list;
	if (first) await screen.findAllByText(first.title);
	return router;
}
const column = (name: string) => screen.findByRole("region", { name });

describe("Flow / Flow (REQ-010, REQ-011)", () => {
	afterEach(() => vi.restoreAllMocks());

	it("shows five columns with their counts, and each feature once", async () => {
		await open();
		let total = 0;
		for (const [name, count] of [
			["Idea", 1],
			["Spec", 1],
			["Build", 3],
			["Review", 2],
			["Ready", 1],
		] as const) {
			const col = await column(name);
			total += count;
			expect(within(col).getByRole("heading", { level: 2 })).toHaveTextContent(`${name}${count}`);
			expect(within(col).getAllByRole("listitem")).toHaveLength(count);
		}
		expect(total).toBe(FEATURES.length);
	});

	it("shows a feature whose run is Blocked once, in Build, with the attention mark", async () => {
		await open();
		const build = await column("Build");
		const card = within(build).getByText("Fix the French menu").closest("article");
		expect(card).not.toBeNull();
		expect(card).toHaveClass("outline-attention");
		expect(within(card as HTMLElement).getByText("Blocked")).toBeVisible();
		// The title shows once in Build, and a person acts on three features only.
		expect(
			within(build).getAllByRole("heading", { name: exact("Fix the French menu") }),
		).toHaveLength(1);
		// The whole card is the target: no Open button inside.
		expect(within(card as HTMLElement).getAllByRole("button")).toHaveLength(1);
		expect(within(card as HTMLElement).queryByRole("button", { name: /^Open/ })).toBeNull();
		expect(document.querySelectorAll("article")).toHaveLength(3);
	});

	it("shows a working feature with its title, the agent and its state, and no attention colour", async () => {
		await open();
		const build = await column("Build");
		const card = within(build).getByRole("button", { name: /Add the health dot/ });
		expect(card).toHaveTextContent("Add the health dot");
		// The agent is the letter tile: its name is said, and the state is plain text.
		expect(within(card).getByRole("img", { name: "Builder" })).toBeVisible();
		expect(card).toHaveTextContent("Working");
		expect(card.closest("article")).toBeNull();
		expect(card.className).not.toMatch(/attention/);
	});

	it("says the state in plain words", async () => {
		await open();
		for (const text of [
			"Review the plan",
			"Approve 2 actions",
			"Changes asked",
			"Checks fail",
			"Ready to merge",
		])
			expect(screen.getByText(text)).toBeVisible();
	});

	it("adds an idea from the end of Idea and starts a new feature from New", async () => {
		const user = userEvent.setup();
		const router = await open();
		await user.click(within(await column("Idea")).getByRole("button", { name: "Add an idea" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/new"));
		expect(router.state.location.search).toEqual({ kind: "idea" });
		await screen.findByRole("button", { name: "Idea for later", pressed: true });
		router.history.back();
		await user.click(await screen.findByRole("button", { name: "New" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/new"));
		expect(router.state.location.search).toEqual({});
	});

	it("keeps the kill switch and the start from a ticket in More, and no second row", async () => {
		const user = userEvent.setup();
		const router = await open();
		const kill = vi.spyOn(commands, "killSwitchSet");
		expect(screen.queryByRole("switch", { name: "Agents on" })).toBeNull();
		expect(screen.queryByRole("searchbox")).toBeNull();
		expect(screen.queryByRole("combobox", { name: "Ticket" })).toBeNull();
		await user.click(await screen.findByRole("button", { name: "More" }));
		const agents = await screen.findByRole("menuitemcheckbox", { name: "Agents on" });
		expect(agents).toHaveAttribute("aria-checked", "true");
		await user.click(agents);
		await waitFor(() => expect(kill).toHaveBeenCalledWith(true));
		// A switch item keeps the menu open: the next item is in the same list.
		await user.click(await screen.findByRole("menuitem", { name: "Start from a ticket" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/new"));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("filters to what needs the person, and the filter stays in the address", async () => {
		const user = userEvent.setup();
		const router = await open();
		await user.click(await screen.findByRole("button", { name: "Needs me" }));
		await waitFor(() => expect(router.state.location.search).toEqual({ filter: "needs" }));
		expect(screen.getByRole("heading", { name: exact("Fix the French menu") })).toBeVisible();
		expect(screen.getByRole("heading", { name: "Add export" })).toBeVisible();
		expect(screen.queryByText("Pick a logo")).toBeNull();
		expect(screen.queryByText("Add the health dot")).toBeNull();
		await user.click(screen.getByRole("button", { name: "All" }));
		await screen.findByText("Pick a logo");
	});

	it("filters to the tickets of the person", async () => {
		await withTracker();
		await importAll();
		const me = (await unwrap(commands.workContext(0))).me;
		const mirror = await unwrap(commands.syncItems({}));
		const mine = mirror.filter((i) => i.member === me).map((i) => i.key);
		const list = mirror
			.slice(0, 3)
			.map((i) => feature({ title: `T ${i.key}`, ticket: `wi:${i.key}` }));
		vi.spyOn(commands, "featuresList").mockResolvedValue({ status: "ok", data: list });
		mountApp("/flow/flow?filter=mine");
		await screen.findByRole("heading", { level: 1, name: "Flow" });
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Mine", pressed: true })).toBeVisible(),
		);
		for (const i of mirror.slice(0, 3))
			await waitFor(() =>
				expect(screen.queryByText(`T ${i.key}`) !== null).toBe(mine.includes(i.key)),
			);
	});

	it("searches the features by title", async () => {
		const user = userEvent.setup();
		await open();
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Find a feature" }));
		await user.type(await screen.findByRole("searchbox", { name: "Find a feature" }), "keychain");
		await waitFor(() => expect(screen.queryByText("Pick a logo")).toBeNull());
		expect(screen.getByText("Audit keychain")).toBeVisible();
	});

	it("opens a card with the keyboard: the feature page, found by the first part", async () => {
		const user = userEvent.setup();
		const router = await open();
		const card = await within(await column("Build")).findByRole("button", {
			name: /Add the health dot/,
		});
		card.focus();
		await user.keyboard("{Enter}");
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/feature/wi%3AACME-2"));
	});

	it("keeps the actions of the board and of Runs in the menu of a card", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		const mirror = await unwrap(commands.syncItems({}));
		const free = mirror.find((i) => i.category !== "done");
		if (!free) throw new Error("no ticket");
		const stop = vi.spyOn(commands, "runCancel");
		const start = vi.spyOn(commands, "runStart");
		const move = vi.spyOn(commands, "workTransition");
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [
				feature({ title: "Free ticket", stage: "idea", ticket: `wi:${free.key}` }),
				feature({ title: "Live run", run: "run:r-live", runState: "Working" }),
			],
		});
		mountApp("/flow/flow");
		await screen.findByRole("heading", { level: 1, name: "Flow" });
		fireEvent.contextMenu(await screen.findByRole("button", { name: /Free ticket/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Start run" }));
		await waitFor(() => expect(start).toHaveBeenCalledWith(free.key));
		fireEvent.contextMenu(await screen.findByRole("button", { name: /Free ticket/ }));
		const to = (await screen.findAllByRole("menuitem", { name: /^Move to / }))[0];
		await user.click(to as HTMLElement);
		await waitFor(() => expect(move).toHaveBeenCalledWith(free.key, expect.any(String), true));
		fireEvent.contextMenu(await screen.findByRole("button", { name: /Live run/ }));
		expect(screen.queryByRole("menuitem", { name: "Start run" })).toBeNull();
		await user.click(await screen.findByRole("menuitem", { name: "Stop run" }));
		await waitFor(() => expect(stop).toHaveBeenCalledWith("r-live"));
	});

	it("opens at 960 by 600 with the columns in one scroll area", async () => {
		await open();
		const grid = (await column("Idea")).parentElement;
		expect(grid?.parentElement).toHaveClass("overflow-auto");
		// A column ends after its last card.
		expect(grid).toHaveClass("items-start");
	});
});

describe("Flow / List, Done and Health", () => {
	afterEach(() => vi.restoreAllMocks());

	it("lists each feature once with its stage, who and state, with the controls of the backlog and the changes above", async () => {
		await withTracker();
		await importAll();
		await open("/flow/list");
		const rows = await screen.findByRole("list", { name: "Features" });
		expect(within(rows).getAllByRole("listitem")).toHaveLength(FEATURES.length);
		const row = within(rows).getByRole("button", { name: /Fix the French menu/ });
		expect(row).toHaveTextContent("Build");
		expect(row).toHaveTextContent("Builder");
		expect(row).toHaveTextContent("Blocked");
		// One table: the embedded Backlog and Proposals lists are gone, so no ticket shows twice.
		expect(screen.queryByRole("heading", { level: 2, name: "Backlog" })).toBeNull();
		expect(screen.queryByRole("heading", { level: 2, name: "Proposals" })).toBeNull();
		expect(screen.getAllByRole("button", { name: /Fix the French menu/ })).toHaveLength(1);
		// The stage is a pill, and the state of a row that needs a person is the attention pill.
		expect(within(row).getByText("Blocked").className).toMatch(/attention/);
		// The controls that are not about one row: the field above the rows, the rest in More.
		expect(await screen.findByRole("textbox", { name: "Bring a ticket by its key" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Bring" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Adopt" })).toBeNull();
		for (const name of ["Assignee: all", "Label: all", "Agent: all"])
			expect(screen.getByRole("button", { name })).toBeVisible();
		await userEvent.click(screen.getByRole("button", { name: "More" }));
		for (const name of [
			"Find a feature",
			"Start from a ticket",
			"Import",
			"From a ticket",
			"New change",
		])
			expect(await screen.findByRole("menuitem", { name })).toBeVisible();
		await userEvent.keyboard("{Escape}");
		await waitFor(() =>
			expect(within(screen.getByRole("main")).getAllByRole("heading", { level: 1 })).toHaveLength(
				1,
			),
		);
	});

	it("shows the finished features and the run history, with its search and its filters", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const failed = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-3");
		const rec = mockState().factory.runs.find((r) => r.id === failed?.id);
		if (rec) rec.state = "Failed";
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [feature({ title: "Rename ACME-3", stage: "ready" })],
		});
		const router = mountApp("/flow/done?q=ACME-3");
		await screen.findByRole("heading", { level: 1, name: "Flow" });
		// One list: the failed run of the ticket, and the finished feature that has no run.
		const rows = await screen.findByRole("list", { name: "History" });
		await waitFor(() => expect(within(rows).getAllByRole("listitem")).toHaveLength(2));
		expect(screen.queryByRole("list", { name: "Features" })).toBeNull();
		expect(within(rows).getByRole("button", { name: "Rename ACME-3" })).toBeVisible();
		expect(screen.getByRole("searchbox", { name: "Find a finished feature" })).toHaveValue(
			"ACME-3",
		);
		// The end filter: All, Merged, Done, Failed, Cancelled.
		const ends = within(screen.getByRole("group", { name: "End state" }));
		expect(ends.getAllByRole("button").map((x) => x.textContent)).toEqual([
			"All",
			"Merged",
			"Done",
			"Failed",
			"Cancelled",
		]);
		await user.click(ends.getByRole("button", { name: "Failed" }));
		await waitFor(() => expect(within(rows).getAllByRole("listitem")).toHaveLength(1));
		// Start again is on the failed row, and it starts a new run of the ticket.
		const start = vi.spyOn(commands, "runStart");
		expect(within(rows).getByRole("button", { name: /^Start again/ })).toBeVisible();
		// The extra columns of the old table are items of More.
		expect(within(rows).queryByText("Recipe:")).toBeNull();
		await user.click(screen.getByRole("button", { name: "More" }));
		for (const name of ["Steps", "Ended", "Pull request"])
			expect(await screen.findByRole("menuitemcheckbox", { name })).toBeVisible();
		await user.click(screen.getByRole("menuitemcheckbox", { name: "Recipe" }));
		expect(await within(rows).findByText("Recipe:")).toBeInTheDocument();
		await user.click(ends.getByRole("button", { name: "All" }));
		await user.click(screen.getByRole("button", { name: "Needs me" }));
		await waitFor(() =>
			expect(router.state.location.search).toEqual({ q: "ACME-3", filter: "needs" }),
		);
		await user.click(screen.getByRole("button", { name: "All", pressed: false }));
		await user.click(await within(rows).findByRole("button", { name: /^Start again/ }));
		await waitFor(() => expect(start).toHaveBeenCalledWith("ACME-3"));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows the Quality page as the view Health", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/flow/health");
		expect(await screen.findByRole("heading", { level: 1, name: "Quality" })).toBeVisible();
		const tabs = screen.getByRole("navigation", { name: "Tabs" });
		expect(within(tabs).getByRole("link", { name: "Health", current: "page" })).toBeVisible();
	});

	it("draws Flow, List, Done and Health in one section switch", async () => {
		await open("/flow/flow");
		const tabs = screen.getByRole("navigation", { name: "Tabs" });
		expect(
			within(tabs)
				.getAllByRole("link")
				.map((l) => l.textContent),
		).toEqual(["Flow", "List", "Done", "Health"]);
	});

	it.each([
		["/work/board", "/flow/flow"],
		["/factory/runs?view=history", "/flow/done"],
		["/work/backlog", "/flow/list"],
		["/specs/changes", "/flow/list"],
		["/code/quality", "/flow/health"],
	])("opens %s on %s", async (from, to) => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp(from);
		await waitFor(() => expect(router.state.location.pathname).toBe(to));
		await waitFor(() => expect(router.state.status).toBe("idle"));
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		expect(within(tabs).getAllByRole("link", { current: "page" })).toHaveLength(1);
	});
});

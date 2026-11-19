import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

type User = ReturnType<typeof userEvent.setup>;
const eur = (n: number) =>
	n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const button = (name: string) => screen.findByRole("button", { name });
/** The tasks of one feature. */
const feature = (name: string) => screen.findByRole("region", { name });
const task = (id: string) =>
	mockState()
		.work.sheets["mvp-1"]?.features.flatMap((f) => f.tasks)
		.find((x) => x.id === id);
/** One item of the menu More of the page. */
const more = async (user: User, item: string) => {
	await user.click(await button("More"));
	await user.click(await screen.findByRole("menuitem", { name: item }));
};
/** The way back of a sub-page. The section switch has a link of the same name. */
const back = () =>
	screen
		.getAllByRole("link", { name: "Estimates" })
		.find((a) => a.getAttribute("href")?.includes("sheet=")) as HTMLElement;
const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

describe("Plan / Estimates", () => {
	it("lists the sheets of the lots", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await user.click(await button("Lot: MVP 1"));
		expect(await screen.findByRole("menuitem", { name: "MVP 1" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "MVP 2" })).toBeInTheDocument();
		await idle(router);
	});

	it("shows each feature with its tasks, and a percentage task in days", async () => {
		await withTracker();
		const router = mountApp("/plan/estimates");
		const sheet = await unwrap(commands.estimateGet("mvp-1"));
		expect(
			await screen.findByRole("heading", {
				level: 1,
				name: `MVP 1 is ${sheet.totals.days} days of work`,
			}),
		).toBeInTheDocument();
		const auth = within(await feature("Authentication"));
		expect(auth.getByRole("heading", { name: "Authentication" })).toBeInTheDocument();
		expect(auth.getAllByRole("row")).toHaveLength(4);
		expect(within(await feature("Export")).getAllByRole("row")).toHaveLength(2);
		// A percentage task shows the days that the sheet computes from the build effort.
		const test = auth.getByText("Test pass").closest("[role=row]") as HTMLElement;
		expect(
			within(test).getByRole("img", { name: `${sheet.days["auth-test"]} days` }),
		).toBeInTheDocument();
		expect(test).toHaveTextContent("25 %");
		// The cards of the right column.
		expect(screen.getByRole("heading", { name: "Split" })).toBeInTheDocument();
		await idle(router);
	});

	it("shows Summary, Spread and Portfolio on one page, with Export and the seal in the row", async () => {
		await withTracker();
		const router = mountApp("/plan/estimates?tab=sheets");
		for (const name of ["Summary", "Spread", "Portfolio"])
			expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
		for (const name of ["Export", "Open the seal", "Seal"])
			expect(screen.getByRole("button", { name })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Add a task" })).toBeNull();
		await idle(router);
	});

	it("says 1 day, not 1 days", async () => {
		await withTracker();
		const router = mountApp("/plan/estimates");
		expect(await screen.findByText("1 day")).toBeInTheDocument();
		expect(screen.queryByText("1 days")).toBeNull();
		await idle(router);
	});

	it("changes the days of a task with its stepper, and takes no change on a frozen sheet", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await user.click(await button("Export endpoint, more"));
		await waitFor(() => expect(task("export-api")?.days).toBe(7));
		await user.click(await button("Export endpoint, less"));
		await waitFor(() => expect(task("export-api")?.days).toBe(6));
		await more(user, "Freeze");
		await waitFor(() => expect(mockState().work.sheets["mvp-1"]?.frozen).toBe(true));
		await waitFor(async () => expect(await button("Export endpoint, more")).toBeDisabled());
		expect(await button("Export endpoint, more")).toHaveAccessibleDescription("Frozen");
		await idle(router);
	});

	it("says Unrated, not zero, and links to Crew when no rate shows", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await user.click(await button("Costing"));
		expect(
			await screen.findByRole("heading", { level: 1, name: "What MVP 1 costs" }),
		).toBeInTheDocument();
		const link = await screen.findByRole("link", { name: "Unrated" });
		expect(screen.getAllByText("Unrated").length).toBeGreaterThan(1);
		await user.click(link);
		await waitFor(() => expect(router.state.location.pathname).toBe("/crew/crew"));
		await idle(router);
	});

	it("shows equal totals in Costing, the spread and the portfolio", async () => {
		const user = userEvent.setup();
		await withTracker();
		// Three rates for dev and for qa: a cost shows only for a role of three (`work::MIN_RATED`).
		const team = mockState().work.team.members;
		const [ada, , alan] = team;
		if (ada && alan)
			team.push(
				{ ...ada, name: "Linus", handle: "linus", trackers: [] },
				{ ...alan, name: "Barbara", handle: "barbara", trackers: [], dayRate: 400 },
				{ ...alan, name: "Frances", handle: "frances", trackers: [], dayRate: 440 },
			);
		const router = mountApp("/plan/estimates?tab=costing");
		const sheet = await unwrap(commands.estimateGet("mvp-1"));
		const price = eur(sheet.totals.price ?? 0);
		const cost = eur(sheet.totals.cost ?? 0);
		expect(await screen.findByText(price)).toBeInTheDocument();
		expect(screen.getByText(cost)).toBeInTheDocument();
		expect(screen.getByText(eur(sheet.totals.margin ?? 0))).toBeInTheDocument();
		// The people of the team, each with the way to the rate, and the agents with the spend.
		expect(screen.getByRole("link", { name: /^Day rate of Ada: .* a day$/ })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Spend" })).toHaveAttribute("href", "/crew/spend");

		await more(user, "More amounts");
		const spread = await screen.findByRole("table", { name: "Spread" });
		const total = within(spread).getAllByRole("row").at(-1) as HTMLElement;
		expect(total).toHaveTextContent(cost);
		expect(total).toHaveTextContent(String(sheet.totals.days));
		// The months sum to the total of the sheet.
		const months = sheet.spread.reduce((n, m) => n + (m.cost ?? 0), 0);
		expect(Math.round(months)).toBe(Math.round(sheet.totals.cost ?? 0));

		const portfolio = await screen.findByRole("table", { name: "Portfolio" });
		const row = within(portfolio).getByText("MVP 1").closest("[role=row]") as HTMLElement;
		expect(row).toHaveTextContent(price);
		expect(row).toHaveTextContent(cost);
		const all = await unwrap(commands.estimatePortfolio());
		expect(within(portfolio).getAllByRole("row").at(-1)).toHaveTextContent(
			eur(all.total.price ?? 0),
		);
		await idle(router);
	});

	it("shows Summary, Spread and Portfolio on one page, with names in words", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await user.click(await button("Summary"));
		for (const name of ["Summary", "Spread", "Portfolio"])
			expect(await screen.findByRole("heading", { level: 2, name })).toBeInTheDocument();
		expect(screen.getByText("Not sealed")).toBeInTheDocument();
		expect(screen.getByText("MVP 2")).toBeInTheDocument();
		expect(screen.queryByText("mvp-1")).toBeNull();
		await idle(router);
	});

	it("writes the entry of a task and no total", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await user.click(await button("Export endpoint"));
		expect(
			await screen.findByRole("heading", { level: 1, name: "Export endpoint" }),
		).toBeInTheDocument();
		expect(router.state.location.search).toMatchObject({ task: "export-api" });
		expect(back()).toBeInTheDocument();
		const days = screen.getByRole("spinbutton", { name: "Likely" });
		expect(days).toHaveValue(6);
		await user.clear(days);
		await user.type(days, "9");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(task("export-api")?.days).toBe(9));
		const file = JSON.stringify(mockState().work.sheets["mvp-1"]);
		for (const key of ["total", "price", "cost", 'margin":']) expect(file).not.toContain(key);
		// The page of the task closes on the list.
		const row = (await within(await feature("Export")).findByText("Export endpoint")).closest(
			"[role=row]",
		) as HTMLElement;
		expect(within(row).getByRole("status")).toHaveTextContent("9");
		await idle(router);
	});

	it("shows the estimate of a task beside the estimate of its ticket", async () => {
		await withTracker();
		await importAll();
		const router = mountApp("/plan/estimates?task=auth-api");
		const mine = (await screen.findByText("Task", { selector: "dt" })).parentElement as HTMLElement;
		const ticket = screen.getByText("Ticket", { selector: "dt" }).parentElement as HTMLElement;
		expect(mine).toHaveTextContent("5 d");
		expect(ticket).toHaveTextContent("4 d");
		await idle(router);
	});

	it("seals with a passphrase, then shows the locked state and no number", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		// The seal is one card, in Costing.
		await user.click(await button("Seal"));
		const field = await screen.findByLabelText("Passphrase");
		expect(field).toHaveAttribute("type", "password");
		await user.type(field, "s3cret");
		await user.click(screen.getByRole("button", { name: "Seal" }));
		// A typo would lock the files for good: the second entry must match.
		await user.type(await screen.findByLabelText("Repeat the passphrase"), "s3cert");
		await user.click(screen.getByRole("button", { name: "Seal" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("differ");
		expect(mockState().work.sealed).toBeNull();
		await user.type(await screen.findByLabelText("Passphrase"), "s3cret");
		await user.click(screen.getByRole("button", { name: "Seal" }));
		await user.type(await screen.findByLabelText("Repeat the passphrase"), "s3cret");
		await user.click(screen.getByRole("button", { name: "Seal" }));
		await waitFor(() => expect(mockState().work.sealed).toBe("s3cret"));
		// The sheet still works on this machine.
		await user.click(await button("Tasks"));
		expect(await feature("Authentication")).toBeInTheDocument();
		await user.click(await button("Open the seal"));
		await user.click(await button("Lock"));
		expect(await screen.findByText("Sealed")).toBeInTheDocument();
		expect(screen.queryByRole("row")).toBeNull();
		expect(screen.queryByText(/days/)).toBeNull();
		await user.type(screen.getByLabelText("Passphrase"), "nope");
		await user.click(screen.getByRole("button", { name: "Unlock" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("does not open");
		expect(screen.queryByRole("row")).toBeNull();
		await user.type(screen.getByLabelText("Passphrase"), "s3cret");
		await user.click(screen.getByRole("button", { name: "Unlock" }));
		expect(
			await screen.findByRole("heading", { level: 1, name: "What MVP 1 costs" }),
		).toBeInTheDocument();
		await idle(router);
	});

	it("previews an Excel import with its refused row and replaces nothing before the confirm", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().nextFile = "/mock/bad.xlsx";
		const router = mountApp("/plan/estimates");
		await user.click(await button("Import from Excel"));
		expect(
			await screen.findByRole("heading", { level: 1, name: "Import an estimate from Excel" }),
		).toBeInTheDocument();
		expect(router.state.location.search).toMatchObject({ page: "import" });
		expect(screen.getByText("bad.xlsx")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Rows that Shipyard refuses, 1" })).toBeVisible();
		expect(screen.getByText("Row 7")).toBeInTheDocument();
		expect(screen.getByText("the effort is not a number")).toBeInTheDocument();
		expect(screen.getByText("Not imported")).toBeInTheDocument();
		expect(screen.getByText("1 features, 2 tasks")).toBeInTheDocument();
		expect(screen.getByText("Imported feature")).toBeInTheDocument();
		expect(screen.getByText("2 tasks")).toBeInTheDocument();
		// The name of the workbook is free: no question.
		const name = screen.getByRole("textbox", { name: "Name of the sheet" });
		expect(name).toHaveValue("Imported lot");
		expect(screen.queryByRole("button", { name: "Replace it" })).toBeNull();
		await user.clear(name);
		await user.type(name, "MVP 1");
		expect(
			await screen.findByRole("heading", { name: "The sheet MVP 1 exists" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Make a new sheet" })).toBeInTheDocument();
		expect(mockState().work.sheets["mvp-1"]?.features[0]?.id).toBe("auth");
		await user.click(screen.getByRole("button", { name: "Replace it" }));
		await waitFor(() => expect(mockState().work.sheets["mvp-1"]?.features[0]?.id).toBe("import"));
		expect(mockState().work.sheets["mvp-1"]?.name).toBe("MVP 1");
		await idle(router);
	});

	it("shows the File row with Choose a file and nothing greyed out before a file is chosen", async () => {
		await withTracker();
		const router = mountApp("/plan/estimates?page=import");
		const choose = await button("Choose a file");
		expect(choose).toBeEnabled();
		expect(screen.getByText("1. File")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Make a new sheet" })).toBeNull();
		expect(screen.queryByRole("heading", { name: /^Rows that/ })).toBeNull();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
		await idle(router);
	});

	it("puts Make a new sheet and Replace it side by side when the sheet exists", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().nextFile = "/mock/bad.xlsx";
		const router = mountApp("/plan/estimates");
		await user.click(await button("Import from Excel"));
		const name = await screen.findByRole("textbox", { name: "Name of the sheet" });
		await user.clear(name);
		await user.type(name, "MVP 1");
		const fresh = await button("Make a new sheet");
		expect(fresh.parentElement).toBe(
			screen.getByRole("button", { name: "Replace it" }).parentElement,
		);
		await idle(router);
	});

	it("imports a workbook as a new sheet, and Cancel writes nothing", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		const count = () => Object.keys(mockState().work.sheets).length;
		const before = count();
		await user.click(await button("Import from Excel"));
		// A good workbook: no card of refused rows.
		expect(await screen.findByText("1 features, 2 tasks")).toBeInTheDocument();
		expect(screen.queryByText("Not imported")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(await feature("Authentication")).toBeInTheDocument();
		expect(count()).toBe(before);
		await user.click(await button("Import from Excel"));
		await user.click(await button("Make a new sheet"));
		await waitFor(() => expect(mockState().work.sheets["imported-lot"]?.name).toBe("Imported lot"));
		expect(count()).toBe(before + 1);
		await idle(router);
	});

	it("exports the sheet to a workbook", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await more(user, "Export: Sheet workbook");
		await waitFor(() =>
			expect(mockState().work.exports).toEqual([{ slug: "mvp-1", path: "/mock/mvp-1.xlsx" }]),
		);
		await idle(router);
	});

	it("saves a three-point estimate with its confidence and assumptions, and counts the expected days", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates?task=export-api");
		await user.type(await screen.findByRole("spinbutton", { name: "Best" }), "3");
		// One end alone is not an estimate.
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		await user.type(screen.getByRole("spinbutton", { name: "Worst" }), "15");
		// (3 + 4 × 6 + 15) / 6 = 7
		expect(screen.getByText("Expected: 7 d")).toBeInTheDocument();
		const sure = within(screen.getByRole("group", { name: "How sure" }));
		await user.click(sure.getByRole("button", { name: "Low" }));
		expect(sure.getByRole("button", { name: "Low" })).toHaveAttribute("aria-pressed", "true");
		await user.type(screen.getByRole("textbox", { name: "New assumption" }), "The API exists");
		await user.click(screen.getByRole("button", { name: "Add" }));
		expect(screen.getByRole("button", { name: "Remove: The API exists" })).toBeInTheDocument();
		await user.type(screen.getByRole("textbox", { name: "New assumption" }), "One format");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(task("export-api")).toMatchObject({
				days: 6,
				optimistic: 3,
				pessimistic: 15,
				confidence: "low",
				assumptions: "The API exists\nOne format",
			}),
		);
		expect((await unwrap(commands.estimateGet("mvp-1"))).days["export-api"]).toBe(7);
		await idle(router);
	});

	it("adds a task in percent to a new feature, and removes a task after the confirm", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await more(user, "Add a task");
		expect(await screen.findByRole("heading", { level: 1, name: "New task" })).toBeInTheDocument();
		expect(router.state.location.search).toMatchObject({ page: "task" });
		await user.type(screen.getByRole("textbox", { name: "Task" }), "Load test");
		await user.click(screen.getByRole("combobox", { name: "Effort" }));
		await user.click(await screen.findByRole("option", { name: "Percent" }));
		await user.type(await screen.findByRole("spinbutton", { name: "Percent" }), "10");
		await user.click(screen.getByRole("combobox", { name: "Feature" }));
		await user.click(await screen.findByRole("option", { name: "New feature" }));
		await user.type(await screen.findByRole("textbox", { name: "Feature name" }), "Quality");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(task("quality-load-test")).toMatchObject({ name: "Load test", percent: 10 }),
		);
		await user.click(await button("Load test"));
		// The name, the effort and Remove of a task are behind More.
		expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
		await more(user, "Name, effort and remove");
		mockState().confirm = false;
		await user.click(await button("Remove"));
		expect(task("quality-load-test")).toBeDefined();
		mockState().confirm = true;
		await user.click(await button("Remove"));
		await waitFor(() => expect(task("quality-load-test")).toBeUndefined());
		await idle(router);
	});

	it("searches, filters, edits rows in bulk and moves a row with the keyboard", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await feature("Authentication");
		// The search, the filters, the selection and the handle are behind More.
		expect(screen.queryByRole("textbox", { name: "Search" })).toBeNull();
		await more(user, "Search and select");
		await user.type(await screen.findByRole("textbox", { name: "Search" }), "api");
		await waitFor(() => expect(screen.queryByText("Login form")).toBeNull());
		expect(screen.getByText("Token API")).toBeInTheDocument();
		await user.clear(screen.getByRole("textbox", { name: "Search" }));
		await user.click(screen.getByRole("button", { name: "qa" }));
		await waitFor(() => expect(screen.queryByText("Token API")).toBeNull());
		await user.click(screen.getByRole("button", { name: "qa" }));

		await user.click(await screen.findByRole("checkbox", { name: "Select Token API" }));
		await user.click(screen.getByRole("checkbox", { name: "Select Login form" }));
		const bulk = within(screen.getByRole("region", { name: "2 tasks selected" }));
		expect(bulk.getByRole("heading", { name: "Many tasks at once" })).toBeInTheDocument();
		await user.type(bulk.getByRole("textbox", { name: "Set role" }), "backend");
		await user.click(bulk.getByRole("button", { name: "Apply" }));
		await waitFor(() => {
			const tasks = mockState().work.sheets["mvp-1"]?.features[0]?.tasks ?? [];
			expect(tasks.filter((x) => x.role === "backend").map((x) => x.id)).toEqual([
				"auth-api",
				"auth-web",
			]);
		});

		const handle = await screen.findByRole("button", { name: "Move Login form" });
		fireEvent.keyDown(handle, { key: "ArrowUp", altKey: true });
		await waitFor(() =>
			expect(mockState().work.sheets["mvp-1"]?.features[0]?.tasks.map((x) => x.id)).toEqual([
				"auth-design",
				"auth-web",
				"auth-api",
				"auth-test",
			]),
		);
		// The selection shows on the page of one task too.
		await user.click(await button("Export endpoint"));
		expect(await screen.findByRole("region", { name: "2 tasks selected" })).toBeInTheDocument();
		await idle(router);
	});

	it("duplicates and freezes a sheet, refuses a change to it, and deletes a sheet after the confirm", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await feature("Authentication");
		await more(user, "Duplicate");
		await waitFor(() => expect(mockState().work.sheets["mvp-1-copy"]?.name).toBe("MVP 1 (copy)"));
		await waitFor(() =>
			expect(router.state.location.search).toMatchObject({ sheet: "mvp-1-copy" }),
		);
		await more(user, "Freeze");
		await waitFor(() => expect(mockState().work.sheets["mvp-1-copy"]?.frozen).toBe(true));
		expect(await screen.findByText("Frozen")).toBeInTheDocument();
		await user.click(await button("More"));
		expect(await screen.findByRole("menuitem", { name: "Add a task" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await user.keyboard("{Escape}");
		await expect(
			unwrap(commands.estimateSave("mvp-1-copy", { name: "Changed", features: [], frozen: true })),
		).rejects.toThrow(/frozen/);
		await more(user, "Unfreeze");
		await waitFor(() => expect(mockState().work.sheets["mvp-1-copy"]?.frozen).toBeUndefined());
		mockState().confirm = false;
		await more(user, "Delete");
		expect(mockState().work.sheets["mvp-1-copy"]).toBeDefined();
		mockState().confirm = true;
		await more(user, "Delete");
		await waitFor(() => expect(mockState().work.sheets["mvp-1-copy"]).toBeUndefined());
		await idle(router);
	});

	it("renames a sheet and makes a new one on their pages, and has the card This sheet on a task", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates?task=export-api");
		const card = async (name: string) =>
			within(
				(await screen.findByRole("heading", { name: "This sheet" })).parentElement as HTMLElement,
			).getByRole("button", { name });
		for (const name of ["Duplicate", "Freeze", "Seal", "Delete"])
			expect(await card(name)).toBeInTheDocument();
		await user.click(await card("Rename"));
		const name = await screen.findByRole("textbox", { name: "Name" });
		expect(name).toHaveValue("MVP 1");
		await user.type(name, " b");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().work.sheets["mvp-1"]?.name).toBe("MVP 1 b"));
		await user.click(await button("New sheet"));
		expect(await screen.findByRole("heading", { level: 1, name: "New sheet" })).toBeInTheDocument();
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Lot 3");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().work.sheets["lot-3"]?.name).toBe("Lot 3"));
		await waitFor(() => expect(router.state.location.search).toMatchObject({ sheet: "lot-3" }));
		await idle(router);
	});

	it("sums days and cost by profile, for the lot and for every lot, with no day rate", async () => {
		const user = userEvent.setup();
		await withTracker();
		// A third developer with a rate: a cost shows only for a role of three (`work::MIN_RATED`).
		const [ada] = mockState().work.team.members;
		if (ada)
			mockState().work.team.members.push({ ...ada, name: "Linus", handle: "linus", trackers: [] });
		const router = mountApp("/plan/estimates?tab=costing");
		await more(user, "More amounts");
		const lot = await screen.findByRole("table", { name: "By profile" });
		const dev = (await within(lot).findByText("dev")).closest("[role=row]") as HTMLElement;
		const [mine] = await unwrap(commands.estimateProfiles("mvp-1"));
		expect(mine?.role).toBe("dev");
		expect(dev).toHaveTextContent(eur(mine?.cost ?? 0));
		// No day rate column: a rate stays with the team, sealed or not.
		expect(
			within(lot)
				.getAllByRole("columnheader")
				.map((h) => h.textContent),
		).toEqual(["Profile", "Days", "Cost"]);
		expect(await screen.findByRole("table", { name: "By profile, Portfolio" })).toBeInTheDocument();
		await idle(router);
	});

	it("gives each control the height of 44 px (spec:app-redesign#REQ-026)", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().nextFile = "/mock/bad.xlsx";
		const router = mountApp("/plan/estimates");
		const tall = (el: HTMLElement) => expect(el.closest('[class*="min-h-control"]')).not.toBeNull();
		await feature("Authentication");
		for (const name of [
			"Seal",
			"New sheet",
			"Import from Excel",
			"Summary",
			"Export endpoint",
			"Export endpoint, less",
		])
			tall(screen.getByRole("button", { name }));
		tall(screen.getByRole("button", { name: "Lot: MVP 1" }));
		await more(user, "Search and select");
		tall(await screen.findByRole("textbox", { name: "Search" }));
		await user.click(await screen.findByRole("checkbox", { name: "Select Token API" }));
		const bulk = within(screen.getByRole("region", { name: "1 tasks selected" }));
		tall(bulk.getByRole("textbox", { name: "Set role" }));
		for (const name of ["Apply", "Delete", "Clear selection"])
			tall(bulk.getByRole("button", { name }));
		await user.click(screen.getByRole("button", { name: "Export endpoint" }));
		tall(await screen.findByRole("spinbutton", { name: "Likely" }));
		for (const name of ["Low", "Save", "Add"]) tall(screen.getByRole("button", { name }));
		await user.click(back());
		await user.click(await button("Import from Excel"));
		tall(await screen.findByRole("textbox", { name: "Name of the sheet" }));
		for (const name of ["Choose another", "Make a new sheet", "Cancel"])
			tall(screen.getByRole("button", { name }));
		await idle(router);
	});

	it("is in French when the language is French", async () => {
		const user = userEvent.setup();
		mockState().prefs.lang = "fr";
		await withTracker();
		const router = mountApp("/plan/estimates");
		expect(await button("Synthèse")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Importer depuis Excel" })).toBeInTheDocument();
		await user.click(await button("Plus"));
		expect(await screen.findByRole("menuitem", { name: "Ajouter une tâche" })).toBeInTheDocument();
		await idle(router);
	});
});

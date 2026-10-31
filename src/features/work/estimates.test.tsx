import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

const aside = async (name: string) => within(await screen.findByRole("complementary", { name }));
const eur = (n: number) =>
	n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const view = (name: string) => screen.getByRole("tab", { name });

describe("Work / Estimates", () => {
	it("lists the sheets of the lots", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/estimates");
		await user.click(await screen.findByRole("combobox", { name: "Sheet" }));
		expect(await screen.findByRole("option", { name: "MVP 1" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "MVP 2" })).toBeInTheDocument();
	});

	it("shows lot, feature and task, with a percentage task in days", async () => {
		await withTracker();
		mountApp("/work/estimates");
		const table = await screen.findByRole("table", { name: "Backlog" });
		expect(within(table).getByRole("heading", { name: "Authentication (4)" })).toBeInTheDocument();
		expect(within(table).getByRole("heading", { name: "Export (2)" })).toBeInTheDocument();
		// A percentage task shows the days that the sheet computes from the build effort.
		const test = within(table).getByText("Test pass").closest("[role=row]") as HTMLElement;
		const sheet = await unwrap(commands.estimateGet("mvp-1"));
		expect(test).toHaveTextContent(String(sheet.days["auth-test"]));
		expect(test).toHaveTextContent("25 %");
	});

	it("says Unrated, not zero, and links to Team when no rate shows", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/work/estimates");
		await user.click(await screen.findByRole("tab", { name: "Summary" }));
		const links = await screen.findAllByRole("link", { name: "Unrated" });
		expect(links.length).toBeGreaterThan(0);
		expect(screen.getAllByText("Unrated").length).toBeGreaterThan(links.length - 1);
		await user.click(links[0] as HTMLElement);
		await waitFor(() => expect(router.state.location.pathname).toBe("/work/team"));
	});

	it("shows equal totals in the summary, the spread and the portfolio", async () => {
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
		mountApp("/work/estimates");
		const sheet = await unwrap(commands.estimateGet("mvp-1"));
		await user.click(await screen.findByRole("tab", { name: "Summary" }));
		for (const label of ["Days", "Cost", "Price", "Margin"])
			expect(await screen.findByText(label, { selector: "dt" })).toBeInTheDocument();
		const price = eur(sheet.totals.price ?? 0);
		const cost = eur(sheet.totals.cost ?? 0);
		expect(screen.getByText(price)).toBeInTheDocument();
		expect(screen.getByText(cost)).toBeInTheDocument();

		await user.click(view("Spread"));
		const spread = await screen.findByRole("table", { name: "Spread" });
		const total = within(spread).getAllByRole("row").at(-1) as HTMLElement;
		expect(total).toHaveTextContent(cost);
		expect(total).toHaveTextContent(String(sheet.totals.days));
		// The months sum to the total of the sheet.
		const months = sheet.spread.reduce((n, m) => n + (m.cost ?? 0), 0);
		expect(Math.round(months)).toBe(Math.round(sheet.totals.cost ?? 0));

		await user.click(view("Portfolio"));
		const portfolio = await screen.findByRole("table", { name: "Portfolio" });
		const row = within(portfolio).getByText("mvp-1").closest("[role=row]") as HTMLElement;
		expect(row).toHaveTextContent(price);
		expect(row).toHaveTextContent(cost);
		const all = await unwrap(commands.estimatePortfolio());
		expect(within(portfolio).getAllByRole("row").at(-1)).toHaveTextContent(
			eur(all.total.price ?? 0),
		);
	});

	it("writes the entry of a task and no total", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/estimates");
		await user.click(within(await screen.findByRole("table")).getByText("Export endpoint"));
		const panel = await aside("Task");
		const days = panel.getByRole("spinbutton", { name: "Days" });
		expect(days).toHaveValue(6);
		await user.clear(days);
		await user.type(days, "9");
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(() => {
			const t = mockState()
				.work.sheets["mvp-1"]?.features.flatMap((f) => f.tasks)
				.find((x) => x.id === "export-api");
			expect(t?.days).toBe(9);
		});
		const file = JSON.stringify(mockState().work.sheets["mvp-1"]);
		for (const key of ["total", "price", "cost", 'margin":']) expect(file).not.toContain(key);
		expect(await screen.findByRole("table")).toHaveTextContent("9");
	});

	it("shows the estimate of a task beside the estimate of its ticket", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/work/estimates");
		await user.click(within(await screen.findByRole("table")).getByText("Token API"));
		const panel = await aside("Task");
		const task = (await panel.findByText("Task", { selector: "dt" })).parentElement as HTMLElement;
		const ticket = panel.getByText("Ticket", { selector: "dt" }).parentElement as HTMLElement;
		expect(task).toHaveTextContent("5 d");
		expect(ticket).toHaveTextContent("4 d");
	});

	it("seals with a passphrase, then shows the locked state and no number", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/estimates");
		await user.click(await screen.findByRole("button", { name: "Seal" }));
		const field = screen.getByLabelText("Passphrase");
		expect(field).toHaveAttribute("type", "password");
		await user.type(field, "s3cret");
		// A typo would lock the files for good: the second field must match.
		await user.type(screen.getByLabelText("Repeat the passphrase"), "s3cert");
		await user.click(screen.getAllByRole("button", { name: "Seal" }).at(-1) as HTMLElement);
		expect(await screen.findByRole("alert")).toHaveTextContent("differ");
		expect(mockState().work.sealed).toBeNull();
		await user.type(screen.getByLabelText("Passphrase"), "s3cret");
		await user.type(screen.getByLabelText("Repeat the passphrase"), "s3cret");
		await user.click(screen.getAllByRole("button", { name: "Seal" }).at(-1) as HTMLElement);
		await waitFor(() => expect(mockState().work.sealed).toBe("s3cret"));
		// The sheet still works on this machine.
		expect(await screen.findByRole("table", { name: "Backlog" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Lock" }));
		expect(await screen.findByText("Sealed")).toBeInTheDocument();
		expect(screen.queryByRole("table")).toBeNull();
		await user.type(screen.getByLabelText("Passphrase"), "nope");
		await user.click(screen.getByRole("button", { name: "Unlock" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("does not open");
		expect(screen.queryByRole("table")).toBeNull();
		await user.type(screen.getByLabelText("Passphrase"), "s3cret");
		await user.click(screen.getByRole("button", { name: "Unlock" }));
		expect(await screen.findByRole("table", { name: "Backlog" })).toBeInTheDocument();
	});

	it("previews an Excel import with its refused row and replaces nothing before the confirm", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().nextFile = "/mock/bad.xlsx";
		mountApp("/work/estimates");
		await user.click(await screen.findByRole("button", { name: "Import" }));
		const dialog = within(await screen.findByRole("dialog"));
		expect(await dialog.findByText("Row 7")).toBeInTheDocument();
		expect(dialog.getByText("the effort is not a number")).toBeInTheDocument();
		expect(dialog.getByText("1 features, 2 tasks")).toBeInTheDocument();
		expect(mockState().work.sheets["mvp-1"]?.name).toBe("MVP 1");
		await user.click(dialog.getByRole("button", { name: "Replace mvp-1" }));
		await waitFor(() => expect(mockState().work.sheets["mvp-1"]?.name).toBe("Imported lot"));
	});

	it("exports the sheet to a workbook", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/estimates");
		await user.click(await screen.findByRole("button", { name: "Export" }));
		await user.click(await screen.findByRole("menuitem", { name: "Sheet workbook" }));
		await waitFor(() =>
			expect(mockState().work.exports).toEqual([{ slug: "mvp-1", path: "/mock/mvp-1.xlsx" }]),
		);
	});

	it("saves a three-point estimate with its confidence and assumptions, and counts the expected days", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/estimates");
		await user.click(within(await screen.findByRole("table")).getByText("Export endpoint"));
		const panel = await aside("Task");
		await user.click(panel.getByRole("checkbox", { name: "Three-point estimate" }));
		await user.type(panel.getByRole("spinbutton", { name: "Optimistic" }), "3");
		await user.type(panel.getByRole("spinbutton", { name: "Pessimistic" }), "15");
		// (3 + 4 × 6 + 15) / 6 = 7
		expect(panel.getByText("Expected: 7 d")).toBeInTheDocument();
		await user.click(panel.getByRole("combobox", { name: "Confidence" }));
		await user.click(await screen.findByRole("option", { name: "Low" }));
		await user.type(panel.getByRole("textbox", { name: "Assumptions" }), "The API exists");
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(() => {
			const t = mockState()
				.work.sheets["mvp-1"]?.features.flatMap((f) => f.tasks)
				.find((x) => x.id === "export-api");
			expect(t).toMatchObject({
				days: 6,
				optimistic: 3,
				pessimistic: 15,
				confidence: "low",
				assumptions: "The API exists",
			});
		});
		expect((await unwrap(commands.estimateGet("mvp-1"))).days["export-api"]).toBe(7);
	});

	it("searches, filters, edits rows in bulk and moves a row with the keyboard", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/estimates");
		const table = await screen.findByRole("table", { name: "Backlog" });
		await user.type(screen.getByRole("textbox", { name: "Search" }), "api");
		await waitFor(() => expect(within(table).queryByText("Login form")).toBeNull());
		expect(within(table).getByText("Token API")).toBeInTheDocument();
		await user.clear(screen.getByRole("textbox", { name: "Search" }));
		await user.click(screen.getByRole("button", { name: "qa" }));
		await waitFor(() => expect(within(table).queryByText("Token API")).toBeNull());
		await user.click(screen.getByRole("button", { name: "qa" }));

		await user.click(await within(table).findByRole("checkbox", { name: "Select Token API" }));
		await user.click(within(table).getByRole("checkbox", { name: "Select Login form" }));
		const bulk = within(screen.getByRole("region", { name: "2 selected" }));
		await user.type(bulk.getByRole("textbox", { name: "Set role" }), "backend");
		await user.click(bulk.getByRole("button", { name: "Apply" }));
		await waitFor(() => {
			const tasks = mockState().work.sheets["mvp-1"]?.features[0]?.tasks ?? [];
			expect(tasks.filter((x) => x.role === "backend").map((x) => x.id)).toEqual([
				"auth-api",
				"auth-web",
			]);
		});

		const handle = await within(table).findByRole("button", { name: "Move Login form" });
		fireEvent.keyDown(handle, { key: "ArrowUp", altKey: true });
		await waitFor(() =>
			expect(mockState().work.sheets["mvp-1"]?.features[0]?.tasks.map((x) => x.id)).toEqual([
				"auth-design",
				"auth-web",
				"auth-api",
				"auth-test",
			]),
		);
	});

	it("duplicates and freezes a sheet, refuses a change to it, and deletes a sheet after the confirm", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/estimates");
		const menu = async (item: string) => {
			await user.click(await screen.findByRole("button", { name: "Sheet actions" }));
			await user.click(await screen.findByRole("menuitem", { name: item }));
		};
		await menu("Duplicate");
		await waitFor(() => expect(mockState().work.sheets["mvp-1-copy"]?.name).toBe("MVP 1 (copy)"));
		await menu("Freeze");
		await waitFor(() => expect(mockState().work.sheets["mvp-1-copy"]?.frozen).toBe(true));
		expect(await screen.findByText("Frozen")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Task" })).toBeDisabled();
		await expect(
			unwrap(commands.estimateSave("mvp-1-copy", { name: "Changed", features: [], frozen: true })),
		).rejects.toThrow(/frozen/);
		await menu("Unfreeze");
		await waitFor(() => expect(mockState().work.sheets["mvp-1-copy"]?.frozen).toBeUndefined());
		mockState().confirm = false;
		await menu("Delete");
		expect(mockState().work.sheets["mvp-1-copy"]).toBeDefined();
		mockState().confirm = true;
		await menu("Delete");
		await waitFor(() => expect(mockState().work.sheets["mvp-1-copy"]).toBeUndefined());
	});

	it("sums days and cost by profile, for the lot and for every lot, with no day rate", async () => {
		const user = userEvent.setup();
		await withTracker();
		// A third developer with a rate: a cost shows only for a role of three (`work::MIN_RATED`).
		const [ada] = mockState().work.team.members;
		if (ada)
			mockState().work.team.members.push({ ...ada, name: "Linus", handle: "linus", trackers: [] });
		mountApp("/work/estimates");
		await user.click(await screen.findByRole("tab", { name: "Summary" }));
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
		await user.click(view("Portfolio"));
		expect(await screen.findByRole("table", { name: "By profile, Portfolio" })).toBeInTheDocument();
	});

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		mountApp("/work/estimates");
		expect(await screen.findByRole("tab", { name: "Synthèse" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Importer" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Tâche" })).toBeInTheDocument();
	});
});

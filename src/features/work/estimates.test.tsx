import { screen, waitFor, within } from "@testing-library/react";
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

	it("shows equal totals in the summary, the spread and the portfolio", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/estimates");
		const sheet = await unwrap(commands.estimateGet("mvp-1"));
		await user.click(await screen.findByRole("tab", { name: "Summary" }));
		for (const label of ["Days", "Cost", "Price", "Margin"])
			expect(await screen.findByText(label)).toBeInTheDocument();
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

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		mountApp("/work/estimates");
		expect(await screen.findByRole("tab", { name: "Synthèse" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Importer" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Tâche" })).toBeInTheDocument();
	});
});

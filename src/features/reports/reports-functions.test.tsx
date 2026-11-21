import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mountKnowledge, mountView } from "@/features/knowledge/harness";
import { en } from "@/lib/i18n/en";
import { mockState } from "@/lib/ipc/mock";
import { formatDay } from "@/lib/prefs/dates";
import { Reports } from "./reports-page";

const f = en.library.fn.reports;
const exported = () => mockState().reports.exported.map((e) => `${e.kind} ${e.path}`);
const formats = async () => screen.findByRole("group", { name: "Format" });
const pick = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
	user.click(within(await formats()).getByRole("button", { name }));

// spec:library-functions#REQ-006
describe("PDF and Markdown output of reports", () => {
	it("offers PDF, Word, Excel and Markdown, with PDF off outside macOS", async () => {
		await mountView(<Reports />);
		const group = within(await formats());
		expect(group.getAllByRole("button").map((b) => b.textContent)).toEqual([
			"PDF",
			"Word",
			"Excel",
			"Markdown",
		]);
		expect(group.getByRole("button", { name: "PDF" })).toBeDisabled();
		expect(group.getByRole("button", { name: "Markdown" })).toBeEnabled();
	});

	it("writes a text report as Markdown", async () => {
		const user = userEvent.setup();
		await mountView(<Reports />);
		await pick(user, "Markdown");
		await user.click(await screen.findByRole("button", { name: "Export Complete dossier" }));
		await waitFor(() => expect(exported()).toEqual(["dossier-complete /mock/dossier.md"]));
		expect(await screen.findByText("Exported: /mock/dossier.md")).toBeVisible();
	});

	it("writes a text report as PDF on macOS", async () => {
		const user = userEvent.setup();
		mockState().platform = "macos";
		await mountView(<Reports />);
		await pick(user, "PDF");
		await user.click(await screen.findByRole("button", { name: "Export Complete dossier" }));
		await waitFor(() => expect(exported()).toEqual(["dossier-complete /mock/dossier.pdf"]));
	});

	it("keeps the own format of a sheet when the switch names another one", async () => {
		const user = userEvent.setup();
		await mountView(<Reports />);
		await pick(user, "Markdown");
		await user.click(await screen.findByRole("button", { name: "Export Security findings" }));
		await waitFor(() => expect(exported()).toEqual(["security /mock/security.xlsx"]));
	});

	it("downloads one document as Word, and as PDF on macOS", async () => {
		const user = userEvent.setup();
		mockState().platform = "macos";
		await mountKnowledge("documents");
		await user.click(await screen.findByRole("button", { name: /^Client brief/ }));
		const row = (await screen.findByText(f.download)).parentElement as HTMLElement;
		await user.click(within(row).getByRole("button", { name: "Word" }));
		await waitFor(() =>
			expect(mockState().knowledge.exported.map((e) => `${e.kind} ${e.path}`)).toEqual([
				"document /mock/client-brief.docx",
			]),
		);
		await user.click(within(row).getByRole("button", { name: "PDF" }));
		await waitFor(() =>
			expect(mockState().knowledge.exported.at(-1)).toEqual({
				kind: "document",
				path: "/mock/client-brief.pdf",
			}),
		);
	});

	it("turns the PDF download off outside macOS", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await user.click(await screen.findByRole("button", { name: /^Client brief/ }));
		const row = (await screen.findByText(f.download)).parentElement as HTMLElement;
		expect(within(row).getByRole("button", { name: "PDF" })).toBeDisabled();
		expect(within(row).getByRole("button", { name: "Word" })).toBeEnabled();
	});
});

// spec:library-functions#REQ-007
describe("Reports page cards and the dossier form", () => {
	it("has a Costing card that exports the costing", async () => {
		await mountView(<Reports />);
		expect(await screen.findByRole("heading", { level: 2, name: "Costing" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Export Costing" })).toBeVisible();
	});

	it("shows the person and the day on each row of Written for you", async () => {
		await mountView(<Reports />);
		const forYou = within(await screen.findByRole("region", { name: "Written for you" }));
		const row = forYou.getByText("Architecture dossier").closest("div") as HTMLElement;
		await waitFor(() => expect(row).toHaveTextContent("Ada Lovelace"));
		expect(row).toHaveTextContent(formatDay("2026-11-18", "", "en"));
		// A report that nobody wrote has no person and no day.
		const other = forYou.getByText("Quality sheet").closest("div") as HTMLElement;
		expect(other).not.toHaveTextContent("Ada Lovelace");
	});

	it("notes the person and the day when a document is written", async () => {
		const user = userEvent.setup();
		await mountView(<Reports />);
		await user.click(
			await screen.findByRole("button", { name: "Write it Functional documentation" }),
		);
		await waitFor(() =>
			expect(mockState().reports.written.map((w) => w.report)).toContain("functional"),
		);
		const forYou = within(await screen.findByRole("region", { name: "Written for you" }));
		await waitFor(() =>
			expect(forYou.getByText("Functional documentation").closest("div")).toHaveTextContent(
				"Ada Lovelace",
			),
		);
	});

	it("has an Export on the Change request card and a row of the pages that link to a report", async () => {
		const user = userEvent.setup();
		await mountView(<Reports />);
		await user.click(await screen.findByRole("button", { name: "Export Change request" }));
		await waitFor(() => expect(mockState().reports.changeRequests).toEqual(["CR-001"]));
		expect(await screen.findByText(/CR-001\.docx/)).toBeVisible();
		expect(screen.getByRole("link", { name: f.linking })).toHaveAttribute(
			"href",
			"/library/handbook",
		);
	});

	it("asks the title, the client and the date before it writes the complete dossier", async () => {
		const user = userEvent.setup();
		await mountView(<Reports />);
		expect(
			await screen.findByRole("link", { name: "Fill the form Complete dossier" }),
		).toHaveAttribute("href", "/library/reports/dossier-complete");
		await mountKnowledge("reports", "/library/reports/dossier-complete");
		expect(
			await screen.findByRole("heading", { level: 1, name: "Complete dossier" }),
		).toBeVisible();
		const write = screen.getByRole("button", { name: "Write the report" });
		await user.click(write);
		expect(await screen.findByRole("alert")).toHaveTextContent("Fill in each field");
		expect(exported()).toEqual([]);
		expect(screen.getByLabelText(f.date)).toHaveValue(new Date().toISOString().slice(0, 10));
		await user.clear(screen.getByRole("textbox", { name: "Title" }));
		await user.type(screen.getByRole("textbox", { name: "Title" }), "Handover");
		await user.type(screen.getByRole("textbox", { name: f.client }), "Acme");
		await user.click(write);
		await waitFor(() => expect(exported()).toEqual(["dossier-complete /mock/dossier.docx"]));
		expect(await screen.findByText("/mock/dossier.docx")).toBeVisible();
	}, 15000);

	it("writes the change request as PDF on macOS, with the Markdown and no Word file", async () => {
		const user = userEvent.setup();
		mockState().platform = "macos";
		await mountKnowledge("reports", "/library/reports/change-request");
		const format = await screen.findByRole("group", { name: "Format" });
		await user.click(within(format).getByRole("button", { name: f.pdf }));
		await user.type(screen.getByRole("textbox", { name: "Title" }), "Add billing");
		await user.click(screen.getByRole("button", { name: "Write the report" }));
		await waitFor(() => expect(mockState().reports.changeRequests).toEqual(["CR-001"]));
		expect(await screen.findByText(/CR-001\.pdf/)).toBeVisible();
		expect(screen.getByText(/CR-001\.md/)).toBeVisible();
		expect(screen.queryByText(/CR-001\.docx/)).toBeNull();
	}, 15000);

	it("lists the parts of the complete dossier and the other forms on the dossier form", async () => {
		await mountKnowledge("reports", "/library/reports/dossier-complete");
		expect(
			await within(
				await screen.findByRole("region", { name: "Parts of the complete dossier" }),
			).findByText("Data models"),
		).toBeVisible();
		expect(screen.getByRole("link", { name: /^Change request/ })).toHaveAttribute(
			"href",
			"/library/reports/change-request",
		);
	});
});

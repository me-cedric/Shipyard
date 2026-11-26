import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mountKnowledge, mountView } from "@/features/knowledge/harness";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { Reports } from "./reports-page";

const kinds = () => mockState().reports.exported.map((e) => e.kind);
const card = async (name: string) =>
	(await screen.findByRole("heading", { name })).closest("li") as HTMLElement;

/** The person of the mock with the level `none` in some areas. */
async function hide(...areas: string[]) {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const view = await unwrap(commands.rightsGet());
	mockState().person = {
		member: "bo",
		found: "email",
		role: "developer",
		admin: false,
		readOnly: false,
		rights: [],
		access: { ...view.person.access, ...Object.fromEntries(areas.map((a) => [a, "none"])) },
	};
}

describe("Library / Reports (spec:app-redesign#REQ-003)", () => {
	it("lists each export of the pages and the documents on one page", async () => {
		await mountView(<Reports />);
		expect(await screen.findByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
		for (const name of [
			"Complete dossier",
			"Change request",
			"Work done",
			"Costing",
			"Network flows",
			"Questions and risks",
			"Security findings",
			"Schedule",
			"Timeline picture",
			"Estimate workbook",
		])
			expect(await screen.findByRole("heading", { level: 2, name })).toBeVisible();
		// The three documents of Documents are rows of "Written for you".
		const forYou = within(screen.getByRole("region", { name: "Written for you" }));
		for (const name of ["Architecture dossier", "Functional documentation", "Quality sheet"]) {
			expect(forYou.getByText(name)).toBeVisible();
			expect(forYou.getByRole("link", { name: `Open ${name}` })).toHaveAttribute(
				"href",
				"/library/documents",
			);
		}
		expect(screen.getByRole("link", { name: "Dashboards" })).toHaveAttribute(
			"href",
			"/library/dashboards",
		);
		expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/library/home");
	});

	it("exports a sheet with one click and shows the file", async () => {
		const user = userEvent.setup();
		await mountView(<Reports />);
		await user.click(await screen.findByRole("button", { name: "Export Security findings" }));
		await waitFor(() => expect(kinds()).toEqual(["security"]));
		expect(await screen.findByText("Exported: /mock/security.xlsx")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Show in folder" })).toBeVisible();
	});

	it("exports a document of Documents", async () => {
		const user = userEvent.setup();
		await mountView(<Reports />);
		await user.click(
			await screen.findByRole("button", { name: "Write it Functional documentation" }),
		);
		await waitFor(() =>
			expect(mockState().knowledge.exported.map((e) => e.kind)).toEqual(["functional"]),
		);
	});

	it("links a report that asks first to the page of its form", async () => {
		await mountView(<Reports />);
		expect(
			await screen.findByRole("link", { name: "Fill the form Change request" }),
		).toHaveAttribute("href", "/library/reports/change-request");
		expect(screen.getByRole("link", { name: "Fill the form Work done" })).toHaveAttribute(
			"href",
			"/library/reports/work-done",
		);
	});

	it("writes a change request on the page of its form, with people of the team", async () => {
		const user = userEvent.setup();
		await mountKnowledge("reports", "/library/reports/change-request");
		expect(await screen.findByRole("heading", { level: 1, name: "Change request" })).toBeVisible();
		expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute(
			"href",
			"/library/reports",
		);
		const write = screen.getByRole("button", { name: "Write the report" });
		expect(write).toBeEnabled();
		await user.click(write);
		expect(await screen.findByRole("alert")).toHaveTextContent("Fill in: ");
		expect(mockState().reports.changeRequests).toEqual([]);
		// The empty field is marked and has the focus.
		expect(screen.getByRole("textbox", { name: "Title" })).toBeInvalid();
		expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
		await user.type(screen.getByRole("textbox", { name: "Title" }), "Add billing");
		expect(screen.getByRole("textbox", { name: "From version" })).toHaveValue("main");
		expect(screen.getByRole("textbox", { name: "To version" })).toHaveValue("HEAD");
		await user.click(await screen.findByRole("button", { name: "Add" }));
		const first = (await screen.findAllByRole("menuitemcheckbox"))[0] as HTMLElement;
		const name = first.textContent ?? "";
		await user.click(first);
		await user.keyboard("{Escape}");
		expect(await screen.findByRole("img", { name })).toBeVisible();
		await user.click(write);
		await waitFor(() => expect(mockState().reports.changeRequests).toEqual(["CR-001"]));
		expect(await screen.findByText(/CR-001\.md/)).toBeInTheDocument();
		expect(screen.getByText(/CR-001\.docx/)).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: "Show in folder" })).toHaveLength(2);
		// The right cards: the other form, the reports with no form and the parts of the dossier.
		expect(screen.getByRole("link", { name: /^Work done/ })).toHaveAttribute(
			"href",
			"/library/reports/work-done",
		);
		expect(screen.getByRole("link", { name: "All reports" })).toHaveAttribute(
			"href",
			"/library/reports",
		);
		expect(
			within(screen.getByRole("region", { name: "Parts of the complete dossier" })).getByText(
				"Data models",
			),
		).toBeVisible();
	}, 15000);

	it("shows a refused export with its sentence", async () => {
		const user = userEvent.setup();
		await mountKnowledge("reports", "/library/reports/change-request");
		const project = mockState().projects[0];
		if (project) project.overrides.readOnly = true;
		await user.type(await screen.findByRole("textbox", { name: "Title" }), "Add billing");
		await user.click(screen.getByRole("button", { name: "Write the report" }));
		expect(await screen.findByRole("alert")).toBeVisible();
		expect(mockState().reports.changeRequests).toEqual([]);
	}, 15000);

	it("sends an address with no form back to Reports", async () => {
		const router = await mountKnowledge("reports", "/library/reports/none");
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/reports"));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("sends a report that needs a chosen sheet to its page", async () => {
		await mountView(<Reports />);
		expect(within(await card("Schedule")).getByRole("link", { name: "Open Plan" })).toHaveAttribute(
			"href",
			"/plan/timeline",
		);
		expect(
			within(await card("Estimate workbook")).getByRole("link", { name: "Open Estimates" }),
		).toHaveAttribute("href", "/plan/estimates");
		expect(screen.queryByRole("button", { name: "Export Schedule" })).toBeNull();
	});

	// spec:app-redesign#REQ-006: a report shows only to a role that sees the page of its export.
	it("hides each report of an area that the role does not see", async () => {
		await hide("work", "code", "specs");
		await mountView(<Reports />);
		expect(
			await screen.findByRole("heading", { level: 2, name: "Complete dossier" }),
		).toBeVisible();
		expect(await screen.findByRole("heading", { level: 2, name: "Network flows" })).toBeVisible();
		await waitFor(() =>
			expect(screen.queryByRole("heading", { level: 2, name: "Schedule" })).toBeNull(),
		);
		for (const name of [
			"Work done",
			"Costing",
			"Questions and risks",
			"Security findings",
			"Schedule",
			"Timeline picture",
			"Image (PNG)",
			"Estimate workbook",
		])
			expect(screen.queryByRole("heading", { level: 2, name })).toBeNull();
		expect(screen.queryByRole("link", { name: "Open Plan" })).toBeNull();
		expect(screen.queryByRole("link", { name: "Open Estimates" })).toBeNull();
	});

	it("hides the reports of Documents and of Design with their areas", async () => {
		await hide("knowledge", "design");
		await mountView(<Reports />);
		expect(await screen.findByRole("heading", { level: 2, name: "Costing" })).toBeVisible();
		// The rights load after the first paint.
		await waitFor(() =>
			expect(screen.queryByRole("heading", { level: 2, name: "Complete dossier" })).toBeNull(),
		);
		for (const name of ["Change request", "Network flows"])
			expect(screen.queryByRole("heading", { level: 2, name })).toBeNull();
		expect(screen.queryByText("Quality sheet")).toBeNull();
		expect(screen.queryByRole("region", { name: "Written for you" })).toBeNull();
	});

	it("shows the Network flows export only when a flow file exists", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const files = mockState().design.files;
		for (const path of Object.keys(files)) if (path.startsWith("docs/flows/")) delete files[path];
		await mountView(<Reports />);
		expect(await screen.findByRole("heading", { level: 2, name: "Costing" })).toBeVisible();
		expect(screen.queryByRole("heading", { level: 2, name: "Network flows" })).toBeNull();
	});
});

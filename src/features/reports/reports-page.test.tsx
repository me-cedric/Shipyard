import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mountView } from "@/features/knowledge/harness";
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
			"Estimates",
			"Network flows",
			"RAID register",
			"Security findings",
			"Architecture dossier",
			"Functional documentation",
			"Quality sheet",
			"Schedule",
			"Gantt chart",
			"Sheet workbook",
		])
			expect(await screen.findByRole("heading", { level: 2, name })).toBeVisible();
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
			await screen.findByRole("button", { name: "Export Functional documentation" }),
		);
		await waitFor(() =>
			expect(mockState().knowledge.exported.map((e) => e.kind)).toEqual(["functional"]),
		);
	});

	it("keeps only the reports of the chosen format", async () => {
		const user = userEvent.setup();
		await mountView(<Reports />);
		const formats = await screen.findByRole("navigation", { name: "Format" });
		await user.click(within(formats).getByRole("button", { name: "Word" }));
		expect(screen.getByRole("heading", { name: "Complete dossier" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "Change request" })).toBeVisible();
		expect(screen.queryByRole("heading", { name: "Security findings" })).toBeNull();
		await user.click(within(formats).getByRole("button", { name: "Picture" }));
		expect(screen.getByRole("heading", { name: "Gantt chart" })).toBeVisible();
		expect(screen.queryByRole("heading", { name: "Complete dossier" })).toBeNull();
		await user.click(within(formats).getByRole("button", { name: "All" }));
		expect(screen.getByRole("heading", { name: "Security findings" })).toBeVisible();
	});

	it("opens the form of a report that asks first, and writes it", async () => {
		const user = userEvent.setup();
		await mountView(<Reports />);
		await user.click(await screen.findByRole("button", { name: "Fill the form Change request" }));
		const form = await screen.findByRole("dialog");
		await user.type(within(form).getByRole("textbox", { name: "Title" }), "Add billing");
		await user.click(within(form).getByRole("button", { name: "Export" }));
		await waitFor(() => expect(mockState().reports.changeRequests).toEqual(["CR-001"]));
		expect(await screen.findByText(/CR-001\.md/)).toBeInTheDocument();
	}, 15000);

	it("shows a refused export with its sentence", async () => {
		const user = userEvent.setup();
		await mountView(<Reports />);
		const project = mockState().projects[0];
		if (project) project.overrides.readOnly = true;
		await user.click(await screen.findByRole("button", { name: "Fill the form Change request" }));
		const form = await screen.findByRole("dialog");
		await user.type(within(form).getByRole("textbox", { name: "Title" }), "Add billing");
		await user.click(within(form).getByRole("button", { name: "Export" }));
		expect(await within(form).findByRole("alert")).toBeVisible();
		expect(mockState().reports.changeRequests).toEqual([]);
	}, 15000);

	it("sends a report that needs a chosen sheet to its page", async () => {
		await mountView(<Reports />);
		expect(within(await card("Schedule")).getByRole("link", { name: "Open Plan" })).toHaveAttribute(
			"href",
			"/plan/timeline",
		);
		expect(
			within(await card("Sheet workbook")).getByRole("link", { name: "Open Estimates" }),
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
			"Estimates",
			"RAID register",
			"Security findings",
			"Schedule",
			"Gantt chart",
			"Image (PNG)",
			"Sheet workbook",
		])
			expect(screen.queryByRole("heading", { level: 2, name })).toBeNull();
		expect(screen.queryByRole("link", { name: "Open Plan" })).toBeNull();
		expect(screen.queryByRole("link", { name: "Open Estimates" })).toBeNull();
	});

	it("hides the reports of Documents and of Design with their areas", async () => {
		await hide("knowledge", "design");
		await mountView(<Reports />);
		expect(await screen.findByRole("heading", { level: 2, name: "Estimates" })).toBeVisible();
		// The rights load after the first paint.
		await waitFor(() =>
			expect(screen.queryByRole("heading", { level: 2, name: "Complete dossier" })).toBeNull(),
		);
		for (const name of ["Change request", "Network flows", "Quality sheet"])
			expect(screen.queryByRole("heading", { level: 2, name })).toBeNull();
	});

	it("shows the Network flows export only when a flow file exists", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const files = mockState().design.files;
		for (const path of Object.keys(files)) if (path.startsWith("docs/flows/")) delete files[path];
		await mountView(<Reports />);
		expect(await screen.findByRole("heading", { level: 2, name: "Estimates" })).toBeVisible();
		expect(screen.queryByRole("heading", { level: 2, name: "Network flows" })).toBeNull();
	});
});

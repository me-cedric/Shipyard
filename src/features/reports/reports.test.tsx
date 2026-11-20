import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, toFailure, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const kinds = () => mockState().reports.exported.map((e) => e.kind);

describe("Exports and the terminal (W11)", () => {
	it("exports the complete dossier from the Export menu of Knowledge / Documents", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/knowledge/documents");
		await user.click(await screen.findByRole("button", { name: "Export" }));
		await user.click(await screen.findByRole("menuitem", { name: "Complete dossier" }));
		await waitFor(() => expect(kinds()).toEqual(["dossier-complete"]));
		expect(await screen.findByText("Exported: /mock/dossier.docx")).toBeInTheDocument();
	});

	it("opens an export saved outside the project, and shows a refusal when the path is not an export", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/knowledge/documents");
		await user.click(await screen.findByRole("button", { name: "Export" }));
		await user.click(await screen.findByRole("menuitem", { name: "Complete dossier" }));
		// The File card of the open document has its own "Show in folder": take the one of the export.
		const saved = (await screen.findByText("Exported: /mock/dossier.docx"))
			.parentElement as HTMLElement;
		const show = await within(saved).findByRole("button", { name: "Show in folder" });
		await user.click(show);
		expect(screen.queryByRole("alert")).toBeNull();
		mockState().reports.exported.length = 0;
		await user.click(show);
		expect(await screen.findByRole("alert")).toBeVisible();
	});

	it("opens the page of the change request form from the Export menu of Documents", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/knowledge/documents");
		await user.click(await screen.findByRole("button", { name: "Export" }));
		await user.click(await screen.findByRole("menuitem", { name: "Change request" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/library/reports/change-request"),
		);
		expect(await screen.findByRole("textbox", { name: "Title" })).toBeVisible();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	}, 15000);

	it("exports the security findings from Code / Quality", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "Security score" }));
		await user.click(await screen.findByRole("button", { name: "Export" }));
		await user.click(await screen.findByRole("menuitem", { name: "Security findings" }));
		await waitFor(() => expect(kinds()).toEqual(["security"]));
	});

	it("exports the work done after a form with a period", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/history");
		// The export is behind More in the detail of the commit.
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("button", { name: "Export" }));
		await user.click(await screen.findByRole("menuitem", { name: "Work done" }));
		expect(await screen.findByRole("heading", { level: 1, name: "Work done" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Write the report" }));
		await waitFor(() => expect(kinds()).toEqual(["work-done"]));
		expect(await screen.findByText("/mock/work-done.xlsx")).toBeInTheDocument();
	});

	it("picks the terminal app in Settings / Me and opens a terminal from the terminal drawer", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/settings/me");
		await user.click(await screen.findByRole("combobox", { name: "Terminal app" }));
		await user.click(await screen.findByRole("option", { name: "kitty" }));
		await waitFor(() => expect(mockState().prefs.terminalApp).toBe("kitty"));
		// The terminal action is in the Ask bar, under Do.
		await user.click(await screen.findByRole("combobox", { name: "Ask or tell Shipyard" }));
		await user.click(await screen.findByRole("option", { name: /^Terminal/ }));
		await user.click(await screen.findByRole("button", { name: "Dock terminal" }));
		await user.click(await screen.findByRole("menuitem", { name: "Open in kitty" }));
		await waitFor(() =>
			expect(mockState().reports.launched).toEqual([{ id: "kitty", folder: "" }]),
		);
	});

	it("sends a stored Settings / Team path to Work / Team", async () => {
		const router = mountApp("/settings/team");
		await waitFor(() => expect(router.state.location.pathname).toBe("/crew/crew"));
		expect(screen.queryByText(/not found/i)).toBeNull();
	});
});

describe("The error contract for merge, forge, git and sync", () => {
	it("gives each a code and one action", () => {
		const open = toFailure("a draft pull request cannot merge: mark it ready first");
		expect(open.code).toBe("merge_draft");
		expect(open.action).toEqual({ kind: "open", target: "/code/now" });
		expect(toFailure("HTTP 401: bad credentials").action).toEqual({
			kind: "setting",
			target: "/setup/project?page=connections#connections",
		});
		// An outage offers no sync: a forge outage must not read the tracker again.
		expect(toFailure("network error: timed out").action).toBeNull();
		expect(toFailure("nothing is staged").code).toBe("git_nothing_staged");
	});
});

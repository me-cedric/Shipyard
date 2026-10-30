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

	it("writes a change request from a form and shows its two files", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/knowledge/documents");
		await user.click(await screen.findByRole("button", { name: "Export" }));
		await user.click(await screen.findByRole("menuitem", { name: "Change request" }));
		const form = await screen.findByRole("dialog");
		await user.type(within(form).getByRole("textbox", { name: "Title" }), "Add billing");
		await user.click(within(form).getByRole("button", { name: "Export" }));
		await waitFor(() => expect(mockState().reports.changeRequests).toEqual(["CR-001"]));
		expect(await screen.findByText(/CR-001\.md/)).toBeInTheDocument();
	}, 15000);

	it("shows a refused export with its sentence", async () => {
		const user = userEvent.setup();
		await open();
		const project = mockState().projects[0];
		if (project) project.overrides.readOnly = true;
		mountApp("/knowledge/documents");
		await user.click(await screen.findByRole("button", { name: "Export" }));
		await user.click(await screen.findByRole("menuitem", { name: "Change request" }));
		const form = await screen.findByRole("dialog");
		await user.type(within(form).getByRole("textbox", { name: "Title" }), "Add billing");
		await user.click(within(form).getByRole("button", { name: "Export" }));
		expect(await within(form).findByRole("alert")).toBeVisible();
		expect(mockState().reports.changeRequests).toEqual([]);
	}, 15000);

	it("exports the security findings from Code / Quality", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "Export" }));
		await user.click(await screen.findByRole("menuitem", { name: "Security findings" }));
		await waitFor(() => expect(kinds()).toEqual(["security"]));
	});

	it("exports the work done after a form with a period", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/history");
		await user.click(await screen.findByRole("button", { name: "Export" }));
		await user.click(await screen.findByRole("menuitem", { name: "Work done" }));
		const form = await screen.findByRole("dialog");
		await user.click(within(form).getByRole("button", { name: "Export" }));
		await waitFor(() => expect(kinds()).toEqual(["work-done"]));
	});

	it("picks the terminal app in Settings / Me and opens a terminal from the context bar", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/settings/me");
		await user.click(await screen.findByRole("combobox", { name: "Terminal app" }));
		await user.click(await screen.findByRole("option", { name: "kitty" }));
		await waitFor(() => expect(mockState().prefs.terminalApp).toBe("kitty"));
		await user.click(await screen.findByRole("button", { name: "Open in terminal" }));
		await waitFor(() =>
			expect(mockState().reports.launched).toEqual([{ id: "kitty", folder: "" }]),
		);
	});

	it("sends a stored Settings / Team path to Work / Team", async () => {
		const router = mountApp("/settings/team");
		await waitFor(() => expect(router.state.location.pathname).toBe("/work/team"));
		expect(screen.queryByText(/not found/i)).toBeNull();
	});
});

describe("The error contract for merge, forge, git and sync", () => {
	it("gives each a code and one action", () => {
		const open = toFailure("a draft pull request cannot merge: mark it ready first");
		expect(open.code).toBe("merge_draft");
		expect(open.action).toEqual({ kind: "open", target: "/code/pull-requests" });
		expect(toFailure("HTTP 401: bad credentials").action).toEqual({
			kind: "setting",
			target: "connections",
		});
		// An outage offers no sync: a forge outage must not read the tracker again.
		expect(toFailure("network error: timed out").action).toBeNull();
		expect(toFailure("nothing is staged").code).toBe("git_nothing_staged");
	});
});

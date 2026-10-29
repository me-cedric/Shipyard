import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

/** An open project whose tracker is a Linear connection. Without `secret` the polls fail. */
async function withTracker(secret = true) {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const c = await unwrap(
		commands.connectionsAdd({
			name: "Acme",
			group: "tracker",
			kind: "linear",
			url: "",
			user: null,
		}),
	);
	if (secret) await unwrap(commands.connectionsSetSecret(c.id, "tok-sync-view"));
	const settings = await unwrap(commands.projectSettings());
	if (!settings?.file) throw new Error("no project file");
	await unwrap(
		commands.projectFileSave({ ...settings.file, connections: { tracker: c.id, forge: null } }),
	);
	return c.id;
}

/** A clean working copy: the git part of the sync action then has nothing to refuse. */
async function cleanCopy() {
	await unwrap(commands.codeDiscard(["src", "docs"], false));
	await unwrap(commands.codeDiscard(["README.md"], true));
	await unwrap(commands.codeUnstage(["src"]));
	await unwrap(commands.codeDiscard(["src"], false));
}

const bar = async () => within(await screen.findByRole("contentinfo"));
const rows = () => screen.findAllByRole("group", { name: /^ACME-\d+$/ });

describe("Work / Backlog", () => {
	it("shows the count before it writes and the tickets after the confirm", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/backlog");
		await user.click(await screen.findByRole("button", { name: "Import" }));
		const main = within(await screen.findByRole("main"));
		expect(await main.findByRole("status")).toHaveTextContent("10 open tickets");
		expect(mockState().sync.mirror).toHaveLength(0);
		await user.click(screen.getByRole("button", { name: "Confirm" }));
		expect(await rows()).toHaveLength(10);
		expect(screen.getByRole("heading", { name: "Backlog (10)" })).toBeInTheDocument();
		// The closed tickets are not in the import.
		expect(screen.queryByRole("group", { name: "ACME-11" })).toBeNull();
	});

	it("leaves the mirror empty when the person cancels", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/backlog");
		await user.click(await screen.findByRole("button", { name: "Import" }));
		await user.click(await screen.findByRole("button", { name: "Cancel" }));
		expect(mockState().sync.mirror).toHaveLength(0);
		expect(await screen.findByRole("button", { name: "Import" })).toBeInTheDocument();
	});

	it("adopts a closed ticket by key and names a missing one", async () => {
		const user = userEvent.setup();
		await withTracker();
		await unwrap(commands.syncImportPlan());
		await unwrap(commands.syncImportConfirm());
		mountApp("/work/backlog");
		await rows();
		await user.type(await screen.findByRole("textbox", { name: "Ticket key" }), "ACME-11");
		await user.click(screen.getByRole("button", { name: "Adopt" }));
		const done = await screen.findByRole("group", { name: "ACME-11" });
		expect(within(done).getByText("Done")).toBeInTheDocument();
		await user.type(screen.getByRole("textbox", { name: "Ticket key" }), "ACME-99");
		await user.click(screen.getByRole("button", { name: "Adopt" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("not found: ACME-99");
	});

	it("links a ticket to a local ref and unlinks it", async () => {
		const user = userEvent.setup();
		await withTracker();
		await unwrap(commands.syncImportPlan());
		await unwrap(commands.syncImportConfirm());
		mountApp("/work/backlog");
		await rows();
		const first = () => screen.getByRole("group", { name: "ACME-1" });
		await user.click(within(first()).getByRole("button", { name: "Link" }));
		await user.type(within(first()).getByRole("textbox", { name: "Local ref" }), "nope");
		await user.click(within(first()).getByRole("button", { name: "Confirm" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("not a ref: nope");
		await user.clear(within(first()).getByRole("textbox", { name: "Local ref" }));
		await user.type(within(first()).getByRole("textbox", { name: "Local ref" }), "change:add-auth");
		await user.click(within(first()).getByRole("button", { name: "Confirm" }));
		expect(await within(first()).findByRole("button", { name: /^change:add-auth/ })).toBeVisible();
		await user.click(within(first()).getByRole("button", { name: "Unlink" }));
		await waitFor(() =>
			expect(within(first()).queryByRole("button", { name: /^change:add-auth/ })).toBeNull(),
		);
	});

	it("filters the mirror by text and by status with no tick", async () => {
		const user = userEvent.setup();
		await withTracker();
		await unwrap(commands.syncImportPlan());
		await unwrap(commands.syncImportConfirm());
		mountApp("/work/backlog");
		await rows();
		await user.type(screen.getByRole("textbox", { name: "Search" }), "export");
		await waitFor(() => expect(screen.getAllByRole("group", { name: /^ACME-/ })).toHaveLength(1));
		expect(screen.getByRole("group", { name: "ACME-2" })).toBeInTheDocument();
		await user.clear(screen.getByRole("textbox", { name: "Search" }));
		await user.click(screen.getByRole("combobox", { name: "Status" }));
		await user.click(await screen.findByRole("option", { name: "In Review" }));
		await waitFor(() => expect(screen.getAllByRole("group", { name: /^ACME-/ })).toHaveLength(1));
		expect(screen.getByRole("group", { name: "ACME-7" })).toBeInTheDocument();
		expect(mockState().sync.ticks).toBe(0);
	});

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		await unwrap(commands.syncImportPlan());
		await unwrap(commands.syncImportConfirm());
		mountApp("/work/backlog");
		await rows();
		expect(screen.getByRole("button", { name: "Importer" })).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Clé du ticket" })).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Statut" })).toBeInTheDocument();
	});
});

describe("the sync action and the connection state rows", () => {
	it("runs one tick from the status bar and the row shows the state with the time", async () => {
		const user = userEvent.setup();
		const id = await withTracker();
		mountApp("/settings/connections");
		const row = await screen.findByRole("group", { name: "Acme" });
		// Nothing synced yet: the dash, no time.
		expect(await within(row).findByRole("status")).toHaveTextContent("Idle");
		expect(row.querySelector("time")).toBeNull();
		await user.click((await bar()).getByRole("button", { name: "Sync" }));
		await waitFor(() => expect(mockState().sync.ticks).toBe(1));
		await waitFor(() => expect(row.querySelector("time")).not.toBeNull());
		expect(mockState().sync.lastOk[id]).toBeGreaterThan(0);
		expect(mockState().sync.mirror.length).toBeGreaterThan(0);
	});

	it("shows the failed state with the reason, and the status bar says why", async () => {
		const user = userEvent.setup();
		await withTracker(false);
		await cleanCopy();
		mountApp("/settings/connections");
		const row = await screen.findByRole("group", { name: "Acme" });
		await user.click((await bar()).getByRole("button", { name: "Sync" }));
		await waitFor(() => expect(within(row).getByRole("status")).toHaveTextContent("Failed"));
		expect(within(row).getByRole("status")).toHaveTextContent("no secret saved");
		expect((await bar()).getAllByRole("alert")[0]).toHaveTextContent("acme: no secret saved");
	});

	it("keeps the mirror when a later tick fails", async () => {
		await withTracker();
		await unwrap(commands.syncNow());
		const before = mockState().sync.mirror.length;
		delete mockState().secrets.acme;
		const report = await unwrap(commands.syncNow());
		expect(report.failed).toHaveLength(1);
		expect(mockState().sync.mirror).toHaveLength(before);
		expect(await unwrap(commands.syncItems({}))).toHaveLength(before);
	});

	it("shows no sync state for a connection that no project uses", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(
			commands.connectionsAdd({
				name: "Acme",
				group: "tracker",
				kind: "linear",
				url: "",
				user: null,
			}),
		);
		mountApp("/settings/connections");
		const row = await screen.findByRole("group", { name: "Acme" });
		expect(within(row).queryByRole("status")).toBeNull();
	});
});

describe("Settings / Project, group Automation", () => {
	it("starts from the defaults with the write switches off", async () => {
		await withTracker();
		mountApp("/settings/project");
		expect(await screen.findByRole("spinbutton", { name: "Interval (s)" })).toHaveValue(60);
		expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("shipyard");
		expect(screen.getByRole("spinbutton", { name: "Global" })).toHaveValue(2);
		for (const name of ["Push", "Pull request", "Ticket transition", "Ticket comment"])
			expect(screen.getByRole("switch", { name })).not.toBeChecked();
		expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
	});

	it("refuses an interval under 30 s and keeps the old file", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/settings/project");
		const interval = await screen.findByRole("spinbutton", { name: "Interval (s)" });
		await user.clear(interval);
		await user.type(interval, "10");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Interval: at least 30 s");
		expect(mockState().sync.file).toBe("missing");
	});

	it("saves the pickup filter, the limits, the mapping and a write switch", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/settings/project");
		const interval = await screen.findByRole("spinbutton", { name: "Interval (s)" });
		await user.clear(interval);
		await user.type(interval, "45");
		await user.clear(screen.getByRole("textbox", { name: "Label" }));
		await user.type(screen.getByRole("textbox", { name: "Label" }), "agent");
		await user.type(screen.getByRole("textbox", { name: "Statuses" }), "To Do, Ready");
		await user.type(screen.getByRole("textbox", { name: "Per status" }), "To Do=1");
		await user.type(screen.getByRole("textbox", { name: "Done, Status" }), "Closed");
		await user.click(screen.getByRole("switch", { name: "Ticket comment" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().sync.file).toBe("valid"));
		const a = mockState().sync.automation;
		expect(a.interval).toBe(45);
		expect(a.pickup).toEqual({ label: "agent", statuses: ["To Do", "Ready"] });
		expect(a.concurrency).toEqual({ global: 2, per_status: { "To Do": 1 } });
		expect(a.status_map).toEqual({ Done: { status: "Closed" } });
		expect(a.writes).toEqual({
			push: false,
			pull_request: false,
			tracker_transition: false,
			tracker_comment: true,
		});
		// The saved file resets the form: no Save button.
		await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
	});

	it("names a per-status value that is not name=number", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/settings/project");
		await user.type(await screen.findByRole("textbox", { name: "Per status" }), "To Do");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Per status: name=number");
	});

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		mountApp("/settings/project");
		expect(await screen.findByRole("spinbutton", { name: "Intervalle (s)" })).toBeInTheDocument();
		expect(screen.getByRole("switch", { name: "Commentaire du ticket" })).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Terminé, Statut" })).toBeInTheDocument();
	});
});

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

async function renderRuns() {
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	return mountApp("/factory/runs");
}
const find = async (key: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.key === key);
	if (!r) throw new Error(key);
	return r;
};

describe("Factory / Runs", () => {
	// jsdom has no matchMedia: the graph reads the colour scheme and the motion preference.
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	});

	it("goes back to History with its search from a run, and says Back", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const failed = await find("ACME-3");
		const rec = mockState().factory.runs.find((r) => r.id === failed.id);
		if (rec) rec.state = "Failed";
		const router = mountApp("/factory/runs?view=history&q=ACME-3");
		const table = await screen.findByRole("table", { name: "History" });
		const rows = await within(table).findAllByRole("row", { name: /ACME-3/ });
		rows[0]?.focus();
		await user.keyboard("{Enter}");
		await screen.findByRole("region", { name: "ACME-3" });
		await user.click(screen.getByRole("link", { name: "Back" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/done"));
		expect(router.state.location.search).toMatchObject({ q: "ACME-3" });
		expect(await screen.findByRole("table", { name: "History" })).toBeVisible();
	});

	it("names the link Runs on a deep link and goes to Runs", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = await find("ACME-2");
		const router = mountApp(`/factory/runs/${run.id}`);
		await screen.findByRole("region", { name: "ACME-2" });
		expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
		const page = within(screen.getByRole("region", { name: "ACME-2" }));
		await user.click(page.getByRole("link", { name: "Flow" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/flow"));
	});

	it("moves the focus to the title of the run after Approve plan", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-4/ }));
		const panel = await screen.findByRole("region", { name: "ACME-4" });
		await user.click(await within(panel).findByRole("button", { name: "Approve plan" }));
		await waitFor(() => expect(within(panel).getByRole("heading", { level: 1 })).toHaveFocus());
	});

	it("lists a failed run that is the latest of its ticket in History", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const failed = await find("ACME-3");
		const rec = mockState().factory.runs.find((r) => r.id === failed.id);
		if (rec) rec.state = "Failed";
		mountApp("/factory/runs?view=history");
		const table = await screen.findByRole("table", { name: "History" });
		const rows = await within(table).findAllByRole("row", { name: /ACME-3/ });
		expect(rows).toHaveLength(1);
		// No end time is known: the cell shows a dash, not a blank.
		expect(rows[0]).toHaveTextContent("–");
	});

	it("shows the reason on Stop in the menu of the run page for a viewer", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		const run = await find("ACME-2");
		mountApp(`/factory/runs/${run.id}`);
		const panel = within(await screen.findByRole("region", { name: "ACME-2" }));
		await user.click(await panel.findByRole("button", { name: "More actions" }));
		expect(await screen.findByRole("menuitem", { name: "Stop" })).toHaveAccessibleDescription(
			"Needs the right runs.start (your role: Viewer)",
		);
	});

	it("lists both runs of a ticket in History, and a row opens the run", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.syncItems({}));
		const first = await find("ACME-3");
		await unwrap(commands.runCancel(first.id));
		await unwrap(commands.runStart("ACME-3"));
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/factory/runs?view=history");
		const table = await screen.findByRole("table", { name: "History" });
		const rows = await within(table).findAllByRole("row", { name: /ACME-3/ });
		expect(rows).toHaveLength(2);
		rows[1]?.focus();
		await user.keyboard("{Enter}");
		expect(await screen.findByRole("region", { name: "ACME-3" })).toBeVisible();
	});

	it("shows the empty pattern in History when the filter hides every run", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/factory/runs?view=history&q=zzzz");
		await screen.findByText("No runs");
		await user.click(screen.getByRole("button", { name: "Board" }));
		expect(await screen.findByRole("region", { name: "Build" })).toBeInTheDocument();
	});

	it("shows the plan and its tasks on a run in plan review", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-4/ }));
		const plan = await screen.findByRole("region", { name: "Plan" });
		expect(within(plan).getByText(/Add the export button\./)).toBeInTheDocument();
		expect(within(plan).getByText("Add it to the toolbar.")).toBeInTheDocument();
	});

	it("shows the kill switch as an agents toggle", async () => {
		await renderRuns();
		expect(await screen.findByRole("switch", { name: "Agents on" })).toBeChecked();
	});

	it("starts a run from the title of a ticket of the mirror", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.runCancel((await find("ACME-3")).id));
		await renderRuns();
		const title = (await unwrap(commands.syncItems({}))).find((i) => i.key === "ACME-3")?.title;
		const before = (await unwrap(commands.runsList())).filter((r) => r.lane === "queued").length;
		const field = await screen.findByRole("combobox", { name: "Ticket" });
		await waitFor(() =>
			expect(document.querySelector(`datalist option[value="${title}"]`)).not.toBeNull(),
		);
		await user.type(field, title ?? "");
		await user.click(screen.getByRole("button", { name: "Start run" }));
		await waitFor(async () =>
			expect((await unwrap(commands.runsList())).filter((r) => r.lane === "queued").length).toBe(
				before + 1,
			),
		);
	});

	it("leaves a ticket with a run out of the list, and links the refusal to the run", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.runCancel((await find("ACME-3")).id));
		await renderRuns();
		const field = await screen.findByRole("combobox", { name: "Ticket" });
		// ACME-3 has no live run now: it is in the list. ACME-2 works: it is not.
		await waitFor(() =>
			expect(document.querySelector('datalist option[label="ACME-3"]')).not.toBeNull(),
		);
		expect(document.querySelector('datalist option[label="ACME-2"]')).toBeNull();
		await user.type(field, "ACME-2");
		await user.click(screen.getByRole("button", { name: "Start run" }));
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("A run is active on ACME-2.");
		await user.click(within(alert).getByRole("button", { name: "Open the run" }));
		expect(await screen.findByRole("region", { name: "ACME-2" })).toBeVisible();
	});

	it("names a ticket that the mirror lacks and offers to sync", async () => {
		const user = userEvent.setup();
		await renderRuns();
		const sync = vi.spyOn(commands, "syncNow");
		await user.type(await screen.findByRole("combobox", { name: "Ticket" }), "ACME-99");
		await user.click(screen.getByRole("button", { name: "Start run" }));
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("This ticket is not here yet");
		expect(alert).not.toHaveTextContent("mirror");
		await user.click(within(alert).getByRole("button", { name: "Sync" }));
		await waitFor(() => expect(sync).toHaveBeenCalled());
		sync.mockRestore();
	});

	it("starts a run from a ticket key, and the Queued count grows", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.runCancel((await find("ACME-3")).id));
		await renderRuns();
		const before = (await unwrap(commands.runsList())).filter((r) => r.lane === "queued").length;
		await user.type(await screen.findByRole("combobox", { name: "Ticket" }), "ACME-3");
		await user.click(screen.getByRole("button", { name: "Start run" }));
		await waitFor(async () =>
			expect((await unwrap(commands.runsList())).filter((r) => r.lane === "queued").length).toBe(
				before + 1,
			),
		);
	});

	it("opens the run view with the keyboard: graph nodes, events, diff, cost", async () => {
		const user = userEvent.setup();
		await renderRuns();
		const run = await find("ACME-2");
		const card = await screen.findByRole("button", { name: /ACME-2/ });
		card.focus();
		await user.keyboard("{Enter}");
		// The run view opens wide, next to the lanes.
		const panel = await screen.findByRole("region", { name: "ACME-2" });
		// Story is the first section: the plain events show, and one control opens all of them.
		await waitFor(() => expect(within(panel).getAllByRole("listitem").length).toBeGreaterThan(0));
		await user.click(within(panel).getByRole("button", { name: /^All \d+ events$/ }));
		expect(await within(panel).findByRole("region", { name: /^Events/ })).toBeInTheDocument();
		expect(
			within(within(panel).getByRole("group", { name: "Cost" })).getByText(/\$1\.84/),
		).toBeVisible();
		const sections = within(within(panel).getByRole("navigation", { name: "Sections" }));
		await user.click(sections.getByRole("button", { name: "Changes" }));
		expect(await within(panel).findByRole("region", { name: "Diff" })).toBeInTheDocument();
		await user.click(sections.getByRole("button", { name: "Story" }));
		await user.click(await within(panel).findByRole("button", { name: "Requests and sessions" }));
		const graph = await within(panel).findByRole("region", { name: "Workflow" });
		// jsdom measures no node, so xyflow keeps each one hidden.
		const node = (id: string) => within(graph).findByTestId(`rf__node-${id}`);
		for (const s of run.steps) expect(await node(s.id)).toBeInTheDocument();
		const build = within(await node("build"));
		expect(build.getByText("Units 4")).toBeInTheDocument();
	});

	it("kills a run with runCancel", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-2/ }));
		const panel = await screen.findByRole("region", { name: "ACME-2" });
		await user.click(await within(panel).findByRole("button", { name: "More actions" }));
		await user.click(await screen.findByRole("menuitem", { name: "Stop" }));
		await user.click(await within(panel).findByRole("button", { name: "Stop ACME-2?" }));
		await waitFor(async () => expect((await find("ACME-2")).state).toBe("Cancelled"));
	});

	it("unblocks and resumes from the run view", async () => {
		const user = userEvent.setup();
		const router = await renderRuns();
		// ACME-6 stopped at its budget limit: its main action adds 2 USD, the default of the stepper.
		mockState()
			.factory.runs.find((r) => r.key === "ACME-6")
			?.log.push({
				id: 9998,
				step: null,
				kind: "note",
				payload: JSON.stringify({ stop: "budget" }),
				ts: Date.now(),
			});
		for (const [key, button, to] of [
			["ACME-9", "Unblock", "Working"],
			["ACME-6", "Add budget", "Working"],
		] as const) {
			await user.click(await screen.findByRole("button", { name: new RegExp(key) }));
			const panel = await screen.findByRole("region", { name: key });
			const needs = await within(panel).findByRole("region", { name: "Needs you" });
			await user.click(within(needs).getByRole("button", { name: button }));
			await waitFor(async () => expect((await find(key)).state).toBe(to));
			await router.navigate({ to: "/factory/runs" });
		}
	});

	it("closes as done a run blocked with nothing to deliver, and only that one", async () => {
		const user = userEvent.setup();
		const router = await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-9/ }));
		const panel = await screen.findByRole("region", { name: "ACME-9" });
		await within(panel).findByRole("region", { name: "Needs you" });
		expect(within(panel).queryByRole("button", { name: "Close as done" })).toBeNull();
		expect(within(panel).getByRole("button", { name: "Reply on the ticket" })).toBeVisible();
		const run = await find("ACME-9");
		const r = mockState().factory.runs.find((x) => x.id === run.id);
		r?.log.push({
			id: 9999,
			step: "pr",
			kind: "note",
			payload: JSON.stringify({
				blocked: "nothing to deliver: the run changed no file",
				cause: "nothing_to_deliver",
			}),
			ts: Date.now(),
		});
		// Open the page again: it reads the log anew.
		await router.navigate({ to: "/factory/runs" });
		await user.click(await screen.findByRole("button", { name: /ACME-9/ }));
		const again = await screen.findByRole("region", { name: "ACME-9" });
		await user.click(await within(again).findByRole("button", { name: "Close as done" }));
		await waitFor(async () => expect((await find("ACME-9")).state).toBe("Done"));
	});

	it("shows the escalation: cause, last lines, what was tried", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-9/ }));
		const panel = await screen.findByRole("region", { name: "ACME-9" });
		const banner = await within(panel).findByRole("article");
		expect(banner).toHaveTextContent("The same failure came back twice in a row.");
		expect(banner).toHaveTextContent("Tried: 1 review rounds of 4");
		expect(banner).not.toHaveTextContent("also unblocks");
		const fold = banner.querySelector("details") as HTMLDetailsElement;
		expect(fold.open).toBe(false);
		expect(fold).toHaveTextContent("error: could not rebase");
	});

	it("unblocks with a message on Enter", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-9/ }));
		const panel = await screen.findByRole("region", { name: "ACME-9" });
		await user.type(
			await within(panel).findByRole("textbox", { name: "Message to the agent" }),
			"Keep both lines.{Enter}",
		);
		await waitFor(async () => expect((await find("ACME-9")).state).toBe("Working"));
	});

	it("shows each event on one line, with the raw JSON behind a chevron", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-2/ }));
		const panel = await screen.findByRole("region", { name: "ACME-2" });
		await user.click(await within(panel).findByRole("button", { name: /^All \d+ events$/ }));
		const events = await within(panel).findByRole("region", { name: /^Events/ });
		expect(await within(events).findByText("ACME-2 moved to Claimed")).toBeInTheDocument();
		expect(within(events).queryByText(/"from"/)).toBeNull();
		// A live run lists the newest event first: open the Details of the state change.
		const row = (await within(events).findByText("ACME-2 moved to Claimed")).closest("li");
		await user.click(within(row as HTMLElement).getByRole("button", { name: "Details" }));
		expect(await within(events).findByText(/"from"/)).toBeInTheDocument();
	});

	it("shows the live line, and the question and the approval of a waiting run on top", async () => {
		await renderRuns();
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: /ACME-1(?!\d)/ }));
		const panel = await screen.findByRole("region", { name: "ACME-1" });
		expect(
			await within(panel).findByRole("group", { name: /^Step \d+ of \d+$/ }),
		).toBeInTheDocument();
		expect(await within(panel).findByRole("button", { name: "Send" })).toBeInTheDocument();
		expect(await within(panel).findByRole("button", { name: "Approve" })).toBeInTheDocument();
		// Reject is under Each step only.
		expect(within(panel).queryByRole("button", { name: "Reject" })).toBeNull();
		await user.click(within(panel).getByRole("button", { name: "Each step" }));
		expect(within(panel).getByRole("button", { name: "Reject" })).toBeInTheDocument();
	});

	it("names the AI tool as missing and opens its Settings section (REQ-007)", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		for (const r of mockState().agents.runners) r.state = "missing";
		mockState().factory.runs.length = 0;
		const router = mountApp("/factory/runs");
		expect(await screen.findByText("No AI tool found")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Set up an AI tool" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/computer"));
		expect(router.state.location.hash).toBe("connections-runner");
	});
});

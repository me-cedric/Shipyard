import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { latestPerTicket } from "@/lib/home";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const LANES = [
	["queued", "Queued"],
	["working", "Working"],
	["needs_you", "Needs you"],
	["in_review", "In review"],
	["ready_to_merge", "Ready to merge"],
] as const;

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

	it("shows five lanes with a count each, from the mock dataset", async () => {
		await renderRuns();
		const all = await unwrap(commands.runsList());
		const runs = latestPerTicket(all);
		for (const [lane, name] of LANES) {
			const n = runs.filter((r) => r.lane === lane).length;
			expect(await screen.findByRole("heading", { name: `${name} (${n})` })).toBeInTheDocument();
		}
		expect(all).toHaveLength(14);
	});

	it("has no stat tiles and five lanes in an equal grid", async () => {
		await renderRuns();
		await screen.findByRole("heading", { name: /^Queued \(/ });
		expect(screen.queryByText("Live runs")).toBeNull();
		expect(screen.queryByText("Success rate")).toBeNull();
		expect(screen.queryByRole("heading", { name: /^Done \(/ })).toBeNull();
		const lanes = screen
			.getAllByRole("region")
			.filter((r) => r.parentElement?.className.includes("grid-cols-5"));
		expect(lanes).toHaveLength(5);
	});

	it("shows the ticket key and one action on a card that waits, and opens the run at the plan", async () => {
		const user = userEvent.setup();
		await renderRuns();
		const review = within(await screen.findByRole("region", { name: "Needs you" }));
		const card = within(await review.findByRole("group", { name: /ACME-4/ }));
		expect(card.getByText("ACME-4")).toBeVisible();
		expect(
			card.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent),
		).toEqual([expect.stringContaining("ACME-4"), "Review plan", "More actions"]);
		await user.click(card.getByRole("button", { name: "Review plan" }));
		expect(await screen.findByRole("region", { name: "ACME-4" })).toBeVisible();
	});

	it("filters by text and by Needs you, and keeps both in the address", async () => {
		const user = userEvent.setup();
		const router = await renderRuns();
		await screen.findByRole("heading", { name: /^Queued \(/ });
		await user.click(screen.getByRole("button", { name: "Needs you" }));
		await waitFor(() => expect(router.state.location.search).toMatchObject({ filter: "needs" }));
		const all = latestPerTicket(await unwrap(commands.runsList()));
		const n = all.filter((r) => r.lane === "needs_you").length;
		expect(await screen.findByRole("heading", { name: `Needs you (${n})` })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Working (0)" })).toBeInTheDocument();
		await user.type(screen.getByRole("searchbox", { name: "Search runs" }), "ACME-4");
		expect(await screen.findByRole("heading", { name: "Needs you (1)" })).toBeInTheDocument();
		await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "ACME-4" }));
	});

	it("names the workflow on the step line of a card", async () => {
		await renderRuns();
		const working = within(await screen.findByRole("region", { name: "Working" }));
		const card = within(await working.findByRole("group", { name: /ACME-2/ }));
		expect(card.getByText(/^Feature · /)).toBeVisible();
	});

	it("keeps a failed run in Needs you and in History, and its card starts the run again and opens it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const failed = await find("ACME-3");
		const rec = mockState().factory.runs.find((r) => r.id === failed.id);
		if (rec) rec.state = "Failed";
		const router = mountApp("/factory/runs");
		const needs = within(await screen.findByRole("region", { name: "Needs you" }));
		const card = within(await needs.findByRole("group", { name: /ACME-3 / }));
		await user.click(card.getByRole("button", { name: "Start again" }));
		expect(await screen.findByRole("region", { name: "ACME-3" })).toBeVisible();
		const mine = (await unwrap(commands.runsList())).filter((r) => r.key === "ACME-3");
		expect(mine).toHaveLength(2);
		const started = mine.find((r) => r.id !== failed.id);
		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/factory/runs/${started?.id}`),
		);
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
		await waitFor(() =>
			expect(router.state.location.search).toMatchObject({ view: "history", q: "ACME-3" }),
		);
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
		await user.click(page.getByRole("link", { name: "Runs" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/factory/runs"));
	});

	it("counts the cards on the board and the rows in History", async () => {
		await renderRuns();
		const all = await unwrap(commands.runsList());
		const cards = latestPerTicket(all).filter((r) => LANES.some(([lane]) => lane === r.lane));
		const count = async () =>
			(await screen.findByRole("heading", { level: 1, name: "Runs" })).nextElementSibling;
		expect(latestPerTicket(all).length).toBeGreaterThan(cards.length);
		await waitFor(async () => expect(await count()).toHaveTextContent(String(cards.length)));
		const sum = LANES.reduce((n, [lane]) => n + cards.filter((r) => r.lane === lane).length, 0);
		expect(sum).toBe(cards.length);
	});

	it("shows None and the empty pattern in a lane without a card", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/factory/runs?filter=needs");
		const working = within(await screen.findByRole("region", { name: "Working" }));
		expect(await working.findByText("None")).toBeVisible();
	});

	it("moves the focus to the plan after the Review plan button of a card", async () => {
		const user = userEvent.setup();
		await renderRuns();
		const review = within(await screen.findByRole("region", { name: "Needs you" }));
		const card = within(await review.findByRole("group", { name: /ACME-4/ }));
		await user.click(card.getByRole("button", { name: "Review plan" }));
		const plan = await screen.findByRole("region", { name: "Plan" });
		await waitFor(() => expect(plan).toHaveFocus());
	});

	it("moves the focus to the title of the run after Approve plan", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-4/ }));
		const panel = await screen.findByRole("region", { name: "ACME-4" });
		await user.click(await within(panel).findByRole("button", { name: "Approve plan" }));
		await waitFor(() => expect(within(panel).getByRole("heading", { level: 1 })).toHaveFocus());
	});

	it("shows the reason on Stop, Start again and in the card menu for a viewer", async () => {
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
		const failed = await find("ACME-3");
		const rec = mockState().factory.runs.find((r) => r.id === failed.id);
		if (rec) rec.state = "Failed";
		mountApp("/factory/runs");
		const reason = "Needs the right runs.start (your role: Viewer)";
		const needs = within(await screen.findByRole("region", { name: "Needs you" }));
		const card = within(await needs.findByRole("group", { name: /ACME-3 / }));
		expect(card.getByRole("button", { name: "Start again" })).toBeDisabled();
		expect(card.getByRole("button", { name: "Start again" })).toHaveAccessibleDescription(reason);
		const working = within(await screen.findByRole("region", { name: "Working" }));
		const live = within(await working.findByRole("group", { name: /ACME-2 / }));
		await user.click(live.getByRole("button", { name: "More actions" }));
		const stop = await screen.findByRole("menuitem", { name: "Stop" });
		expect(stop).toHaveAttribute("aria-disabled", "true");
		expect(stop).toHaveAccessibleDescription(reason);
		expect(stop).toHaveAttribute("title", reason);
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

	it("tells the person that a stopped run is in History, and moves the focus to the next card", async () => {
		const user = userEvent.setup();
		const router = await renderRuns();
		const working = within(await screen.findByRole("region", { name: "Working" }));
		const card = within(await working.findByRole("group", { name: /ACME-2 / }));
		await user.click(card.getByRole("button", { name: "More actions" }));
		await user.click(await screen.findByRole("menuitem", { name: "Stop" }));
		await user.click(await card.findByRole("button", { name: "Stop ACME-2?" }));
		const toast = within(await screen.findByRole("status", { name: "Notifications" }));
		expect(await toast.findByText("ACME-2 stopped")).toBeVisible();
		await waitFor(() => expect(document.body).not.toBe(document.activeElement));
		await user.click(toast.getByRole("button", { name: "History" }));
		await waitFor(() => expect(router.state.location.search).toMatchObject({ view: "history" }));
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

	it("searches without case or accents", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = await find("ACME-4");
		const rec = mockState().factory.runs.find((r) => r.id === run.id);
		if (rec) rec.title = "Résumé parser";
		mountApp("/factory/runs");
		await screen.findByRole("heading", { name: /^Queued \(/ });
		await user.type(screen.getByRole("searchbox", { name: "Search runs" }), "resume");
		expect(await screen.findByRole("group", { name: /Résumé parser/ })).toBeVisible();
		expect(screen.queryByRole("group", { name: /ACME-2 / })).toBeNull();
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
		// The switch has the same name: the action of the empty state is the one that is not a toggle.
		const back = screen
			.getAllByRole("button", { name: "Board" })
			.find((b) => !b.hasAttribute("aria-pressed"));
		await user.click(back as HTMLElement);
		expect(await screen.findByRole("heading", { name: /^Queued \(/ })).toBeInTheDocument();
	});

	it("shows the plan and its tasks on a run in plan review", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-4/ }));
		const plan = await screen.findByRole("region", { name: "Plan" });
		expect(within(plan).getByText(/Add the export button\./)).toBeInTheDocument();
		expect(within(plan).getByText("Add it to the toolbar.")).toBeInTheDocument();
	});

	it("hides a run that a newer run of its ticket replaces", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.syncItems({}));
		await unwrap(commands.runCancel((await find("ACME-3")).id));
		await unwrap(commands.runStart("ACME-3"));
		await renderRuns();
		const all = await unwrap(commands.runsList());
		const runs = latestPerTicket(all);
		expect(runs.length).toBeLessThan(all.length);
		for (const [lane, name] of LANES) {
			const n = runs.filter((r) => r.lane === lane).length;
			expect(await screen.findByRole("heading", { name: `${name} (${n})` })).toBeInTheDocument();
		}
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
		// Activity is the default tab: the events show first, then the Changes and Workflow tabs.
		expect(await within(panel).findByRole("region", { name: /^Events/ })).toBeInTheDocument();
		await waitFor(() => expect(within(panel).getAllByRole("listitem").length).toBeGreaterThan(0));
		expect(
			within(within(panel).getByRole("group", { name: "Cost" })).getByText(/\$1\.84/),
		).toBeVisible();
		await user.click(within(panel).getByRole("tab", { name: /^Changes/ }));
		expect(await within(panel).findByRole("region", { name: "Diff" })).toBeInTheDocument();
		await user.click(within(panel).getByRole("tab", { name: "Workflow" }));
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
		for (const [key, button, to] of [
			["ACME-9", "Unblock", "Working"],
			["ACME-6", "Resume", "Working"],
		] as const) {
			await user.click(await screen.findByRole("button", { name: new RegExp(key) }));
			const panel = await screen.findByRole("region", { name: key });
			if (button === "Resume")
				await user.type(
					await within(panel).findByRole("textbox", { name: "Added budget (USD)" }),
					"2",
				);
			// The summary has the same action, which moves the focus here: the form sends.
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
			payload: JSON.stringify({ blocked: "nothing to deliver: the run changed no file" }),
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
		const banner = await within(panel).findByRole("status");
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
		await waitFor(() => expect(router.state.location.pathname).toBe("/settings/connections"));
		expect(router.state.location.hash).toBe("connections-runner");
	});
});

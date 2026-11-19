import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));
const rows = async () => {
	const table = await screen.findByRole("table", { name: "Agents at work" });
	return within(table).getAllByRole("row").slice(1);
};
/** The count of rows for these sessions: one for each run. */
const runsOf = (sessions: { run: string; key: string }[]) =>
	new Set(sessions.map((s) => s.run || s.key)).size;
const filter = () => within(screen.getByRole("group", { name: "Filter" }));
const find = async (key: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.key === key);
	if (!r) throw new Error(key);
	return r;
};

// spec:app-redesign#REQ-017: one row for each agent, in place of the agents map.
describe("Crew / Live", () => {
	it("gives one row for each run with an agent at work, with its agent, its feature and what it touches", async () => {
		await withTracker();
		// Seven sessions run in the demo: the step of one run ends, so six agents stay at work.
		for (const step of mockState().factory.runs.find((r) => r.key === "ACME-6")?.steps ?? [])
			step.state = "done";
		const live = (await unwrap(commands.sessionsList())).filter(
			(s) => s.state === "running" || s.state === "gate",
		);
		expect(live).toHaveLength(6);
		// Two units of one step are one run: the run shows on one row.
		const count = runsOf(live);
		expect(count).toBeLessThan(6);
		const router = mountApp("/crew/crew?view=live");
		await waitFor(async () => expect(await rows()).toHaveLength(count));
		const heads = within(screen.getByRole("main")).getAllByRole("heading", { level: 1 });
		expect(heads).toHaveLength(1);
		expect(heads[0]).toHaveTextContent(`${count} agents at work`);
		const run = await find("ACME-10");
		const row = (await rows()).find((r) => r.textContent?.includes(run.title));
		if (!row) throw new Error("no row for ACME-10");
		const [agent, feature, touches] = within(row).getAllByRole("cell") as [
			HTMLElement,
			HTMLElement,
			HTMLElement,
		];
		// The agent is the role of the step, and it names the ref of its session.
		await waitFor(() => expect(within(agent).getByRole("button")).toHaveTextContent("Reviewer"));
		expect(within(agent).getByRole("button")).toHaveAttribute("title", `run:${run.id}/review`);
		expect(within(feature).getByRole("link", { name: new RegExp(run.title) })).toHaveAttribute(
			"href",
			`/flow/feature/${encodeURIComponent("wi:ACME-10")}`,
		);
		// The file of its finding and the files that the run changed, as short chips. No ticket id and no run id.
		const chips = within(touches).getAllByRole("button");
		const refs = chips.map((b) => b.getAttribute("data-ask"));
		const files = [
			...run.findings.flatMap((f) => (f.path ? [f.path] : [])),
			...(await unwrap(commands.runDiff(run.id))).map((d) => d.path),
		];
		expect(refs).toEqual([...new Set(files)].slice(0, 6).map((f) => `doc:${f}`));
		expect(refs.length).toBeGreaterThan(0);
		expect(chips[0]).toHaveTextContent(files[0]?.split("/").at(-1) ?? "");
		expect(row).not.toHaveTextContent(/wi:|run:/);
		await idle(router);
	});

	it("filters the rows: ended agents, and the agents with a file", async () => {
		const user = userEvent.setup();
		await withTracker();
		const sessions = await unwrap(commands.sessionsList());
		const router = mountApp("/crew/crew?view=live");
		const atWork = sessions.filter((s) => s.state === "running" || s.state === "gate");
		await waitFor(async () => expect(await rows()).toHaveLength(runsOf(atWork)));
		expect(filter().getByRole("button", { name: "At work" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await user.click(filter().getByRole("button", { name: "Ended" }));
		await waitFor(async () =>
			expect(await rows()).toHaveLength(
				runsOf(sessions.filter((s) => s.state === "done" || s.state === "failed")),
			),
		);
		// The runs with a finding on a file or with a changed file are the rows with a file.
		await user.click(filter().getByRole("button", { name: "Files" }));
		await waitFor(async () => {
			const all = await rows();
			expect(all.length).toBeGreaterThan(0);
			for (const r of all) expect(within(r).getAllByRole("cell")[2]).not.toBeEmptyDOMElement();
		});
		// No session touches a spec: the empty state shows in place of a table with no row.
		await user.click(filter().getByRole("button", { name: "Specs" }));
		expect(await screen.findByText("No sessions")).toBeInTheDocument();
		expect(screen.queryByRole("table", { name: "Agents at work" })).toBeNull();
		await user.click(filter().getByRole("button", { name: "Ended" }));
		expect(await rows()).not.toHaveLength(0);
		await idle(router);
	});

	// spec:app-redesign#REQ-033: an estimate is no run, its agent opens the sheet.
	it("opens the sheet of an estimate from its agent", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().estimateAgent = { hold: true, running: {} };
		const task = mockState().work.sheets["mvp-1"]?.features[0]?.tasks[0]?.id;
		if (!task) throw new Error("no task");
		const turn = unwrap(commands.estimateAgentStart("mvp-1", [task], true)).catch(
			(e: unknown) => e,
		);
		const router = mountApp("/crew/crew?view=live");
		const table = within(await screen.findByRole("table", { name: "Agents at work" }));
		await user.click(await table.findByRole("button", { name: "Estimate" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/plan/estimates"));
		expect(router.state.location.search).toEqual({ sheet: "mvp-1" });
		await unwrap(commands.estimateAgentStop("mvp-1"));
		await turn;
		await idle(router);
	});

	it("switches between Cards and Live in the address", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/crew");
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Live" }));
		await waitFor(() => expect(router.state.location.search).toEqual({ view: "live" }));
		expect(await screen.findByRole("table", { name: "Agents at work" })).toBeInTheDocument();
		// The choice of the view is a group of two buttons, not a second section switch.
		const main = within(screen.getByRole("main"));
		expect(main.getAllByRole("navigation")).toHaveLength(1);
		const view = within(main.getByRole("group", { name: "View" }));
		expect(view.getByRole("button", { name: "Live" })).toHaveAttribute("aria-pressed", "true");
		await user.click(view.getByRole("button", { name: "Cards" }));
		await waitFor(() => expect(router.state.location.search).toEqual({}));
		expect(await screen.findByRole("list", { name: "People" })).toBeInTheDocument();
		await idle(router);
	});

	// The case of the agents map (factory REQ-030): a ref opens its entity in the inspector.
	it("opens the entity of a ref in the inspector", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/crew?view=live");
		const table = within(await screen.findByRole("table", { name: "Agents at work" }));
		const run = await find("ACME-10");
		const path = run.findings.find((f) => f.path)?.path;
		if (!path) throw new Error("no finding with a file");
		const name = path.split("/").at(-1) ?? "";
		const [file] = await table.findAllByRole("button", { name });
		if (!file) throw new Error("no file chip");
		expect(file).toHaveAttribute("data-ask", `doc:${path}`);
		await user.click(file);
		await waitFor(() =>
			expect(screen.getAllByRole("complementary").some((a) => a.textContent?.includes(name))).toBe(
				true,
			),
		);
		await idle(router);
	});
});

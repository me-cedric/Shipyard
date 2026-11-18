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
const filter = () => within(screen.getByRole("group", { name: "Filter" }));
const find = async (key: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.key === key);
	if (!r) throw new Error(key);
	return r;
};

// spec:app-redesign#REQ-017: one row for each agent, in place of the agents map.
describe("Crew / Live", () => {
	it("gives six rows for six agents at work, each with its agent, its feature and what it touches", async () => {
		await withTracker();
		// Seven sessions run in the demo: the step of one run ends, so six agents stay at work.
		for (const step of mockState().factory.runs.find((r) => r.key === "ACME-6")?.steps ?? [])
			step.state = "done";
		const live = (await unwrap(commands.sessionsList())).filter(
			(s) => s.state === "running" || s.state === "gate",
		);
		expect(live).toHaveLength(6);
		const router = mountApp("/crew/crew?view=live");
		await waitFor(async () => expect(await rows()).toHaveLength(6));
		const heads = within(screen.getByRole("main")).getAllByRole("heading", { level: 1 });
		expect(heads).toHaveLength(1);
		expect(heads[0]).toHaveTextContent("Agents at work");
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
		// The ticket, the run and the file of its finding, each a ref with Copy ref.
		const refs = within(touches)
			.getAllByRole("button")
			.map((b) => b.getAttribute("data-ask"));
		expect(refs).toEqual([
			"wi:ACME-10",
			run.reference,
			...run.findings.flatMap((f) => (f.path ? [`doc:${f.path}`] : [])),
		]);
		expect(refs).toHaveLength(3);
		await idle(router);
	});

	it("filters the rows: ended agents, and the agents with a file", async () => {
		const user = userEvent.setup();
		await withTracker();
		const sessions = await unwrap(commands.sessionsList());
		const router = mountApp("/crew/crew?view=live");
		await waitFor(async () => expect(await rows()).toHaveLength(7));
		await user.click(filter().getByRole("button", { name: "Ended" }));
		await waitFor(async () =>
			expect(await rows()).toHaveLength(
				sessions.filter((s) => s.state === "done" || s.state === "failed").length,
			),
		);
		// One run has a finding with a path: its sessions are the rows with a file.
		await user.click(filter().getByRole("button", { name: "Files" }));
		await waitFor(async () =>
			expect(await rows()).toHaveLength(sessions.filter((s) => s.key === "ACME-10").length),
		);
		await user.click(filter().getByRole("button", { name: "Specs" }));
		await waitFor(async () => expect(await rows()).toHaveLength(0));
		await idle(router);
	});

	it("switches between Cards and Live in the address", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/crew");
		const view = within(await screen.findByRole("navigation", { name: "View" }));
		await user.click(view.getByRole("link", { name: "Live" }));
		await waitFor(() => expect(router.state.location.search).toEqual({ view: "live" }));
		expect(await screen.findByRole("table", { name: "Agents at work" })).toBeInTheDocument();
		await user.click(view.getByRole("link", { name: "Cards" }));
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
		const [ticket] = await table.findAllByRole("button", { name: /^wi:ACME-2,/ });
		if (!ticket) throw new Error("no ticket ref");
		await user.click(ticket);
		await waitFor(() =>
			expect(
				screen.getAllByRole("complementary").some((a) => a.textContent?.includes("ACME-2")),
			).toBe(true),
		);
		await idle(router);
	});
});

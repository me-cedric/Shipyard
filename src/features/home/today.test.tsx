import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

const ok = <T,>(data: T) => ({ status: "ok" as const, data });

/** The card of Today: the first article, since a row inside it can be an article too. */
const card = async () => (await screen.findAllByRole("article"))[0] as HTMLElement;

/** Opens the queue row of a thing, so the card shows it. */
async function pick(user: ReturnType<typeof userEvent.setup>, text: RegExp) {
	const queue = within(await screen.findByRole("list", { name: "Needs you" }));
	// The queue shows three things: "N more" shows the rest in place.
	if (!queue.queryByRole("button", { name: text }))
		await user.click(queue.getByRole("button", { name: /^\d+ more$/ }));
	await user.click(queue.getByRole("button", { name: text }));
}

/** The tickets of the person, and the runs on them (the mock has both). */
async function mine() {
	const me = (await unwrap(commands.workContext(0))).me;
	const items = (await unwrap(commands.syncItems({}))).filter((i) => i.member === me);
	const keys = new Set(items.map((i) => i.key));
	const runs = (await unwrap(commands.runsList())).filter((r) => keys.has(r.key));
	return { items, keys, runs };
}
const live = (r: { lane: string }) => r.lane === "working" || r.lane === "needs_you";

describe("Home / Today", () => {
	it("opens Home on Today, with Needs you, News and Activity as its tabs", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home");
		await waitFor(() => expect(router.state.location.pathname).toBe("/today/today"));
		const tabs = within(await screen.findByRole("navigation", { name: "Tabs" }));
		expect(tabs.getAllByRole("link").map((l) => l.textContent)).toEqual([
			"Needs you",
			"News",
			"Activity",
		]);
		expect(await screen.findByRole("heading", { level: 1, name: /need you$/ })).toBeInTheDocument();
	});

	it.each([
		["inbox", "/today/today"],
		["my-work", "/today/today"],
		["activity", "/today/activity"],
	])("opens Today from the old address /home/%s", async (tab, to) => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp(`/home/${tab}`);
		await waitFor(() => expect(router.state.location.pathname).toBe(to));
	});

	it("gives the title the count, shows the question on the card with its answers and the two others in the queue (spec:app-redesign#REQ-007)", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const [question] = await unwrap(commands.questionsList());
		const [approval] = await unwrap(commands.approvalsList());
		const plan = (await unwrap(commands.runsList())).find((r) => r.state === "PlanReview");
		if (!(question && approval && plan)) throw new Error("the mock lacks a thing");
		// The question takes a free answer: the card shows the field.
		question.question.free_text = true;
		vi.spyOn(commands, "questionsList").mockResolvedValue(ok([question]));
		vi.spyOn(commands, "approvalsList").mockResolvedValue(ok([approval]));
		vi.spyOn(commands, "messagesList").mockResolvedValue(ok([]));
		vi.spyOn(commands, "prReviewWaiting").mockResolvedValue(ok([]));
		vi.spyOn(commands, "runsList").mockResolvedValue(ok([plan]));
		mountApp("/today/today");
		expect(
			await screen.findByRole("heading", { level: 1, name: "3 things need you" }),
		).toBeInTheDocument();
		const on = within(await card());
		expect(on.getByText("1 of 3")).toBeInTheDocument();
		expect(on.getByText(question.question.question)).toBeInTheDocument();
		// One large button for each answer, then the field, Later and Send.
		expect(
			within(on.getByRole("group", { name: question.question.question })).getAllByRole("button"),
		).toHaveLength(question.question.options.length);
		expect(on.getByRole("textbox", { name: "Another answer" })).toBeInTheDocument();
		expect(on.getByRole("button", { name: "Later" })).toBeInTheDocument();
		expect(on.getByRole("button", { name: "Send" })).toBeEnabled();
		const queue = within(screen.getByRole("list", { name: "Needs you" }));
		expect(queue.getAllByRole("listitem")).toHaveLength(2);
		expect(queue.queryByText(question.question.question)).toBeNull();
		vi.restoreAllMocks();
	});

	it("moves the card to the end of the queue with Later, and a click on the queue makes a thing the card", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const [question] = await unwrap(commands.questionsList());
		const [approval] = await unwrap(commands.approvalsList());
		if (!(question && approval)) throw new Error("the mock lacks a thing");
		vi.spyOn(commands, "questionsList").mockResolvedValue(ok([question]));
		vi.spyOn(commands, "approvalsList").mockResolvedValue(ok([approval]));
		vi.spyOn(commands, "messagesList").mockResolvedValue(ok([]));
		vi.spyOn(commands, "prReviewWaiting").mockResolvedValue(ok([]));
		vi.spyOn(commands, "runsList").mockResolvedValue(ok([]));
		mountApp("/today/today");
		expect(await within(await card()).findByText("1 of 2")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Later" }));
		const on = within(await card());
		expect(
			await on.findByRole("heading", { level: 2, name: "Post a comment on ACME-1" }),
		).toBeInTheDocument();
		expect(on.getByText("1 of 2")).toBeInTheDocument();
		await user.click(
			within(screen.getByRole("list", { name: "Needs you" })).getByRole("button", {
				name: new RegExp(question.question.question),
			}),
		);
		expect(await within(await card()).findByText("2 of 2")).toBeVisible();
		vi.restoreAllMocks();
	});

	it("gives the card of a stopped run its main action in one click (REQ-014)", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		const [run] = (await mine()).runs;
		if (!run) throw new Error("the person has no run");
		const rec = mockState().factory.runs.find((r) => r.id === run.id);
		if (!rec) throw new Error("no record");
		// The run is paused by a person: its main action is Resume.
		rec.state = "Paused";
		const resume = vi.spyOn(commands, "runResume");
		mountApp("/today/today");
		await user.click(await screen.findByRole("button", { name: `Resume ${run.key}` }));
		await waitFor(() => expect(resume).toHaveBeenCalledWith(run.id, 0, 0, null));
		vi.restoreAllMocks();
	});

	it("counts the approvals of one run once in the title (REQ-013)", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const approvals = await unwrap(commands.approvalsList());
		const runs = new Set(approvals.map((a) => a.run));
		expect(approvals.length).toBeGreaterThan(runs.size);
		const [question] = await unwrap(commands.questionsList());
		if (!question) throw new Error("the mock lacks a question");
		vi.spyOn(commands, "questionsList").mockResolvedValue(ok([]));
		vi.spyOn(commands, "messagesList").mockResolvedValue(ok([]));
		vi.spyOn(commands, "prReviewWaiting").mockResolvedValue(ok([]));
		vi.spyOn(commands, "runsList").mockResolvedValue(ok([]));
		mountApp("/today/today");
		expect(
			await screen.findByRole("heading", { level: 1, name: `${runs.size} things need you` }),
		).toBeInTheDocument();
		vi.restoreAllMocks();
	});

	it("moves the focus to the heading of the new card only after a pick, not on the first load", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/today");
		const first = within(await card()).getByRole("heading", { level: 2 });
		expect(first).not.toHaveFocus();
		await pick(user, /Post a comment on ACME-1/);
		const next = within(await card()).getByRole("heading", { level: 2 });
		await waitFor(() => expect(next).toHaveFocus());
	});

	it("shows an approval on the card from the queue, and one click sends it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/today");
		await pick(user, /Post a comment on ACME-1/);
		const before = (await unwrap(commands.approvalsList())).length;
		const on = within(await card());
		expect(
			await on.findByRole("heading", { level: 2, name: "Post a comment on ACME-1" }),
		).toBeVisible();
		await user.click(on.getByRole("button", { name: "Approve" }));
		await waitFor(async () =>
			expect((await unwrap(commands.approvalsList())).length).toBe(before - 1),
		);
	});

	it("draws the body of an approval as Markdown, not as raw text", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const approval = mockState().factory.approvals.find((a) => a.key === "ACME-1");
		if (approval) approval.detail = "## Add export endpoint\n\nUse `GET /export`.";
		mountApp("/home/today");
		await pick(user, /Post a comment on ACME-1/);
		await user.click(await screen.findByRole("button", { name: "Each step" }));
		const bar = within(await screen.findByRole("region", { name: "Post a comment on ACME-1" }));
		expect(await bar.findByRole("heading", { name: "Add export endpoint" })).toBeInTheDocument();
		expect(bar.getByText("GET /export").tagName).toBe("CODE");
		expect(bar.queryByText(/##|`/)).toBeNull();
	});

	it("counts my tickets by state in My work, and a count opens its rows with the status and Start run", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		const { items } = await mine();
		mountApp("/today/panels");
		const week = Date.now() - 7 * 24 * 3600 * 1000;
		const fresh = (i: { category: string; updated: string }) =>
			i.category !== "done" || Number.isNaN(Date.parse(i.updated)) || Date.parse(i.updated) >= week;
		const work = within(await screen.findByRole("region", { name: "My work" }));
		for (const [category, name] of [
			["in-progress", "In progress"],
			["todo", "To do"],
			["done", "Done in 7 days"],
		] as const) {
			const rows = items.filter((i) => i.category === category && fresh(i));
			await waitFor(() =>
				expect(
					work.getByRole("button", { name: new RegExp(`^${name}\\s*${rows.length}$`) }),
				).toBeInTheDocument(),
			);
		}
		const first = items.find((i) => i.category !== "done") ?? items[0];
		if (!first) throw new Error("no ticket of the person");
		const names = { "in-progress": "In progress", todo: "To do", done: "Done in 7 days" };
		await user.click(
			work.getByRole("button", {
				name: new RegExp(`^${names[first.category as keyof typeof names]}\\s*\\d+$`),
			}),
		);
		const row = await screen.findByRole("group", { name: first.key });
		expect(row).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: `Status ${first.key}` })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: `Start run ${first.key}` })).toBeInTheDocument();
	});

	it("shows the next three things in the queue, and N more shows the rest in place", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/today/today");
		const queue = within(await screen.findByRole("list", { name: "Needs you" }));
		const more = await queue.findByRole("button", { name: /^\d+ more$/ });
		expect(queue.getAllByRole("listitem")).toHaveLength(4);
		const rest = Number(more.textContent?.match(/^\d+/)?.[0]);
		await user.click(more);
		expect(queue.queryByRole("button", { name: /^\d+ more$/ })).toBeNull();
		expect(queue.getAllByRole("listitem")).toHaveLength(3 + rest);
	});

	it("shows the plan cards of a product owner before Working now, the alert in one row", async () => {
		await withTracker();
		await importAll();
		await unwrap(commands.prefsSet({ role: "po" }));
		mountApp("/today/today");
		const ends = await screen.findByRole("heading", { name: /^MVP 1 ends / });
		const working = await screen.findByRole("region", { name: /^Working now/ });
		expect(ends.compareDocumentPosition(working) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(
			await screen.findByRole("heading", { name: "3 people have too much work" }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Show" })).toHaveAttribute("href", "/plan/people");
	});

	it("shows no stat tiles: the spend of today sits in the foot of Working now", async () => {
		await withTracker();
		await importAll();
		mountApp("/home/today");
		expect(screen.queryByText("Active runs")).toBeNull();
		const agents = within(await screen.findByRole("region", { name: /^Working now/ }));
		expect(agents.getByRole("link", { name: "Open the flow" })).toHaveAttribute(
			"href",
			"/flow/flow",
		);
		expect(agents.getByText("Spend today")).toBeInTheDocument();
		expect(agents.getByText(/^\$/)).toBeInTheDocument();
	});

	it("shows the spend of today and an empty line when no run is live", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		vi.spyOn(commands, "runsList").mockResolvedValue(ok([]));
		mountApp("/home/today");
		const agents = within(await screen.findByRole("region", { name: "Working now" }));
		expect(agents.getByText("No active run")).toBeInTheDocument();
		expect(agents.getByText("Spend today")).toBeInTheDocument();
		vi.restoreAllMocks();
	});

	it("shows one row for each live run on my tickets, with the stage of its feature", async () => {
		await withTracker();
		await importAll();
		const { keys } = await mine();
		const runs = (await unwrap(commands.runsList())).filter(live).filter((r) => keys.has(r.key));
		expect(runs.length).toBeGreaterThan(0);
		mountApp("/home/today");
		const agents = within(await screen.findByRole("region", { name: /^Working now/ }));
		for (const r of runs)
			expect(await agents.findByRole("link", { name: r.title })).toBeInTheDocument();
		// The stage is a bar of five segments with a spoken text.
		expect((await agents.findAllByRole("img", { name: /^Stages: / })).length).toBe(runs.length);
	});

	it("shows the setup card with the next step, and Continue opens the full list in Setup", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/today");
		const setup = within(await screen.findByRole("region", { name: "Get started" }));
		expect(await setup.findByText(/^Setup, \d+ of 11$/)).toBeInTheDocument();
		expect(setup.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/setup/start");
		// One card, not the list.
		expect(screen.queryByRole("list", { name: "Get started" })).toBeNull();
		expect(screen.getByRole("link", { name: "Panels for my role" })).toHaveAttribute(
			"href",
			"/today/panels",
		);
	});

	it("shows the live runs on my tickets with Stop, and no run on another ticket", async () => {
		await withTracker();
		await importAll();
		const { keys } = await mine();
		const runs = (await unwrap(commands.runsList())).filter(live);
		mountApp("/home/today");
		const agents = within(await screen.findByRole("region", { name: /^Working now/ }));
		for (const r of runs.filter((x) => keys.has(x.key)))
			expect(await agents.findByRole("button", { name: `Stop ${r.key}` })).toBeInTheDocument();
		for (const r of runs.filter((x) => !keys.has(x.key)))
			expect(agents.queryByRole("button", { name: `Stop ${r.key}` })).toBeNull();
	});

	it("keeps a focus target around the sections for a row that leaves last", async () => {
		await withTracker();
		await importAll();
		mountApp("/home/today");
		const agents = await screen.findByRole("region", { name: /^Working now/ });
		const root = agents.closest("[tabindex='-1']");
		expect(root).not.toBeNull();
		expect(root).toContainElement(await card());
	});

	it("turns Stop off for a role without the right to start runs", async () => {
		await withTracker();
		await importAll();
		const { keys } = await mine();
		const runs = (await unwrap(commands.runsList())).filter(live).filter((r) => keys.has(r.key));
		expect(runs.length).toBeGreaterThan(0);
		mockState().person = {
			member: null,
			found: "unknown",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		mountApp("/home/today");
		const agents = await screen.findByRole("region", { name: /^Working now/ });
		expect(
			await within(agents).findByRole("button", { name: `Stop ${runs[0]?.key}` }),
		).toBeDisabled();
	});

	it("shows only the events of my runs that are newer than the last visit, newest first", async () => {
		await withTracker();
		await importAll();
		const { runs } = await mine();
		const events = (
			await Promise.all(runs.map((r) => unwrap(commands.runLogPage(r.id, 0, 50))))
		).flatMap((p) => p.events.flatMap((e) => (e.ts === null ? [] : [e.ts])));
		expect(events.length).toBeGreaterThan(1);
		const sorted = [...events].sort((a, b) => a - b);
		// The pref holds whole seconds.
		const seen = Math.ceil(((sorted[0] ?? 0) + 1) / 1000);
		const newer = events.filter((ts) => ts > seen * 1000).length;
		mockState().prefs.todaySeen = seen;
		mountApp("/today/panels");
		const away = within(await screen.findByRole("region", { name: "Since you were away" }));
		await waitFor(() => expect(away.getAllByRole("listitem")).toHaveLength(Math.min(20, newer)));
	});

	it("moves the last visit to now, so a second visit shows no old event", async () => {
		await withTracker();
		await importAll();
		mockState().prefs.todaySeen = 1;
		const first = mountApp("/today/panels");
		await screen.findByRole("heading", { name: /^Since you were away/ });
		await waitFor(() => expect(mockState().prefs.todaySeen).toBeGreaterThan(1_000_000));
		first.navigate({ to: "/home/projects" });
		const { cleanup } = await import("@testing-library/react");
		cleanup();
		mountApp("/today/panels");
		await screen.findByRole("heading", { name: "My work" });
		expect(screen.queryByRole("heading", { name: /^Since you were away/ })).toBeNull();
	});

	it("shows one empty state with Open the backlog when nothing is there", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		vi.spyOn(commands, "questionsList").mockResolvedValue(ok([]));
		vi.spyOn(commands, "approvalsList").mockResolvedValue(ok([]));
		vi.spyOn(commands, "messagesList").mockResolvedValue(ok([]));
		vi.spyOn(commands, "prReviewWaiting").mockResolvedValue(ok([]));
		vi.spyOn(commands, "runsList").mockResolvedValue(ok([]));
		// The weekend: no time reminder.
		vi.setSystemTime(new Date(2026, 9, 31, 10));
		const router = mountApp("/home/today");
		expect(await screen.findByText("Nothing needs you")).toBeInTheDocument();
		expect(screen.queryByRole("article")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Open the backlog" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/list"));
		vi.restoreAllMocks();
		vi.setSystemTime(new Date("2026-10-28T10:00:00"));
	});

	it("shows every label in French", async () => {
		await unwrap(commands.prefsSet({ lang: "fr" }));
		await withTracker();
		await importAll();
		mountApp("/home/today");
		expect(await screen.findByRole("heading", { level: 1, name: /vous attend/ })).toBeVisible();
		expect(await screen.findByRole("list", { name: "À traiter" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Nouvelles" })).toBeInTheDocument();
		expect(screen.queryByText("Needs you")).toBeNull();
	});
});

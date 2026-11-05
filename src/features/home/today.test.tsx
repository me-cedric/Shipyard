import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

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
	it("opens Home on Today, with Today and Projects as its two tabs", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home");
		await waitFor(() => expect(router.state.location.pathname).toBe("/home/today"));
		const tabs = within(await screen.findByRole("navigation", { name: "Tabs" }));
		expect(tabs.getAllByRole("link").map((l) => l.textContent)).toEqual(["Today", "Projects"]);
		expect(await screen.findByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
	});

	it.each(["inbox", "my-work", "activity"])(
		"opens Today from the old address /home/%s",
		async (tab) => {
			await unwrap(commands.projectsOpen("/mock/alpha", false));
			const router = mountApp(`/home/${tab}`);
			await waitFor(() => expect(router.state.location.pathname).toBe("/home/today"));
		},
	);

	it("shows what waits in Needs you, and one click sends an approval", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/today");
		const section = within(await screen.findByRole("region", { name: "Needs you" }));
		const before = (await unwrap(commands.approvalsList())).length;
		const bar = section.getByRole("region", { name: "Post a comment on ACME-1" });
		await user.click(within(bar).getByRole("button", { name: "Approve" }));
		await waitFor(async () =>
			expect((await unwrap(commands.approvalsList())).length).toBe(before - 1),
		);
	});

	it("groups my tickets by state, with the status and Start run in each row", async () => {
		await withTracker();
		await importAll();
		const { items } = await mine();
		mountApp("/home/today");
		const week = Date.now() - 7 * 24 * 3600 * 1000;
		const fresh = (i: { category: string; updated: string }) =>
			i.category !== "done" || Number.isNaN(Date.parse(i.updated)) || Date.parse(i.updated) >= week;
		for (const [category, name] of [
			["in-progress", "In progress"],
			["todo", "To do"],
			["done", "Done in the last 7 days"],
		] as const) {
			const rows = items.filter((i) => i.category === category && fresh(i));
			if (rows.length)
				expect(
					await screen.findByRole("heading", { name: `${name} (${rows.length})` }),
				).toBeInTheDocument();
			else expect(screen.queryByRole("heading", { name: new RegExp(`^${name}`) })).toBeNull();
		}
		const first = items.find((i) => i.category !== "done") ?? items[0];
		if (!first) throw new Error("no ticket of the person");
		const row = await screen.findByRole("group", { name: first.key });
		expect(row).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: `Status ${first.key}` })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: `Start run ${first.key}` })).toBeInTheDocument();
	});

	it("shows the live runs on my tickets with Stop, and no run on another ticket", async () => {
		await withTracker();
		await importAll();
		const { keys } = await mine();
		const runs = (await unwrap(commands.runsList())).filter(live);
		mountApp("/home/today");
		await screen.findByRole("region", { name: "Needs you" });
		for (const r of runs) {
			const stop = screen.queryByRole("button", { name: `Stop ${r.key}` });
			if (keys.has(r.key)) expect(stop).toBeInTheDocument();
			else expect(stop).toBeNull();
		}
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
		mountApp("/home/today");
		expect(
			await screen.findByRole("heading", { name: `Since you were away (${Math.min(20, newer)})` }),
		).toBeInTheDocument();
	});

	it("moves the last visit to now, so a second visit shows no old event", async () => {
		await withTracker();
		await importAll();
		mockState().prefs.todaySeen = 1;
		const first = mountApp("/home/today");
		await screen.findByRole("heading", { name: /^Since you were away/ });
		await waitFor(() => expect(mockState().prefs.todaySeen).toBeGreaterThan(1_000_000));
		first.navigate({ to: "/home/projects" });
		const { cleanup } = await import("@testing-library/react");
		cleanup();
		mountApp("/home/today");
		await screen.findByRole("heading", { level: 1, name: "Today" });
		expect(screen.queryByRole("heading", { name: /^Since you were away/ })).toBeNull();
	});

	it("shows one empty state with Open the backlog when nothing is there", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const ok = <T,>(data: T) => ({ status: "ok" as const, data });
		vi.spyOn(commands, "questionsList").mockResolvedValue(ok([]));
		vi.spyOn(commands, "approvalsList").mockResolvedValue(ok([]));
		vi.spyOn(commands, "messagesList").mockResolvedValue(ok([]));
		vi.spyOn(commands, "prReviewWaiting").mockResolvedValue(ok([]));
		vi.spyOn(commands, "runsList").mockResolvedValue(ok([]));
		const router = mountApp("/home/today");
		expect(await screen.findByText("Nothing needs you")).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "Needs you" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Open the backlog" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/work/backlog"));
		vi.restoreAllMocks();
	});

	it("shows every label in French", async () => {
		await unwrap(commands.prefsSet({ lang: "fr" }));
		await withTracker();
		await importAll();
		mountApp("/home/today");
		expect(
			await screen.findByRole("heading", { level: 1, name: "Aujourd'hui" }),
		).toBeInTheDocument();
		expect(await screen.findByRole("region", { name: "À traiter" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Projets" })).toBeInTheDocument();
		expect(screen.queryByText("Needs you")).toBeNull();
	});
});

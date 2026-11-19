import { cleanup, createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";
import { mountKnowledge } from "./harness";

const FILE = "docs/dashboards/team.yaml";
const tile = async (name: string) => within(await screen.findByRole("region", { name }));

describe("Knowledge / Dashboards", () => {
	it("shows a dashboard as a grid of tiles with a count, each drawn from the data of the project", async () => {
		await mountKnowledge("dashboards");
		expect(await screen.findByRole("list", { name: "Tiles (4)" })).toBeInTheDocument();
		const work = await unwrap(commands.dashboardTile("questions"));
		const bars = (await tile("Questions")).getByRole("list", { name: /chart/ });
		await waitFor(() =>
			expect(within(bars).getAllByRole("listitem")).toHaveLength(work.rows.length),
		);
	});

	it("gives the numbers behind a chart with Show as table", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		const work = await unwrap(commands.dashboardTile("questions"));
		const t = await tile("Questions");
		await user.click(await t.findByRole("button", { name: "Show as table" }));
		const rows = within(await t.findByRole("table")).getAllByRole("row");
		expect(rows).toHaveLength(work.rows.length + 1);
	});

	it("keeps a tile whose source is off visible, greyed, with the name of its source", async () => {
		await mountKnowledge("dashboards");
		const quality = await screen.findByRole("region", { name: "Quality" });
		await waitFor(() => expect(quality).toHaveAttribute("aria-disabled", "true"));
		expect(quality).toHaveTextContent("Source off: quality");
	});

	it("names the issue tracker on a tile whose issue tracker is not linked", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(
			commands.dashboardSaveOne(
				"team",
				{ title: "Team", tiles: [{ id: "a", kind: "tracker-assignee", x: 0, y: 0, w: 4, h: 3 }] },
				null,
			),
		);
		mountApp("/knowledge/dashboards");
		const items = await screen.findByRole("region", { name: "Items by assignee" });
		await waitFor(() => expect(items).toHaveTextContent("Source off: issue tracker"));
	});

	it("saves a moved tile to the file", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		await user.click(await (await tile("Work items")).findByRole("button", { name: "Move right" }));
		await waitFor(async () =>
			expect((await unwrap(commands.dashboardGetOne("team"))).value.tiles[0]?.x).toBe(1),
		);
		expect(mockState().knowledge.files[FILE]?.text).toContain("x: 1");
	});

	it("moves a tile when it is dragged to another column", async () => {
		await mountKnowledge("dashboards");
		const item = (await screen.findByRole("region", { name: "Work items" })).closest("li");
		const grid = item?.parentElement;
		if (!(item && grid)) throw new Error("grid");
		// 12 columns of 100 px.
		grid.getBoundingClientRect = () => ({ left: 0, width: 1200 }) as DOMRect;
		const dataTransfer = { setData() {}, getData: () => "", effectAllowed: "" };
		// jsdom has no DragEvent, so the pointer column goes on the event by hand.
		const at = (target: Element, event: Event, clientX: number) => {
			Object.defineProperty(event, "clientX", { value: clientX });
			fireEvent(target, event);
		};
		at(item, createEvent.dragStart(item, { dataTransfer }), 50);
		at(grid, createEvent.drop(grid, { dataTransfer }), 250);
		await waitFor(async () =>
			expect((await unwrap(commands.dashboardGetOne("team"))).value.tiles[0]?.x).toBe(2),
		);
	});

	it("shows a dashboard that a newer version wrote and offers no move", async () => {
		const files = () => mockState().knowledge.files;
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const old = files()[FILE]?.text ?? "";
		files()[FILE] = { text: old.replace("version: 1", "version: 2"), stamp: "7" };
		await mountKnowledge("dashboards");
		expect(await screen.findByText("Read only")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Move right" })).toBeNull();
	});

	it("shows the states of the Runs tile as plain words, not as codes", async () => {
		await mountKnowledge("dashboards");
		const runs = await tile("Runs");
		expect(await runs.findByText("Pull request open")).toBeInTheDocument();
		expect(runs.queryByText("PROpen")).toBeNull();
	});

	it("pins a tile, and the pinned tile shows at the top of Dashboards and not on Home", async () => {
		const user = userEvent.setup();
		const router = await mountKnowledge("dashboards");
		await user.click(await (await tile("Runs")).findByRole("button", { name: "Pin to Today" }));
		expect(await screen.findByRole("heading", { name: "Pinned (1)" })).toBeInTheDocument();
		await router.navigate({ to: "/home/today" });
		await screen.findByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ });
		expect(screen.queryByRole("heading", { name: /^Pinned/ })).toBeNull();
		await router.navigate({ to: "/knowledge/dashboards" });
		const pinned = within(await screen.findByRole("region", { name: "Pinned" }));
		await user.click(await pinned.findByRole("button", { name: "Unpin from Today" }));
		await waitFor(() => expect(screen.queryByRole("heading", { name: /^Pinned/ })).toBeNull());
	});

	it("adds a tile, renames and widens it in its settings, and removes it", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		await user.click(await screen.findByRole("button", { name: "Add tile" }));
		await user.click(await screen.findByRole("menuitem", { name: "Specs" }));
		const saved = async () => (await unwrap(commands.dashboardGetOne("team"))).value.tiles;
		await waitFor(async () => expect((await saved()).map((x) => x.id)).toContain("specs"));
		await user.click(await screen.findByRole("button", { name: "Tile settings Specs" }));
		const panel = within(await screen.findByRole("complementary", { name: "Tile settings" }));
		await user.type(panel.getByRole("textbox", { name: "Name" }), "Spec health");
		await user.click(panel.getByRole("combobox", { name: "Width" }));
		await user.click(await screen.findByRole("option", { name: "6" }));
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(async () =>
			expect((await saved()).find((x) => x.id === "specs")).toMatchObject({
				title: "Spec health",
				w: 6,
			}),
		);
		await user.click(await screen.findByRole("button", { name: "Remove tile Spec health" }));
		await waitFor(async () => expect((await saved()).some((x) => x.id === "specs")).toBe(false));
	});

	it("creates a dashboard from a template", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		await user.click(await screen.findByRole("button", { name: "New dashboard" }));
		await user.click(await screen.findByRole("menuitem", { name: "Project manager" }));
		await waitFor(async () =>
			expect((await unwrap(commands.dashboardGetOne("pm"))).value.tiles.map((x) => x.kind)).toEqual(
				["tracker-open", "tracker-status", "tracker-assignee", "estimates", "questions", "work"],
			),
		);
		expect(await screen.findByRole("list", { name: "Tiles (6)" })).toBeInTheDocument();
	});

	it("counts the tracker items by assignee and follows the person filter", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		await unwrap(
			commands.dashboardSaveOne(
				"team",
				{ title: "Team", tiles: [{ id: "a", kind: "tracker-assignee", x: 0, y: 0, w: 4, h: 3 }] },
				null,
			),
		);
		mountApp("/knowledge/dashboards");
		const items = await unwrap(commands.syncItems({}));
		const open = items.filter((i) => i.category !== "done");
		const t = await tile("Items by assignee");
		await user.click(await t.findByRole("button", { name: "Show as table" }));
		const total = async () =>
			within(await t.findByRole("table"))
				.getAllByRole("row")
				.slice(1)
				.reduce((n, r) => n + Number(r.lastElementChild?.textContent), 0);
		await waitFor(async () => expect(await total()).toBe(open.length));
		const member = open.find((i) => i.member)?.member as string;
		const team = await unwrap(commands.workTeam());
		const name = team.team.members.find((m) => m.handle === member)?.name as string;
		await user.click(screen.getByRole("combobox", { name: "Person" }));
		await user.click(await screen.findByRole("option", { name }));
		await waitFor(async () =>
			expect(await total()).toBe(open.filter((i) => i.member === member).length),
		);
	});

	it("starts a project that has no dashboard with one primary action", async () => {
		const user = userEvent.setup();
		delete mockState().knowledge.files[FILE];
		await mountKnowledge("dashboards");
		await user.click(await screen.findByRole("button", { name: "Dashboards" }));
		expect(await screen.findByRole("list", { name: "Tiles (10)" })).toBeInTheDocument();
		expect(mockState().knowledge.files[FILE]).toBeDefined();
	});
});

describe("Dashboards / Build a tile for me (spec:app-redesign#REQ-032, #REQ-033)", () => {
	const saved = async () => (await unwrap(commands.dashboardGetOne("team"))).value.tiles;
	/** Opens the form, says what the tile must show and starts the build. */
	const build = async (user: ReturnType<typeof userEvent.setup>, words: string) => {
		await user.click(await screen.findByRole("button", { name: "Build a tile for me" }));
		await user.type(screen.getByRole("textbox", { name: "What the tile must show" }), words);
		await user.click(screen.getByRole("button", { name: "Build" }));
	};
	const proposed = async () =>
		within(await screen.findByRole("region", { name: "Proposed tile" }, { timeout: 4000 }));

	it("shows a proposed tile with Accept and Discard, and the dashboard does not change", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		const before = mockState().knowledge.files[FILE]?.text;
		await build(user, "Runs by state");
		const p = await proposed();
		expect(p.getByRole("region", { name: "Runs by state" })).toBeInTheDocument();
		expect(p.getByRole("button", { name: "Accept" })).toBeInTheDocument();
		expect(p.getByRole("button", { name: "Discard" })).toBeInTheDocument();
		expect(mockState().knowledge.files[FILE]?.text).toBe(before);
		expect(screen.getByRole("list", { name: "Tiles (4)" })).toBeInTheDocument();
	});

	it("puts the tile on the dashboard when the person accepts it", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		await build(user, "Specs health");
		await user.click((await proposed()).getByRole("button", { name: "Accept" }));
		await waitFor(async () =>
			expect((await saved()).at(-1)).toMatchObject({ kind: "specs", title: "Specs health", w: 4 }),
		);
		expect(await screen.findByRole("list", { name: "Tiles (5)" })).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "Proposed tile" })).toBeNull();
	});

	it("drops the proposed tile on Discard", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		await build(user, "Specs health");
		await user.click((await proposed()).getByRole("button", { name: "Discard" }));
		expect(screen.queryByRole("region", { name: "Proposed tile" })).toBeNull();
		expect(await saved()).toHaveLength(4);
		expect(screen.getByRole("textbox", { name: "What the tile must show" })).toBeInTheDocument();
	});

	it("is a session while it runs, and Stop ends it with no tile and no error", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		await build(user, "Runs by state");
		expect(await screen.findByText("The agent builds the tile")).toHaveRole("status");
		const rows = await unwrap(commands.sessionsList());
		expect(rows[0]).toMatchObject({ key: "team", step: "tile", state: "running" });
		await user.click(screen.getByRole("button", { name: "Stop" }));
		expect(
			await screen.findByRole("textbox", { name: "What the tile must show" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "Proposed tile" })).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
		expect(await unwrap(commands.sessionsList())).toEqual(
			expect.not.arrayContaining([expect.objectContaining({ step: "tile" })]),
		);
		expect(await saved()).toHaveLength(4);
	});

	it("sends the budget that the person set, and says when the budget is spent", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		await user.click(await screen.findByRole("button", { name: "Build a tile for me" }));
		const budget = within(screen.getByRole("group", { name: "Budget (USD)" }));
		expect(budget.getByRole("status")).toHaveTextContent("$2");
		await user.click(budget.getByRole("button", { name: "More budget" }));
		expect(budget.getByRole("status")).toHaveTextContent("$3");
		const sent = vi.spyOn(commands, "dashboardTileBuild");
		await user.type(screen.getByRole("textbox", { name: "What the tile must show" }), "spent");
		await user.click(screen.getByRole("button", { name: "Build" }));
		// The shared budget is spent: more budget for the tile changes nothing, so the page does not say it.
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"The budget is spent. The review waits for the next budget.",
		);
		expect(sent).toHaveBeenCalledWith("team", "spent", 3);
		// The budget of the tile is spent: the page says to add budget.
		sent.mockResolvedValueOnce({
			status: "error",
			error: "the budget of $3.00 is spent: the tile waits for a larger budget",
		} as never);
		await user.click(screen.getByRole("button", { name: "Build" }));
		await waitFor(() =>
			expect(screen.getByRole("alert")).toHaveTextContent(
				"The budget is spent. Add budget, then build again.",
			),
		);
		sent.mockRestore();
	});

	it("keeps the proposed tile when the file changed on disk, and accepts it on the next click", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		await build(user, "Specs health");
		const p = await proposed();
		// The file changes behind the page while the proposal waits.
		const d = await unwrap(commands.dashboardGetOne("team"));
		await unwrap(commands.dashboardSaveOne("team", d.value, d.stamp));
		await user.click(p.getByRole("button", { name: "Accept" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("The file changed on disk");
		expect(await saved()).toHaveLength(4);
		await user.click((await proposed()).getByRole("button", { name: "Accept" }));
		expect(await screen.findByRole("list", { name: "Tiles (5)" })).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "Proposed tile" })).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("keeps the form open while a build runs, and stops each build of the dashboard", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		// A build of the same dashboard that this page did not start.
		const other = unwrap(commands.dashboardTileBuild("team", "Runs", 1)).catch((e) => e);
		await build(user, "Runs by state");
		expect(await screen.findByText("The agent builds the tile")).toHaveRole("status");
		expect(screen.getByRole("button", { name: "Build a tile for me" })).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Stop" }));
		expect(await other).toMatchObject({ code: "stopped" });
		expect(await unwrap(commands.sessionsList())).toEqual(
			expect.not.arrayContaining([expect.objectContaining({ step: "tile" })]),
		);
	});

	it("stops the build when the person leaves the page", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		await build(user, "Runs by state");
		expect(await screen.findByText("The agent builds the tile")).toHaveRole("status");
		const stop = vi.spyOn(commands, "prReviewStop");
		cleanup();
		await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
		stop.mockRestore();
	});

	it("has no build button on a read-only dashboard", async () => {
		const files = () => mockState().knowledge.files;
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const old = files()[FILE]?.text ?? "";
		files()[FILE] = { text: old.replace("version: 1", "version: 2"), stamp: "7" };
		await mountKnowledge("dashboards");
		expect(await screen.findByText("Read only")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Build a tile for me" })).toBeNull();
	});

	it("turns the build button off for a person without the right knowledge.edit", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		mountApp("/knowledge/dashboards");
		const button = await screen.findByRole("button", { name: "Build a tile for me" });
		expect(button).toBeDisabled();
		expect(button).toHaveAccessibleDescription(
			"Needs the right knowledge.edit (your role: Viewer)",
		);
	});
});

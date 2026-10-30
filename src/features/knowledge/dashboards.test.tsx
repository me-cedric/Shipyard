import { screen, waitFor, within } from "@testing-library/react";
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

	it("saves a moved tile to the file", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards");
		await user.click(await (await tile("Work items")).findByRole("button", { name: "Move right" }));
		await waitFor(async () =>
			expect((await unwrap(commands.dashboardGetOne("team"))).value.tiles[0]?.x).toBe(1),
		);
		expect(mockState().knowledge.files[FILE]?.text).toContain("x: 1");
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

	it("pins a tile to Home, where My work shows it", async () => {
		const user = userEvent.setup();
		const router = await mountKnowledge("dashboards");
		await user.click(await (await tile("Runs")).findByRole("button", { name: "Pin to Home" }));
		expect(
			await (await tile("Runs")).findByRole("button", { name: "Unpin from Home" }),
		).toHaveAttribute("aria-pressed", "true");
		await router.navigate({ to: "/home/my-work" });
		expect(await screen.findByRole("heading", { name: "Pinned (1)" })).toBeInTheDocument();
		await user.click(await (await tile("Runs")).findByRole("button", { name: "Unpin from Home" }));
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

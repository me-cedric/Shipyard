import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
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

	it("starts a project that has no dashboard with one primary action", async () => {
		const user = userEvent.setup();
		delete mockState().knowledge.files[FILE];
		await mountKnowledge("dashboards");
		await user.click(await screen.findByRole("button", { name: "Dashboards" }));
		expect(await screen.findByRole("list", { name: "Tiles (7)" })).toBeInTheDocument();
		expect(mockState().knowledge.files[FILE]).toBeDefined();
	});
});

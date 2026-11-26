import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { CHARTS, type Chart, defaultChart, TileChart } from "@/ui/organisms/tile-chart";
import { mountKnowledge } from "./harness";

const names = en.library.fn.charts;
const tile = async (name: string) => within(await screen.findByRole("region", { name }));
const rows = [
	["Done", "6"],
	["Open", "3"],
	["Failed", "1"],
];
const draw = (chart: Chart) =>
	render(
		<Providers>
			<TileChart chart={chart} title="Runs" rows={rows} names={names} barsName="Runs, chart" />
		</Providers>,
	);

// spec:library-functions#REQ-008
describe("Chart kinds of dashboard tiles", () => {
	it("draws each chart kind from the same rows", async () => {
		draw("number");
		expect(await screen.findByRole("img", { name: "Runs, 10" })).toHaveTextContent("10");
		for (const chart of CHARTS.filter((c) => c !== "number")) {
			const view = draw(chart);
			await waitFor(() =>
				expect(view.container.querySelector(`[data-chart="${chart}"]`), chart).not.toBeNull(),
			);
			view.unmount();
		}
		draw("health");
		expect(await screen.findByRole("img", { name: "Failed" })).toHaveAttribute(
			"data-shape",
			"diamond",
		);
		expect(screen.getByRole("img", { name: "Done" })).toHaveAttribute("data-shape", "circle");
	});

	it("lets the data kind pick the default chart", () => {
		expect(defaultChart("runs")).toBe("bars");
		expect(defaultChart("work")).toBe("stages");
		expect(defaultChart("tracker-open")).toBe("number");
		for (const kind of ["work", "runs", "questions", "specs", "estimates", "quality", "impact"])
			expect(CHARTS).toContain(defaultChart(kind));
	});

	it("shows the default chart of a tile that names no chart", async () => {
		await mountKnowledge("dashboards");
		const runs = await tile("Runs");
		await waitFor(() =>
			expect(runs.getByRole("list", { name: /chart/ })).toHaveAttribute("data-chart", "bars"),
		);
		expect(
			(await tile("Tickets")).getByRole("list", { name: `Tickets, ${names.stages}` }),
		).toBeVisible();
	});

	it("changes the chart of a tile in its settings and keeps it in the file", async () => {
		const user = userEvent.setup();
		await mountKnowledge("dashboards", "/library/dashboards/team/edit");
		await user.click(await screen.findByRole("button", { name: "Tile settings Runs" }));
		const panel = within(await screen.findByRole("complementary", { name: "Tile settings" }));
		await user.click(panel.getByRole("combobox", { name: en.library.fn.dashboards.chart }));
		await user.click(await screen.findByRole("option", { name: names.line }));
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(async () =>
			expect(
				(await unwrap(commands.dashboardGetOne("team"))).value.tiles.find((x) => x.id === "runs")
					?.chart,
			).toBe("line"),
		);
		expect(
			await (await tile("Runs")).findByRole("img", { name: `Runs, ${names.line}` }),
		).toBeVisible();
	});
});

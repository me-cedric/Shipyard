import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { Card } from "./card";
import { PageHeader } from "./page-header";
import { Panel } from "./panel";
import { StatStrip } from "./stat-strip";
import { Timeline, TimelineItem } from "./timeline";

describe("visual language v2 molecules (ADR 0014)", () => {
	it("PageHeader shows the title, the count, one action and the overflow menu", async () => {
		const onClick = vi.fn();
		renderApp(
			<PageHeader
				title="Runs"
				count={4}
				chips={<span>main</span>}
				action={<button type="button">Start run</button>}
				menu={[{ label: "Refresh", onClick }]}
			/>,
		);
		expect(screen.getByRole("heading", { level: 1, name: "Runs" })).toBeInTheDocument();
		expect(screen.getByText("4")).toBeInTheDocument();
		expect(screen.getByText("main")).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "More" }));
		await userEvent.click(await screen.findByRole("menuitem", { name: "Refresh" }));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("Panel names its region and shows the count in the heading", () => {
		renderApp(
			<Panel title="Questions" count={3}>
				<Card>row</Card>
			</Panel>,
		);
		const region = screen.getByRole("region", { name: "Questions" });
		expect(within(region).getByRole("heading", { name: "Questions (3)" })).toBeInTheDocument();
		expect(within(region).getByText("row")).toBeInTheDocument();
	});

	it("StatStrip pairs each figure with its name", () => {
		renderApp(
			<StatStrip
				items={[
					{ label: "Needs you", value: "3" },
					{ label: "Spend today", value: "$1.20", trend: [1, 2] },
				]}
			/>,
		);
		const terms = screen.getAllByRole("term").map((t) => t.textContent);
		expect(terms).toEqual(["Needs you", "Spend today"]);
		expect(screen.getAllByRole("definition")[1]).toHaveTextContent("$1.20");
	});

	it("Timeline lists the events in order", () => {
		renderApp(
			<Timeline>
				<TimelineItem lead={null} title="first" time="10:00" />
				<TimelineItem lead={null} title="second" body="more" time="10:01" />
			</Timeline>,
		);
		expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
			"first10:00",
			"secondmore10:01",
		]);
	});
});

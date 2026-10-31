import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import type { PlanView_Serialize, SheetItem_Serialize } from "@/lib/ipc";
import { mountKnowledge } from "./harness";
import { costingSlide, planningSlide } from "./work-slides";

vi.mock("reveal.js", () => ({
	default: class {
		initialize() {}
		destroy() {}
	},
}));

const w = en.extras.slides;

describe("Knowledge / Slides: planning and costing slides", () => {
	it("writes a costing table with a total and skips a locked sheet", () => {
		const totals = (days: number, price: number) => ({
			days,
			cost: 0,
			price,
			margin: 0,
			unrated: [],
		});
		const sheets: SheetItem_Serialize[] = [
			{ slug: "a", name: "Lot A", state: "ready", error: null, totals: totals(10, 5000) },
			{ slug: "b", name: null, state: "locked", error: null, totals: null },
			{ slug: "c", name: "Lot C", state: "ready", error: null, totals: totals(2.5, 1000) },
		];
		const md = costingSlide(sheets, w, "en");
		expect(md).toContain("## Costing");
		expect(md).toContain("| Lot A | 10 | 5,000 |");
		expect(md).toContain("| **Total** | 12.5 | 6,000 |");
		expect(md).not.toContain("| b |");
	});

	it("marks a sheet with a role that has no rate, and the total", () => {
		const totals = (unrated: string[]) => ({ days: 4, cost: 0, price: 800, margin: 0, unrated });
		const sheets: SheetItem_Serialize[] = [
			{ slug: "a", name: "Lot A", state: "ready", error: null, totals: totals([]) },
			{ slug: "b", name: "Lot B", state: "ready", error: null, totals: totals(["qa"]) },
		];
		const md = costingSlide(sheets, w, "en");
		expect(md).toContain("| Lot A | 4 | 800 |");
		expect(md).toContain("| Lot B (some roles have no rate) | 4 | 800 |");
		expect(md).toContain("| **Total** (some roles have no rate) | 8 | 1,600 |");
		expect(costingSlide(sheets.slice(0, 1), w, "en")).not.toContain("no rate");
	});

	it("writes the first start and the last end of each plan", () => {
		const bar = (start: string, end: string, days: number) =>
			({
				task: "t",
				feature: "f",
				name: "n",
				role: "dev",
				member: null,
				start,
				end,
				days,
				months: [],
			}) as const;
		const plan = {
			gantt: { bars: [bar("2026-11-02", "2026-11-06", 5), bar("2026-11-09", "2026-11-10", 2)] },
		};
		const md = planningSlide(
			[{ name: "Lot A", plan: plan as unknown as PlanView_Serialize }],
			w,
			"en",
		);
		expect(md).toContain("| Lot A | 2026-11-02 | 2026-11-10 | 7 |");
	});

	it("adds a costing slide to the deck from the menu", async () => {
		const user = userEvent.setup();
		await mountKnowledge("slides");
		await user.click(await screen.findByRole("button", { name: "Kickoff" }));
		await screen.findByRole("region", { name: "Slides (5)" });
		await user.click(screen.getByRole("button", { name: "Add a slide" }));
		await user.click(await screen.findByRole("menuitem", { name: "Costing slide" }));
		expect(await screen.findByRole("region", { name: "Slides (6)" })).toBeInTheDocument();
		await user.click(screen.getByRole("tab", { name: "Edit" }));
		expect(
			(screen.getByRole("textbox", { name: "Markdown" }) as HTMLTextAreaElement).value,
		).toContain("## Costing");
	});
});

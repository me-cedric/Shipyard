import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import type { PlanView_Serialize, SheetItem_Serialize } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountKnowledge } from "./harness";
import {
	appendMarkdown,
	appendSlide,
	costingMarkdown,
	costingSlide,
	nextSlide,
	planningMarkdown,
	planningSlide,
	splitNote,
} from "./work-slides";

vi.mock("reveal.js", () => ({
	default: class {
		initialize() {}
		destroy() {}
	},
}));

const w = en.knowledge.slides;
const totals = (days: number, price: number, unrated: string[] = []) => ({
	days,
	cost: 0,
	price,
	margin: 0,
	unrated,
});

describe("Knowledge / Slides: planning and costing slides", () => {
	it("writes a costing table with a total and skips a locked sheet", () => {
		const sheets: SheetItem_Serialize[] = [
			{ slug: "a", name: "Lot A", state: "ready", error: null, totals: totals(10, 5000) },
			{ slug: "b", name: null, state: "locked", error: null, totals: null },
			{ slug: "c", name: "Lot C", state: "ready", error: null, totals: totals(2.5, 1000) },
		];
		const html = costingSlide(sheets, w, "en", 3);
		expect(html).toContain('<section class="slide" aria-label="3">');
		expect(html).toContain("<h2>Costing</h2>");
		expect(html).toContain("<td");
		expect(html).toMatch(/>Lot A<\/td>.*>10<\/td>.*>5,000<\/td>/);
		expect(html).toMatch(/>Total<\/td>.*>12\.5<\/td>.*>6,000<\/td>/);
		expect(html).not.toContain(">b<");
	});

	it("marks a sheet with a role that has no rate, and the total", () => {
		const sheets: SheetItem_Serialize[] = [
			{ slug: "a", name: "Lot A", state: "ready", error: null, totals: totals(4, 800) },
			{ slug: "b", name: "Lot <B>", state: "ready", error: null, totals: totals(4, 800, ["qa"]) },
		];
		const html = costingSlide(sheets, w, "en", 1);
		expect(html).toContain(">Lot &lt;B&gt; (some roles have no rate)</td>");
		expect(html).toContain(">Total (some roles have no rate)</td>");
		expect(costingSlide(sheets.slice(0, 1), w, "en", 1)).not.toContain("no rate");
	});

	it("writes the first start and the last end of each plan", () => {
		const bar = (start: string, end: string, days: number) => ({ start, end, days });
		const plan = {
			gantt: { bars: [bar("2026-11-02", "2026-11-06", 5), bar("2026-11-09", "2026-11-10", 2)] },
		};
		const html = planningSlide(
			[{ name: "Lot A", plan: plan as unknown as PlanView_Serialize }],
			w,
			"en",
			2,
		);
		expect(html).toMatch(/>Lot A<\/td>.*>2026-11-02<\/td>.*>2026-11-10<\/td>.*>7<\/td>/);
	});

	it("appends after the last slide and counts the slides", () => {
		const deck = '<main><section class="slide active">a</section></main><script></script>';
		expect(nextSlide(deck)).toBe(2);
		const out = appendSlide(deck, "<section>b</section>\n");
		expect(out).toBe(
			'<main><section class="slide active">a</section>\n\n<section>b</section></main><script></script>',
		);
		expect(() => appendSlide("<p>x</p>", "<section/>")).toThrow();
	});

	it("adds a costing slide to an HTML deck from its button", async () => {
		const user = userEvent.setup();
		await mountKnowledge("slides");
		await user.click(await screen.findByRole("button", { name: /^Roadmap/ }));
		// The two slides from the data are buttons under the stage.
		expect(await screen.findByRole("button", { name: "Planning slide" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Costing slide" }));
		await waitFor(() =>
			expect(mockState().knowledge.files["docs/slides/roadmap.html"]?.text).toContain(
				"<h2>Costing</h2>",
			),
		);
		expect(mockState().knowledge.files["docs/slides/roadmap.html"]?.text).toContain(
			'<section class="slide" aria-label="3">',
		);
	});
});

// spec:library-functions#REQ-004
describe("Knowledge / Slides: speaker notes and Markdown slides", () => {
	it("splits a slide at its Note: block", () => {
		expect(splitNote("## Plan\n\n1. A\n\nNote: say this\nand that")).toEqual({
			body: "## Plan\n\n1. A",
			note: "say this\nand that",
		});
		expect(splitNote("## Plan\n\n- Notebook: x")).toEqual({
			body: "## Plan\n\n- Notebook: x",
			note: "",
		});
		// A Note: line inside a code fence is code.
		expect(splitNote("```\nNote: code\n```").note).toBe("");
	});

	it("writes a costing and a planning table in Markdown and appends it after a rule", () => {
		const sheets: SheetItem_Serialize[] = [
			{ slug: "a", name: "Lot | A", state: "ready", error: null, totals: totals(10, 5000) },
		];
		const md = costingMarkdown(sheets, w, "en");
		expect(md).toBe(
			"## Costing\n\n| Sheet | Days | Price |\n| --- | --- | --- |\n| Lot \\| A | 10 | 5,000 |\n| Total | 10 | 5,000 |",
		);
		const bar = { start: "2026-11-02", end: "2026-11-06", days: 5 };
		const plan = { gantt: { bars: [bar] } } as unknown as PlanView_Serialize;
		expect(planningMarkdown([{ name: "Lot A", plan }], w, "en")).toContain(
			"| Lot A | 2026-11-02 | 2026-11-06 | 5 |",
		);
		expect(appendMarkdown("# A\n\ntext\n", md)).toBe(`# A\n\ntext\n\n---\n\n${md}\n`);
	});
});

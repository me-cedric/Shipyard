import type { PlanView_Serialize as PlanView, SheetItem_Serialize as SheetItem } from "@/lib/ipc";

type Words = {
	planningTitle: string;
	costingTitle: string;
	sheet: string;
	days: string;
	start: string;
	end: string;
	price: string;
	total: string;
	unrated: string;
};

const num = (n: number, lang: string) => n.toLocaleString(lang, { maximumFractionDigits: 1 });
const table = (head: string[], rows: string[][]) =>
	[head, head.map(() => "---"), ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n");

/** A costing slide: the days and the price of each sheet that opens, and the total. A sheet with a role that has no rate is marked: its price is low. */
export function costingSlide(sheets: SheetItem[], w: Words, lang: string): string {
	const ready = sheets.flatMap((s) => (s.totals ? [{ name: s.name ?? s.slug, t: s.totals }] : []));
	const sum = (k: "days" | "price") => ready.reduce((a, s) => a + (s.t[k] ?? 0), 0);
	const mark = (name: string, partial: boolean) => (partial ? `${name} (${w.unrated})` : name);
	const rows = ready.map((s) => [
		mark(s.name, s.t.unrated.length > 0),
		num(s.t.days ?? 0, lang),
		num(s.t.price ?? 0, lang),
	]);
	rows.push([
		mark(
			`**${w.total}**`,
			ready.some((s) => s.t.unrated.length > 0),
		),
		num(sum("days"), lang),
		num(sum("price"), lang),
	]);
	return `\n\n---\n\n## ${w.costingTitle}\n\n${table([w.sheet, w.days, w.price], rows)}\n`;
}

/** A planning slide: the first start, the last end and the days of each planned sheet. */
export function planningSlide(
	plans: { name: string; plan: PlanView }[],
	w: Words,
	lang: string,
): string {
	const rows = plans.flatMap(({ name, plan }) => {
		const bars = plan.gantt.bars;
		if (!bars.length) return [];
		const start = bars.map((b) => b.start).sort()[0] ?? "";
		const end =
			bars
				.map((b) => b.end)
				.sort()
				.at(-1) ?? "";
		const days = bars.reduce((a, b) => a + (b.days ?? 0), 0);
		return [[name, start, end, num(days, lang)]];
	});
	return `\n\n---\n\n## ${w.planningTitle}\n\n${table([w.sheet, w.start, w.end, w.days], rows)}\n`;
}

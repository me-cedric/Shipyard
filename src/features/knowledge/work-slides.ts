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
const esc = (s: string) =>
	s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

// The deck template (slide-deck skill) has no table style: the table takes its variables.
const CELL = "padding:12px 24px;text-align:left;border-bottom:2px solid var(--surface)";
const table = (head: string[], rows: string[][]) =>
	`<table style="border-collapse:collapse;font-size:var(--body)">` +
	`<thead><tr>${head.map((h) => `<th style="${CELL};color:var(--muted)">${esc(h)}</th>`).join("")}</tr></thead>` +
	`<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td style="${CELL}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const section = (n: number, title: string, body: string) =>
	`  <section class="slide" aria-label="${n}">\n    <h2>${esc(title)}</h2>\n    ${body}\n  </section>\n\n`;

/** A costing slide: the days and the price of each sheet that opens, and the total. A sheet with a role that has no rate is marked: its price is low. */
export function costingSlide(sheets: SheetItem[], w: Words, lang: string, n: number): string {
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
			w.total,
			ready.some((s) => s.t.unrated.length > 0),
		),
		num(sum("days"), lang),
		num(sum("price"), lang),
	]);
	return section(n, w.costingTitle, table([w.sheet, w.days, w.price], rows));
}

/** A planning slide: the first start, the last end and the days of each planned sheet. */
export function planningSlide(
	plans: { name: string; plan: PlanView }[],
	w: Words,
	lang: string,
	n: number,
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
	return section(n, w.planningTitle, table([w.sheet, w.start, w.end, w.days], rows));
}

/** The deck with the slide after its last slide. It throws when the deck has no slide. */
export function appendSlide(deck: string, slide: string): string {
	const end = "</section>";
	const at = deck.lastIndexOf(end);
	if (at < 0) throw new Error("the deck has no slide");
	const cut = at + end.length;
	return `${deck.slice(0, cut)}\n\n${slide.trimEnd()}${deck.slice(cut)}`;
}

/** The number of the next slide of a deck. */
export const nextSlide = (deck: string) =>
	(deck.match(/<section\b[^>]*\bclass="slide\b/g)?.length ?? 0) + 1;

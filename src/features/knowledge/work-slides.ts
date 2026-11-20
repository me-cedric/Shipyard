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

/** The head and the rows of the costing table: each sheet that opens, and the total. A sheet with a role that has no rate is marked: its price is low. */
function costingTable(sheets: SheetItem[], w: Words, lang: string) {
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
	return { head: [w.sheet, w.days, w.price], rows };
}

/** A costing slide: the days and the price of each sheet that opens, and the total. */
export function costingSlide(sheets: SheetItem[], w: Words, lang: string, n: number): string {
	const { head, rows } = costingTable(sheets, w, lang);
	return section(n, w.costingTitle, table(head, rows));
}

/** The head and the rows of the planning table: the first start, the last end and the days of each planned sheet. */
function planningTable(plans: { name: string; plan: PlanView }[], w: Words, lang: string) {
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
	return { head: [w.sheet, w.start, w.end, w.days], rows };
}

/** A planning slide of an HTML deck. */
export function planningSlide(
	plans: { name: string; plan: PlanView }[],
	w: Words,
	lang: string,
	n: number,
): string {
	const { head, rows } = planningTable(plans, w, lang);
	return section(n, w.planningTitle, table(head, rows));
}

const cell = (s: string) => s.replace(/\|/g, "\\|");
const mdTable = (title: string, head: string[], rows: string[][]) =>
	[
		`## ${title}`,
		"",
		`| ${head.map(cell).join(" | ")} |`,
		`| ${head.map(() => "---").join(" | ")} |`,
		...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
	].join("\n");

/** A costing slide of a Markdown deck: a heading and a table. */
export function costingMarkdown(sheets: SheetItem[], w: Words, lang: string): string {
	const { head, rows } = costingTable(sheets, w, lang);
	return mdTable(w.costingTitle, head, rows);
}

/** A planning slide of a Markdown deck: a heading and a table. */
export function planningMarkdown(
	plans: { name: string; plan: PlanView }[],
	w: Words,
	lang: string,
): string {
	const { head, rows } = planningTable(plans, w, lang);
	return mdTable(w.planningTitle, head, rows);
}

/** The Markdown deck with a slide after its last slide: a rule, then the slide. */
export const appendMarkdown = (deck: string, slide: string) =>
	`${deck.trimEnd()}\n\n---\n\n${slide.trimEnd()}\n`;

/**
 * A slide of a Markdown deck split at its speaker note: the `Note:` line and the lines after it
 * are the note (the Markdown format of reveal.js). A `Note:` line in a code fence is code.
 */
export function splitNote(slide: string): { body: string; note: string } {
	const lines = slide.split("\n");
	let fenced = false;
	const at = lines.findIndex((l) => {
		if (l.trimStart().startsWith("```")) fenced = !fenced;
		return !fenced && /^Note:/.test(l);
	});
	if (at < 0) return { body: slide, note: "" };
	return {
		body: lines.slice(0, at).join("\n").trimEnd(),
		note: [lines[at]?.replace(/^Note:\s*/, "") ?? "", ...lines.slice(at + 1)].join("\n").trim(),
	};
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

import { addDays, diffDays } from "@/lib/work/dates";
import type { GanttBar } from "./gantt";

const ROW = 28;
const HEAD = 56;
const LABEL = 224;
const TONES = ["accent", "success", "warning", "info"];
/** The value of a colour token of the theme on screen, so the image looks like the chart. */
const tok = (name: string) =>
	getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim() || "gray";
/** A canvas side above this size fails in some webviews. */
const MAX_SIDE = 16_000;

/**
 * The chart as PNG bytes, drawn on a canvas: the title, the months, the off days, a heading for
 * each group, one bar for each task and the today line. It reads the same bars as `Gantt`.
 */
export async function ganttPng(
	bars: GanttBar[],
	o: {
		title: string;
		today: string;
		dayWidth: number;
		isOff: (day: string) => boolean;
		lang: string;
	},
): Promise<number[]> {
	const first = [o.today, ...bars.map((b) => b.start)].sort()[0] ?? o.today;
	const last = [o.today, ...bars.map((b) => b.end)].sort().at(-1) ?? o.today;
	const from = addDays(first, -7);
	const days = Math.max(diffDays(from, addDays(last, 7)) + 1, 70);
	const dw = Math.max(o.dayWidth, 3);
	const rows: ({ group: string } | { bar: GanttBar })[] = [];
	for (const [i, b] of bars.entries()) {
		if (b.group !== bars[i - 1]?.group) rows.push({ group: b.group });
		rows.push({ bar: b });
	}
	const width = LABEL + days * dw;
	const height = HEAD + rows.length * ROW;
	const scale = Math.max(1, Math.min(2, Math.floor(MAX_SIDE / Math.max(width, height))));
	const canvas = document.createElement("canvas");
	canvas.width = width * scale;
	canvas.height = height * scale;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("the chart did not draw: no canvas");
	ctx.scale(scale, scale);
	const x = (day: string) => LABEL + diffDays(from, day) * dw;

	ctx.fillStyle = tok("surface-1");
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = tok("n-3");
	for (let i = 0; i < days; i++) {
		const d = addDays(from, i);
		if (o.isOff(d)) ctx.fillRect(x(d), HEAD, dw, height - HEAD);
	}
	ctx.font = "600 14px Inter, sans-serif";
	ctx.fillStyle = tok("n-12");
	ctx.fillText(o.title, 12, 20);
	ctx.font = "12px Inter, sans-serif";
	ctx.fillStyle = tok("n-11");
	for (let i = 0; i < days; i++) {
		const d = addDays(from, i);
		if (i > 0 && !d.endsWith("-01")) continue;
		const month = new Date(`${d}T00:00:00Z`).toLocaleDateString(o.lang, {
			month: "short",
			year: "numeric",
			timeZone: "UTC",
		});
		ctx.fillText(month, x(d) + 4, 44);
	}
	ctx.strokeStyle = tok("n-6");
	const owners = [...new Set(bars.flatMap((b) => (b.owner ? [b.owner] : [])))];
	for (const [i, r] of rows.entries()) {
		const y = HEAD + i * ROW;
		ctx.beginPath();
		ctx.moveTo(0, y + ROW);
		ctx.lineTo(width, y + ROW);
		ctx.stroke();
		if ("group" in r) {
			ctx.fillStyle = tok("n-11");
			ctx.font = "600 12px Inter, sans-serif";
			ctx.fillText(r.group, 12, y + 18, LABEL - 24);
			continue;
		}
		const b = r.bar;
		ctx.fillStyle = tok("n-12");
		ctx.font = "12px Inter, sans-serif";
		ctx.fillText(b.name, 12, y + 18, LABEL - 24);
		const owner = b.owner ? owners.indexOf(b.owner) : -1;
		ctx.fillStyle = tok(owner < 0 ? "n-8" : (TONES[owner % TONES.length] ?? "n-8"));
		const left = x(b.start);
		const w = (diffDays(b.start, b.end) + 1) * dw;
		ctx.beginPath();
		ctx.roundRect(left, y + 6, w, ROW - 12, 8);
		ctx.fill();
		if (b.owner && ctx.measureText(b.owner).width + 12 < w) {
			ctx.fillStyle = tok("accent-fg");
			ctx.fillText(b.owner, left + 6, y + 18);
		}
	}
	ctx.fillStyle = tok("accent");
	ctx.fillRect(x(o.today) + dw / 2 - 1, HEAD, 2, height - HEAD);

	const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
	if (!blob) throw new Error("the chart did not draw");
	return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

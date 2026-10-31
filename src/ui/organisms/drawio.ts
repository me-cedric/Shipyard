/**
 * The mxGraph model that a `.drawio.svg` carries in the `content` attribute of its root, or "".
 * A plain SVG has no model: it is not a board.
 */
export function xmlFromDrawioSvg(svg: string): string {
	try {
		const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
		if (doc.getElementsByTagName("parsererror").length > 0) return "";
		const content = doc.documentElement.getAttribute("content") ?? "";
		return content.trim().startsWith("<") ? content : "";
	} catch {
		return "";
	}
}

/** True when the text is a draw.io XML file. */
export function isDrawioXml(text: string): boolean {
	const doc = new DOMParser().parseFromString(text, "text/xml");
	if (doc.getElementsByTagName("parsererror").length > 0) return false;
	return ["mxfile", "mxGraphModel"].includes(doc.documentElement.tagName);
}

/** An SVG text as a data URI. It goes in an `<img>`, so a script in the file never runs. */
export const svgDataUri = (svg: string): string =>
	`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const num = (v: string | null | undefined): number => {
	const n = Number.parseFloat(v ?? "");
	return Number.isFinite(n) ? n : 0;
};
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** A colour from a style: a hex value or none. Anything else gets the fallback. */
const colour = (v: string | undefined, fallback: string): string =>
	v && (v === "none" || /^#[0-9a-f]{3,8}$/i.test(v)) ? v : fallback;

/** The most text that one inflated page may make. A small file can inflate to gigabytes. */
export const MAX_INFLATED = 8_000_000;

/** The text of a deflated, base64 draw.io page. Needs the browser `DecompressionStream`. */
async function inflate(b64: string): Promise<string> {
	const bytes = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
	const stream = new DecompressionStream("deflate-raw");
	const writer = stream.writable.getWriter();
	// A read that stops early rejects the write: that is the answer, not an error to report.
	writer.write(bytes).catch(() => {});
	writer.close().catch(() => {});
	const reader = stream.readable.getReader();
	const decoder = new TextDecoder();
	let text = "";
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > MAX_INFLATED) {
			void reader.cancel().catch(() => {});
			throw new Error("the page is too large");
		}
		text += decoder.decode(value, { stream: true });
	}
	return decodeURIComponent(text + decoder.decode());
}

/** The `mxGraphModel` of the first page of a draw.io XML file, compressed or not. Null if none. */
async function firstModel(text: string): Promise<Element | null> {
	const parse = (s: string) => new DOMParser().parseFromString(s, "text/xml");
	const doc = parse(text);
	if (doc.getElementsByTagName("parsererror").length > 0) return null;
	const found = doc.getElementsByTagName("mxGraphModel")[0];
	if (found) return found;
	const page = doc.getElementsByTagName("diagram")[0]?.textContent?.trim();
	if (!page) return null;
	const inner = parse(await inflate(page));
	return inner.getElementsByTagName("mxGraphModel")[0] ?? null;
}

type Box = { x: number; y: number; w: number; h: number };

/** The label of a cell as lines of plain text. The value can hold HTML. */
function lines(value: string): string[] {
	const html = new DOMParser().parseFromString(value.replace(/<br\s*\/?>/gi, "\n"), "text/html");
	return (html.body.textContent ?? "").split("\n").filter((l) => l.trim());
}

/** The point where a line from the centre of `b` toward `to` leaves the box. */
function edgePoint(b: Box, to: [number, number]): [number, number] {
	const cx = b.x + b.w / 2;
	const cy = b.y + b.h / 2;
	const dx = to[0] - cx;
	const dy = to[1] - cy;
	if (dx === 0 && dy === 0) return [cx, cy];
	const k = Math.min(
		dx === 0 ? Number.POSITIVE_INFINITY : b.w / 2 / Math.abs(dx),
		dy === 0 ? Number.POSITIVE_INFINITY : b.h / 2 / Math.abs(dy),
	);
	return [cx + dx * k, cy + dy * k];
}

/**
 * An SVG picture of a draw.io model: boxes (rectangle, rounded, ellipse, diamond), their text, and
 * edges with waypoints and arrows. Empty when the model has no box.
 * shortcut: an edge leaves a box at its rectangle border, other shapes and styles are plain, upgrade
 * when a real board looks wrong.
 */
function modelToSvg(model: Element): string {
	const cells = new Map<
		string,
		{ el: Element; id: string; value: string; style: Record<string, string> }
	>();
	for (const el of Array.from(model.getElementsByTagName("mxCell"))) {
		const wrap =
			el.parentElement && /^(object|UserObject)$/.test(el.parentElement.tagName)
				? el.parentElement
				: null;
		const id = (wrap ?? el).getAttribute("id") ?? "";
		const style: Record<string, string> = {};
		for (const p of (el.getAttribute("style") ?? "").split(";").filter(Boolean)) {
			const i = p.indexOf("=");
			style[i < 0 ? p : p.slice(0, i)] = i < 0 ? "1" : p.slice(i + 1);
		}
		cells.set(id, {
			el,
			id,
			value: wrap?.getAttribute("label") ?? el.getAttribute("value") ?? "",
			style,
		});
	}
	const geo = (id: string): Element | undefined =>
		Array.from(cells.get(id)?.el.children ?? []).find((c) => c.tagName === "mxGeometry");
	const boxes = new Map<string, Box>();
	const box = (id: string): Box | undefined => {
		const done = boxes.get(id);
		if (done) return done;
		const g = geo(id);
		if (!g) return undefined;
		const parent = cells.get(id)?.el.getAttribute("parent") ?? "";
		const up =
			parent !== id && cells.get(parent)?.el.getAttribute("vertex") === "1"
				? box(parent)
				: undefined;
		const b = {
			x: num(g.getAttribute("x")) + (up?.x ?? 0),
			y: num(g.getAttribute("y")) + (up?.y ?? 0),
			w: num(g.getAttribute("width")),
			h: num(g.getAttribute("height")),
		};
		boxes.set(id, b);
		return b;
	};
	const all: [number, number][] = [];
	let shapes = "";
	let edges = "";
	let nodes = 0;
	for (const c of cells.values()) {
		const b = c.el.getAttribute("vertex") === "1" ? box(c.id) : undefined;
		if (!b) continue;
		nodes++;
		all.push([b.x, b.y], [b.x + b.w, b.y + b.h]);
		const s = c.style;
		const fill = colour(s.fillColor, "#ffffff");
		const stroke = colour(s.strokeColor, "#333333");
		const paint = `fill="${fill}" stroke="${stroke}" stroke-width="1.5"`;
		const cx = b.x + b.w / 2;
		const cy = b.y + b.h / 2;
		// A text cell has no outline.
		if (s.text) {
			// no shape
		} else if (s.ellipse)
			shapes += `<ellipse cx="${cx}" cy="${cy}" rx="${b.w / 2}" ry="${b.h / 2}" ${paint}/>`;
		else if (s.rhombus)
			shapes += `<polygon points="${cx},${b.y} ${b.x + b.w},${cy} ${cx},${b.y + b.h} ${b.x},${cy}" ${paint}/>`;
		else
			shapes += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${s.rounded === "1" ? 8 : 0}" ${paint}/>`;
		const size = Math.min(Math.max(num(s.fontSize) || 12, 6), 48);
		const rows = lines(c.value);
		const first = cy - ((rows.length - 1) * size * 1.2) / 2;
		rows.forEach((row, i) => {
			shapes += `<text x="${cx}" y="${first + i * size * 1.2}" font-size="${size}" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" fill="${colour(s.fontColor, "#000000")}">${esc(row)}</text>`;
		});
	}
	if (nodes === 0) return "";
	for (const c of cells.values()) {
		if (c.el.getAttribute("edge") !== "1") continue;
		const from = box(c.el.getAttribute("source") ?? "");
		const to = box(c.el.getAttribute("target") ?? "");
		const g = geo(c.id);
		const via = Array.from(g?.querySelectorAll("Array mxPoint") ?? []).map(
			(p): [number, number] => [num(p.getAttribute("x")), num(p.getAttribute("y"))],
		);
		const dot = (as: string): [number, number] | undefined => {
			const p = Array.from(g?.children ?? []).find((n) => n.getAttribute("as") === as);
			return p ? [num(p.getAttribute("x")), num(p.getAttribute("y"))] : undefined;
		};
		const centre = (b: Box): [number, number] => [b.x + b.w / 2, b.y + b.h / 2];
		const a = from ? centre(from) : dot("sourcePoint");
		const z = to ? centre(to) : dot("targetPoint");
		if (!a || !z) continue;
		const start = from ? edgePoint(from, via[0] ?? z) : a;
		const end = to ? edgePoint(to, via[via.length - 1] ?? a) : z;
		const path = [start, ...via, end];
		all.push(...path);
		const stroke = colour(c.style.strokeColor, "#333333");
		const arrow = c.style.endArrow === "none" ? "" : ' marker-end="url(#shipyard-arrow)"';
		edges += `<polyline points="${path.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${stroke}" stroke-width="1.5"${arrow}/>`;
		const mid = path[Math.floor((path.length - 1) / 2)] ?? start;
		const next = path[Math.floor((path.length - 1) / 2) + 1] ?? mid;
		lines(c.value).forEach((row, i) => {
			edges += `<text x="${(mid[0] + next[0]) / 2}" y="${(mid[1] + next[1]) / 2 - 4 + i * 14}" font-size="11" font-family="sans-serif" text-anchor="middle" fill="#000000" stroke="#ffffff" stroke-width="3" paint-order="stroke">${esc(row)}</text>`;
		});
	}
	const x0 = Math.min(...all.map((p) => p[0])) - 10;
	const y0 = Math.min(...all.map((p) => p[1])) - 10;
	const w = Math.max(...all.map((p) => p[0])) + 10 - x0;
	const h = Math.max(...all.map((p) => p[1])) + 10 - y0;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}"><defs><marker id="shipyard-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#333333"/></marker></defs><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#ffffff"/>${shapes}${edges}</svg>`;
}

/**
 * The picture of a draw.io file, as SVG text, or "" when there is nothing to draw. A `.drawio.svg`
 * is the picture already. A plain `.drawio` is drawn from its model, which can be compressed.
 */
export async function drawioSvg(text: string, isSvg: boolean): Promise<string> {
	if (isSvg) return xmlFromDrawioSvg(text) === "" ? "" : text;
	try {
		const model = await firstModel(text);
		return model ? modelToSvg(model) : "";
	} catch {
		return "";
	}
}

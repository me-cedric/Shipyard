export type LayoutNode = {
	id: string;
	title: string;
	x: number;
	y: number;
	width: number;
	height: number;
	/** The id of the node that holds this one. */
	parent: string | null;
};
export type LayoutEdge = { id: string; label: string; points: [number, number][] };
export type Layout = {
	id: string;
	title: string;
	width: number;
	height: number;
	nodes: LayoutNode[];
	edges: LayoutEdge[];
};

/** The parts of a LikeC4 layouted view that the drawing needs. */
type Source = {
	id: string;
	title?: string | null;
	bounds: { x: number; y: number; width: number; height: number };
	nodes: readonly (Omit<LayoutNode, "parent"> & { parent?: string | null })[];
	edges: readonly { id: string; label?: string | null; points: readonly (readonly number[])[] }[];
};

/** Move the view to the origin, so the SVG needs no offset. */
export function toLayout(v: Source): Layout {
	const { x: ox, y: oy } = v.bounds;
	return {
		id: v.id,
		title: v.title || v.id,
		width: v.bounds.width,
		height: v.bounds.height,
		nodes: v.nodes.map((n) => ({
			id: n.id,
			title: n.title,
			x: n.x - ox,
			y: n.y - oy,
			width: n.width,
			height: n.height,
			parent: n.parent ?? null,
		})),
		edges: v.edges.map((e) => ({
			id: e.id,
			label: e.label ?? "",
			points: e.points.map((p) => [(p[0] ?? 0) - ox, (p[1] ?? 0) - oy]),
		})),
	};
}

/** The SVG path of an edge. LikeC4 gives Bezier points: one start, then groups of three. */
export function edgePath(points: [number, number][]): string {
	const [first, ...rest] = points;
	if (!first) return "";
	const head = `M${first[0]} ${first[1]}`;
	if (rest.length % 3 === 0 && rest.length > 0) {
		const curves: string[] = [];
		for (let i = 0; i < rest.length; i += 3)
			curves.push(
				`C${rest
					.slice(i, i + 3)
					.map((p) => `${p[0]} ${p[1]}`)
					.join(" ")}`,
			);
		return `${head}${curves.join("")}`;
	}
	return head + rest.map((p) => `L${p[0]} ${p[1]}`).join("");
}

/** A parser message of many lines ("Expecting one of 80 sequences ... but found") keeps its first and last line. */
export function shortMessage(message: string): string {
	const lines = message.split("\n").filter(Boolean);
	return lines.length > 3 ? `${lines[0]} ... ${lines[lines.length - 1]}` : message;
}

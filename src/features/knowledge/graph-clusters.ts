/** Clusters of the reference graph: pure grouping, view and layout. No React. */
export type GNode = { ref: string; kind: string; title: string; location?: string | null };
export type Cluster = { id: string; kind: string; key: string; members: GNode[] };

export const CLUSTER = "cluster/";
export const isCluster = (id: string) => id.startsWith(CLUSTER);

const CHANGE = /(?:^|\/)changes\/(?:archive\/)?([^/]+)\//;
const capOf = (ref: string) => /^spec:([^#]+)/.exec(ref)?.[1];

/** The change folder of a file. A `doc:` ref carries its own path. */
const changeOf = (n: GNode) =>
	CHANGE.exec(n.location ?? (n.ref.startsWith("doc:") ? n.ref.slice(4) : ""))?.[1];

/**
 * The cluster of each ref. A change folder holds its proposal, plan, checklist, tasks and files,
 * and the spec of each capability that it changes. A settled spec joins the change that touches
 * its capability. The rest groups by capability (a spec with its requirements) or by kind.
 */
export function clusterNodes(nodes: GNode[]): Cluster[] {
	const capChange = new Map<string, string>();
	for (const n of nodes) {
		const cap = capOf(n.ref);
		const id = changeOf(n);
		if (cap && id) capChange.set(cap, id);
	}
	const out = new Map<string, Cluster>();
	for (const n of nodes) {
		const cap = capOf(n.ref);
		const change = n.kind === "change" ? n.ref.slice(7) : (changeOf(n) ?? capChange.get(cap ?? ""));
		const [kind, key] = change ? ["change", change] : cap ? ["spec", cap] : [n.kind, ""];
		const id = `${CLUSTER}${kind}${key ? `:${key}` : ""}`;
		const c = out.get(id) ?? { id, kind, key, members: [] };
		// A document counts once.
		if (!c.members.some((m) => m.ref === n.ref)) c.members.push(n);
		out.set(id, c);
	}
	return [...out.values()];
}

/** The cluster of each file of the code graph: its folder. */
export function folderClusters(nodes: GNode[]): Cluster[] {
	const out = new Map<string, Cluster>();
	for (const n of nodes) {
		const key = n.ref.includes("/") ? n.ref.slice(0, n.ref.lastIndexOf("/")) : ".";
		const id = `${CLUSTER}folder:${key}`;
		const c = out.get(id) ?? { id, kind: "folder", key, members: [] };
		c.members.push(n);
		out.set(id, c);
	}
	return [...out.values()];
}

export type View = {
	clusters: Cluster[];
	/** The cluster ids that show their members. */
	open: Set<string>;
	/** The id that stands for a ref on the canvas: the ref when its cluster is open. */
	at: (ref: string) => string | undefined;
	links: [string, string][];
};

/**
 * What the canvas draws. `all` fixes the clusters; `shown` is what the filters and the search keep.
 * A cluster with no kept member is gone. With a query, each cluster with a match opens and lists
 * only the matches. A link between two clusters repeats once for each citation: its width counts.
 */
export function clusterView(
	all: GNode[],
	shown: GNode[],
	edges: [string, string][],
	open: string[],
	query = "",
	group: (nodes: GNode[]) => Cluster[] = clusterNodes,
): View {
	const keep = new Set(shown.map((n) => n.ref));
	const owner = new Map<string, string>();
	const clusters = group(all)
		.map((c) => {
			for (const m of c.members) owner.set(m.ref, c.id);
			return { ...c, members: c.members.filter((m) => keep.has(m.ref)) };
		})
		.filter((c) => c.members.length > 0);
	const opened = new Set(query ? clusters.map((c) => c.id) : open);
	const at = (ref: string) => {
		const c = owner.get(ref);
		return c && opened.has(c) ? ref : c;
	};
	const links = edges
		.filter(([a, b]) => keep.has(a) && keep.has(b))
		.map(([a, b]): [string, string] => [at(a) ?? a, at(b) ?? b])
		.filter(([a, b]) => a !== b);
	return { clusters, open: opened, at, links };
}

export type Box = { id: string; w: number; h: number };
export const CARD = { w: 208, h: 56 };
const CELL = { w: 190, h: 44 };
const HEAD = 72;
/** The longest move of a box in one step of the layout. */
const MOVE = 60;

/** The size of a cluster on the canvas: a card, or a card above a grid of its members. */
export function boxOf(id: string, members: number, open: boolean): Box {
	if (!open) return { id, ...CARD };
	const cols = Math.min(6, Math.ceil(Math.sqrt(members)));
	return {
		id,
		w: Math.max(CARD.w, cols * CELL.w),
		h: HEAD + Math.ceil(members / cols) * CELL.h,
	};
}

/** The cell of the nth member inside the box of an open cluster. */
export function cellOf(n: number, members: number) {
	const cols = Math.min(6, Math.ceil(Math.sqrt(members)));
	return { x: (n % cols) * CELL.w, y: HEAD + Math.floor(n / cols) * CELL.h };
}

/**
 * A force layout of boxes: they repel when they overlap, linked boxes pull together, and a weak
 * pull to the centre keeps the graph compact. Deterministic: same input, same places. The result
 * is the top-left corner of each box. shortcut: O(n^2) for each step, fine for some hundreds of
 * clusters, use a grid index above that.
 */
export function forceLayout(boxes: Box[], links: [string, string][]) {
	const at = new Map(boxes.map((b, i) => [b.id, i]));
	const r = boxes.map((b) => Math.hypot(b.w, b.h) / 2 + 20);
	// A spiral start: no two boxes share a place.
	const p = boxes.map((_, i) => {
		const a = i * 2.4;
		const d = 120 * Math.sqrt(i);
		return { x: d * Math.cos(a), y: d * Math.sin(a) };
	});
	const pairs = links
		.map(([a, b]) => [at.get(a), at.get(b)] as const)
		.filter((x): x is readonly [number, number] => x[0] !== undefined && x[1] !== undefined);
	const STEPS = 250;
	for (let step = 0; step < STEPS; step++) {
		const t = 1 - step / STEPS;
		const f = p.map(() => ({ x: 0, y: 0 }));
		for (let i = 0; i < p.length; i++)
			for (let j = i + 1; j < p.length; j++) {
				const dx = (p[j]?.x ?? 0) - (p[i]?.x ?? 0) || 0.01 * (j - i);
				const dy = (p[j]?.y ?? 0) - (p[i]?.y ?? 0);
				const d = Math.hypot(dx, dy);
				const gap = (r[i] ?? 0) + (r[j] ?? 0) - d;
				if (gap <= 0) continue;
				const [ux, uy] = [dx / d, dy / d];
				for (const [k, s] of [
					[i, -1],
					[j, 1],
				] as const) {
					const q = f[k];
					if (q) {
						q.x += (ux * gap * s) / 2;
						q.y += (uy * gap * s) / 2;
					}
				}
			}
		for (const [i, j] of pairs) {
			const dx = (p[j]?.x ?? 0) - (p[i]?.x ?? 0);
			const dy = (p[j]?.y ?? 0) - (p[i]?.y ?? 0);
			const d = Math.hypot(dx, dy) || 1;
			const pull = (d - ((r[i] ?? 0) + (r[j] ?? 0) + 40)) * 0.03;
			if (pull <= 0) continue;
			const [a, b] = [f[i], f[j]];
			if (a && b) {
				a.x += (dx / d) * pull;
				a.y += (dy / d) * pull;
				b.x -= (dx / d) * pull;
				b.y -= (dy / d) * pull;
			}
		}
		p.forEach((q, i) => {
			const g = f[i];
			if (!g) return;
			const [mx, my] = [g.x - q.x * 0.01, g.y - q.y * 0.01];
			// The pushes of many overlaps add up and diverge: cap each move.
			const k = Math.min(1, MOVE / (Math.hypot(mx, my) || 1)) * (0.2 + 0.8 * t);
			q.x += mx * k;
			q.y += my * k;
		});
	}
	return new Map(
		boxes.map((b, i) => [b.id, { x: (p[i]?.x ?? 0) - b.w / 2, y: (p[i]?.y ?? 0) - b.h / 2 }]),
	);
}

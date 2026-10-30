import {
	Background,
	type Edge,
	Handle,
	type Node,
	type NodeProps,
	Position,
	ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "../atoms/icon-button";
import { LiveDot } from "../atoms/live-dot";
import { type Status, StatusDot } from "../atoms/status-dot";
import { ViewColumnsIcon } from "../icons";
import { useDark } from "./use-dark";

export type CanvasKind = { id: string; label: string };
export type CanvasNode = {
	id: string;
	kind: string;
	label: string;
	/** The accessible name, with the noun of the kind. */
	name: string;
	status?: Status;
	/** An entity that no other entity cites. */
	orphan?: boolean;
	/** An entity that cites an entity which changed later. */
	stale?: boolean;
};
export type CanvasLabels = {
	table: string;
	name: string;
	kind: string;
	links: string;
	orphan: string;
	stale: string;
};

type Data = {
	node: CanvasNode;
	shape: number;
	kind: string;
	selected: boolean;
	labels: CanvasLabels;
	glow: boolean;
	live: boolean;
};

const COL = 220;
const ROW = 44;
/** A kind with more nodes wraps into a new column, so a long list stays on screen. */
const MAX_ROWS = 14;

// One shape and one colour for each kind, in the order of `kinds`.
const SHAPES = [
	<circle key="c" cx="5" cy="5" r="4" fill="currentColor" />,
	<rect key="r" x="1" y="1" width="8" height="8" fill="currentColor" />,
	<polygon key="d" points="5,0.5 9.5,5 5,9.5 0.5,5" fill="currentColor" />,
	<polygon key="t" points="5,1 9.5,9 0.5,9" fill="currentColor" />,
	<circle key="o" cx="5" cy="5" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" />,
	<polygon key="h" points="2.5,1 7.5,1 10,5 7.5,9 2.5,9 0,5" fill="currentColor" />,
];
/** The token of each kind colour, for the glow of the glow mode. */
const HUES = ["--accent", "--success", "--warning", "--danger", "--info", "--n-9"];
const COLORS = [
	"text-accent",
	"text-success",
	"text-warning",
	"text-danger",
	"text-info",
	"text-n-11",
];

function KindMark({ index, label }: { index: number; label: string }) {
	return (
		<svg
			role="img"
			aria-label={label}
			viewBox="0 0 10 10"
			className={cn("size-2.5 shrink-0", COLORS[index % COLORS.length])}
		>
			{SHAPES[index % SHAPES.length]}
		</svg>
	);
}

const marksOf = (n: CanvasNode, l: CanvasLabels) => [
	...(n.orphan ? [l.orphan] : []),
	...(n.stale ? [l.stale] : []),
];

function CanvasBox({ data }: NodeProps<Node<Data>>) {
	const { node, shape, kind, selected, labels, glow, live } = data;
	const hue = `var(${HUES[shape % HUES.length]})`;
	return (
		<>
			<Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" />
			<button
				type="button"
				data-nav=""
				data-node={node.id}
				aria-pressed={selected}
				aria-label={[node.name, ...marksOf(node, labels)].join(", ")}
				style={
					glow
						? {
								borderColor: `color-mix(in oklch, ${hue} ${live ? 70 : 35}%, transparent)`,
								boxShadow: `0 0 ${live ? 22 : 12}px color-mix(in oklch, ${hue} ${live ? 45 : 22}%, transparent), inset 0 1px 0 var(--highlight)`,
							}
						: undefined
				}
				className={cn(
					"nopan flex h-9 w-44 items-center gap-2 rounded-md border border-n-7 bg-n-2 px-2 text-left text-12 hover:bg-n-3",
					glow && "bg-surface-2 text-n-12 transition-shadow duration-(--duration-base)",
					selected && "ring-2 ring-accent",
				)}
			>
				{live ? <LiveDot /> : null}
				<KindMark index={shape} label={kind} />
				{node.status ? <StatusDot status={node.status} /> : null}
				<span className="truncate">{node.label}</span>
				{node.orphan ? <StatusDot status="idle" label={labels.orphan} /> : null}
				{node.stale ? <StatusDot status="warning" label={labels.stale} /> : null}
			</button>
			<Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0" />
		</>
	);
}

const NODE_TYPES = { entity: CanvasBox };

/** One column for each kind, one row for each node, in the order given. No physics. */
export function canvasLayout(
	nodes: CanvasNode[],
	links: [string, string][],
	kinds: CanvasKind[],
	selected: string | null,
	labels: CanvasLabels,
	glow = false,
	live: ReadonlySet<string> = new Set(),
	animate = false,
) {
	const rows = new Map<string, number>();
	const index = (k: string) => {
		const i = kinds.findIndex((x) => x.id === k);
		return i < 0 ? kinds.length : i;
	};
	// The first column of each kind: the kinds before it take one column per MAX_ROWS nodes.
	const sizes = new Map<number, number>();
	for (const n of nodes) sizes.set(index(n.kind), (sizes.get(index(n.kind)) ?? 0) + 1);
	const start = (k: number) => {
		let col = 0;
		for (let i = 0; i < k; i++) col += Math.ceil((sizes.get(i) ?? 0) / MAX_ROWS);
		return col;
	};
	const placed = nodes.map((node): Node<Data> => {
		const row = rows.get(node.kind) ?? 0;
		rows.set(node.kind, row + 1);
		const shape = index(node.kind);
		const col = start(shape) + Math.floor(row / MAX_ROWS);
		return {
			id: node.id,
			type: "entity",
			position: { x: col * COL, y: (row % MAX_ROWS) * ROW },
			data: {
				node,
				shape,
				kind: kinds[shape]?.label ?? node.kind,
				selected: node.id === selected,
				labels,
				glow,
				live: live.has(node.id),
			},
		};
	});
	const ids = new Set(nodes.map((n) => n.id));
	const edges = links
		.filter(([a, b]) => ids.has(a) && ids.has(b))
		.map(([a, b]): Edge => {
			const on = glow && (live.has(a) || live.has(b));
			return {
				id: `${a}>${b}`,
				source: a,
				target: b,
				animated: on && animate,
				style: glow
					? { stroke: on ? "var(--accent)" : "var(--n-7)", strokeWidth: on ? 2 : 1 }
					: undefined,
			};
		});
	return { nodes: placed, edges };
}

const reducedMotion = () =>
	typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One renderer for the reference graph, the code graph and the Agents map. It holds no copy of the
 * data. A node holds a button: Tab reaches it, Enter opens it, the arrows follow the links
 * (right: a link out, left: a link in, up and down: the order of the nodes). A table lists the same
 * nodes. Nothing is draggable and nothing moves.
 */
export function GraphCanvas({
	nodes,
	links,
	kinds,
	label,
	labels,
	selected = null,
	onOpen,
	extra,
	glow = false,
	live,
	legend = false,
}: {
	nodes: CanvasNode[];
	links: [string, string][];
	kinds: CanvasKind[];
	label: string;
	labels: CanvasLabels;
	selected?: string | null;
	onOpen: (id: string) => void;
	/** Controls that sit left of the table toggle. */
	extra?: React.ReactNode;
	/** A dark canvas with nodes that glow in the colour of their kind. */
	glow?: boolean;
	/** The ids of the live nodes: they breathe, and their edges flow. */
	live?: ReadonlySet<string>;
	/** A row of chips, one per kind with its count. */
	legend?: boolean;
}) {
	const [table, setTable] = useState(false);
	const root = useRef<HTMLElement>(null);
	const dark = useDark();
	const reduced = reducedMotion();
	const graph = useMemo(
		() => canvasLayout(nodes, links, kinds, selected, labels, glow, live, !reduced),
		[nodes, links, kinds, selected, labels, glow, live, reduced],
	);
	const out = useMemo(() => {
		const m = new Map<string, { to: string[]; from: string[] }>();
		for (const n of nodes) m.set(n.id, { to: [], from: [] });
		for (const [a, b] of links) {
			m.get(a)?.to.push(b);
			m.get(b)?.from.push(a);
		}
		return m;
	}, [nodes, links]);
	const titleOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;

	const move = (e: KeyboardEvent<HTMLElement>) => {
		const from = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.dataset.node;
		if (!from) return;
		const at = nodes.findIndex((n) => n.id === from);
		const near = out.get(from);
		const to = {
			ArrowRight: near?.to[0],
			ArrowLeft: near?.from[0],
			ArrowDown: nodes[at + 1]?.id,
			ArrowUp: nodes[at - 1]?.id,
		}[e.key];
		if (!to) return;
		e.preventDefault();
		for (const b of root.current?.querySelectorAll<HTMLElement>("[data-node]") ?? [])
			if (b.dataset.node === to) b.focus();
	};

	return (
		<section
			ref={root}
			aria-label={label}
			data-motion={reduced ? "reduced" : "normal"}
			className="flex min-h-0 flex-1 flex-col"
			onKeyDown={move}
		>
			<div className="flex shrink-0 items-center justify-end gap-2 px-2 py-1">
				{legend ? (
					<ul aria-label={labels.kind} className="mr-auto flex flex-wrap items-center gap-1.5">
						{kinds.map((k, i) => (
							<li
								key={k.id}
								className="flex h-6 items-center gap-1.5 rounded-full border bg-surface-2 px-2.5 text-12 text-n-11 shadow-1"
							>
								<KindMark index={i} label={k.label} />
								{k.label}
								<span className="font-mono text-11 text-n-12">
									{nodes.filter((n) => n.kind === k.id).length}
								</span>
							</li>
						))}
					</ul>
				) : null}
				{extra}
				<IconButton label={labels.table} aria-pressed={table} onClick={() => setTable(!table)}>
					<ViewColumnsIcon size={14} />
				</IconButton>
			</div>
			{table ? (
				<div className="min-h-0 flex-1 overflow-auto px-3">
					<table aria-label={labels.table} className="w-full text-left text-ui">
						<thead>
							<tr className="border-b text-12 text-n-11">
								<th className="py-1 font-medium">{labels.name}</th>
								<th className="py-1 font-medium">{labels.kind}</th>
								<th className="py-1 font-medium">{labels.links}</th>
							</tr>
						</thead>
						<tbody>
							{nodes.map((n) => (
								<tr key={n.id} className="border-b">
									<th scope="row" className="py-1 font-normal">
										<button
											type="button"
											aria-label={[n.name, ...marksOf(n, labels)].join(", ")}
											aria-pressed={n.id === selected}
											className="max-w-full truncate rounded-sm text-left hover:underline"
											onClick={() => onOpen(n.id)}
										>
											{n.label}
										</button>
									</th>
									<td className="py-1">{kinds.find((k) => k.id === n.kind)?.label ?? n.kind}</td>
									<td className="py-1 font-mono text-12">
										{(out.get(n.id)?.to ?? []).map(titleOf).join(", ")}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div
					className={cn(
						"min-h-0 flex-1",
						glow &&
							"m-2 mt-0 overflow-hidden rounded-lg border bg-surface-0 bg-radial-[at_50%_0%] from-accent-soft to-transparent to-70% canvas-dark",
					)}
				>
					<ReactFlow
						// A new node set mounts a new canvas, so `fitView` frames the nodes after a filter.
						key={graph.nodes.map((n) => n.id).join(" ")}
						nodes={graph.nodes}
						edges={graph.edges}
						nodeTypes={NODE_TYPES}
						colorMode={glow || dark ? "dark" : "light"}
						style={glow ? { background: "transparent" } : undefined}
						fitView
						fitViewOptions={{ duration: reduced ? 0 : 200 }}
						// The click of a node, and Enter on its button, bubble to this handler.
						onNodeClick={(_, n) => onOpen(n.id)}
						nodesDraggable={false}
						nodesConnectable={false}
						nodesFocusable={false}
						edgesFocusable={false}
						elementsSelectable={false}
						proOptions={{ hideAttribution: true }}
					>
						<Background color={glow ? "var(--n-6)" : undefined} gap={glow ? 16 : undefined} />
					</ReactFlow>
				</div>
			)}
		</section>
	);
}

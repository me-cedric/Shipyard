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
};

const COL = 220;
const ROW = 44;

// One shape and one colour for each kind, in the order of `kinds`.
const SHAPES = [
	<circle key="c" cx="5" cy="5" r="4" fill="currentColor" />,
	<rect key="r" x="1" y="1" width="8" height="8" fill="currentColor" />,
	<polygon key="d" points="5,0.5 9.5,5 5,9.5 0.5,5" fill="currentColor" />,
	<polygon key="t" points="5,1 9.5,9 0.5,9" fill="currentColor" />,
	<circle key="o" cx="5" cy="5" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" />,
	<polygon key="h" points="2.5,1 7.5,1 10,5 7.5,9 2.5,9 0,5" fill="currentColor" />,
];
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
	const { node, shape, kind, selected, labels } = data;
	return (
		<>
			<Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" />
			<button
				type="button"
				data-nav=""
				data-node={node.id}
				aria-pressed={selected}
				aria-label={[node.name, ...marksOf(node, labels)].join(", ")}
				className={cn(
					"nopan flex h-9 w-44 items-center gap-2 rounded-md border border-n-7 bg-n-2 px-2 text-left text-12 hover:bg-n-3",
					selected && "ring-2 ring-accent",
				)}
			>
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
) {
	const rows = new Map<string, number>();
	const index = (k: string) => {
		const i = kinds.findIndex((x) => x.id === k);
		return i < 0 ? kinds.length : i;
	};
	const placed = nodes.map((node): Node<Data> => {
		const row = rows.get(node.kind) ?? 0;
		rows.set(node.kind, row + 1);
		const shape = index(node.kind);
		return {
			id: node.id,
			type: "entity",
			position: { x: shape * COL, y: row * ROW },
			data: {
				node,
				shape,
				kind: kinds[shape]?.label ?? node.kind,
				selected: node.id === selected,
				labels,
			},
		};
	});
	const ids = new Set(nodes.map((n) => n.id));
	const edges = links
		.filter(([a, b]) => ids.has(a) && ids.has(b))
		.map(([a, b]): Edge => ({ id: `${a}>${b}`, source: a, target: b }));
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
}) {
	const [table, setTable] = useState(false);
	const root = useRef<HTMLElement>(null);
	const dark = useDark();
	const reduced = reducedMotion();
	const graph = useMemo(
		() => canvasLayout(nodes, links, kinds, selected, labels),
		[nodes, links, kinds, selected, labels],
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
				<div className="min-h-0 flex-1">
					<ReactFlow
						nodes={graph.nodes}
						edges={graph.edges}
						nodeTypes={NODE_TYPES}
						colorMode={dark ? "dark" : "light"}
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
						<Background />
					</ReactFlow>
				</div>
			)}
		</section>
	);
}

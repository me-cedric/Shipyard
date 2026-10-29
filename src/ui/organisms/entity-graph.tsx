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
import { useMemo } from "react";
import { type Status, StatusDot } from "../atoms/status-dot";
import { useDark } from "./use-dark";

export const GRAPH_KINDS = ["agent", "ticket", "file", "ref"] as const;
export type GraphKind = (typeof GRAPH_KINDS)[number];

export type EntityNode = {
	id: string;
	kind: GraphKind;
	label: string;
	/** The accessible name, with the noun of the kind. */
	name: string;
	status?: Status;
};

type Data = { node: EntityNode };

const COL = 220;
const ROW = 44;

function EntityBox({ data }: NodeProps<Node<Data>>) {
	const { node } = data;
	return (
		<>
			<Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" />
			<button
				type="button"
				data-nav=""
				aria-label={node.name}
				className="nopan flex h-9 w-44 items-center gap-2 rounded-md border border-n-7 bg-n-2 px-2 text-left text-12 hover:bg-n-3"
			>
				{node.status ? <StatusDot status={node.status} /> : null}
				<span className="truncate">{node.label}</span>
			</button>
			<Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0" />
		</>
	);
}

const NODE_TYPES = { entity: EntityBox };

/** One column for each kind, one row for each node, in the order given. No physics. */
export function entityLayout(nodes: EntityNode[], links: [string, string][]) {
	const rows = new Map<GraphKind, number>();
	const placed = nodes.map((node): Node<Data> => {
		const row = rows.get(node.kind) ?? 0;
		rows.set(node.kind, row + 1);
		return {
			id: node.id,
			type: "entity",
			position: { x: GRAPH_KINDS.indexOf(node.kind) * COL, y: row * ROW },
			data: { node },
		};
	});
	const ids = new Set(nodes.map((n) => n.id));
	const edges = links
		.filter(([a, b]) => ids.has(a) && ids.has(b))
		.map(([a, b]): Edge => ({ id: `${a}>${b}`, source: a, target: b }));
	return { nodes: placed, edges };
}

/**
 * Agents, tickets, files and refs as a graph. A node holds a button: Tab reaches it and Enter opens it.
 * Nothing is draggable and nothing moves.
 */
export function EntityGraph({
	nodes,
	links,
	label,
	onOpen,
}: {
	nodes: EntityNode[];
	links: [string, string][];
	label: string;
	onOpen: (id: string) => void;
}) {
	const dark = useDark();
	const graph = useMemo(() => entityLayout(nodes, links), [nodes, links]);
	return (
		<section aria-label={label} className="min-h-0 flex-1">
			<ReactFlow
				nodes={graph.nodes}
				edges={graph.edges}
				nodeTypes={NODE_TYPES}
				colorMode={dark ? "dark" : "light"}
				fitView
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
		</section>
	);
}

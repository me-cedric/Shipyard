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
import { RunStep, type StepStatus } from "../molecules/run-step";
import { useDark } from "./use-dark";

export type GraphStep = { id: string; needs: string[]; state: StepStatus; units?: number };

type Data = { step: GraphStep };

const COL = 170;
const ROW = 64;

function StepNode({ data }: NodeProps<Node<Data>>) {
	const { step } = data;
	return (
		<>
			<Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />
			<RunStep id={step.id} state={step.state} units={step.units} />
			<Handle
				type="source"
				position={Position.Bottom}
				isConnectable={false}
				className="opacity-0"
			/>
		</>
	);
}

const NODE_TYPES = { step: StepNode };

/** A step sits one row below its deepest need. A cycle or an unknown need counts as no need. */
export function layout(steps: GraphStep[]): { nodes: Node<Data>[]; edges: Edge[] } {
	const ids = new Set(steps.map((s) => s.id));
	const depth = new Map<string, number>();
	const depthOf = (s: GraphStep, seen: Set<string>): number => {
		const known = depth.get(s.id);
		if (known !== undefined) return known;
		if (seen.has(s.id)) return 0;
		seen.add(s.id);
		const needs = s.needs.filter((n) => ids.has(n));
		const d = needs.length
			? 1 + Math.max(...needs.map((n) => depthOf(steps.find((x) => x.id === n) as GraphStep, seen)))
			: 0;
		depth.set(s.id, d);
		return d;
	};
	const used = new Map<number, number>();
	const nodes = steps.map((step): Node<Data> => {
		const d = depthOf(step, new Set());
		const col = used.get(d) ?? 0;
		used.set(d, col + 1);
		return { id: step.id, type: "step", position: { x: col * COL, y: d * ROW }, data: { step } };
	});
	const edges = steps.flatMap((s) =>
		s.needs
			.filter((n) => ids.has(n))
			.map((n): Edge => ({ id: `${n}>${s.id}`, source: n, target: s.id })),
	);
	return { nodes, edges };
}

/**
 * The workflow of a run as a graph, one node for each step. Nothing is draggable and no edge moves:
 * only the dot of a running step pulses, and reduced motion stops that.
 */
export function RunGraph({ steps, label }: { steps: GraphStep[]; label: string }) {
	const dark = useDark();
	const { nodes, edges } = useMemo(() => layout(steps), [steps]);
	return (
		<section aria-label={label} className="h-64 rounded-md border border-n-7">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={NODE_TYPES}
				colorMode={dark ? "dark" : "light"}
				fitView
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable={false}
				zoomOnScroll={false}
				proOptions={{ hideAttribution: true }}
			>
				<Background />
			</ReactFlow>
		</section>
	);
}

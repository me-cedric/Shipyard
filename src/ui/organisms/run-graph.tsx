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
import { useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { RunStep, type StepStatus } from "../molecules/run-step";

export type GraphStep = { id: string; needs: string[]; state: StepStatus; units?: number };

type Data = { step: GraphStep };

const COL = 180;
const ROW = 72;

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
export function layout(
	steps: GraphStep[],
	animate = false,
): { nodes: Node<Data>[]; edges: Edge[] } {
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
	// The edge into a running step carries the flow: accent and, unless motion is reduced, moving.
	const edges = steps.flatMap((s) =>
		s.needs
			.filter((n) => ids.has(n))
			.map((n): Edge => {
				const live = s.state === "running";
				const done = s.state === "done";
				return {
					id: `${n}>${s.id}`,
					source: n,
					target: s.id,
					animated: live && animate,
					style: {
						stroke: live ? "var(--accent)" : done ? "var(--success)" : "var(--n-8)",
						strokeWidth: live ? 2 : 1.5,
					},
				};
			}),
	);
	return { nodes, edges };
}

/**
 * The workflow of a run as a graph on a dark canvas, one node for each step. Nothing is draggable.
 * A running step glows and the edges into it flow; reduced motion stops the flow.
 */
export function RunGraph({
	steps,
	label,
	className,
}: {
	steps: GraphStep[];
	label: string;
	className?: string;
}) {
	const animate = !useReducedMotion();
	const { nodes, edges } = useMemo(() => layout(steps, animate), [steps, animate]);
	return (
		<section
			aria-label={label}
			className={cn(
				"h-72 overflow-hidden rounded-lg border bg-surface-0 bg-radial-[at_50%_0%] from-accent-soft to-transparent to-70% canvas-dark",
				className,
			)}
		>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={NODE_TYPES}
				colorMode="dark"
				style={{ background: "transparent" }}
				fitView
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable={false}
				zoomOnScroll={false}
				proOptions={{ hideAttribution: true }}
			>
				<Background color="var(--n-6)" gap={16} />
			</ReactFlow>
		</section>
	);
}

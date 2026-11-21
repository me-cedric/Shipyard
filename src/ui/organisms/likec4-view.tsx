import { useState } from "react";
import { cn } from "@/lib/utils";
import { ZoomFrame } from "../molecules/zoom-frame";
import type { EditorError } from "./error-line";
import { edgePath, type Layout, shortMessage, toLayout } from "./likec4-layout";
import { LineError, useRender } from "./use-render";

/**
 * The layouted views of a LikeC4 text. The browser build of `@likec4/language-services` parses
 * and lays out the text with a wasm Graphviz. No file system and no server take part.
 */
export async function renderLikeC4(source: string): Promise<Layout[]> {
	const { fromSource } = await import("@likec4/language-services/browser");
	const likec4 = await fromSource(source);
	const [first] = likec4.getErrors();
	// LikeC4 counts lines from 0.
	if (first) throw new LineError(shortMessage(first.message), first.line + 1);
	const views = (await likec4.diagrams()).map(toLayout);
	if (views.length === 0) throw new Error("The model has no view to draw.");
	return views;
}

// LikeC4 lays nodes out at about 320 by 180: draw them near 240 by 110 so the labels read large.
const SX = 0.75;
const SY = 0.6;

function Drawing({ view: full }: { view: Layout }) {
	const view: Layout = {
		...full,
		width: full.width * SX,
		height: full.height * SY,
		nodes: full.nodes.map((n) => ({
			...n,
			x: n.x * SX,
			y: n.y * SY,
			width: n.width * SX,
			height: n.height * SY,
		})),
		edges: full.edges.map((e) => ({
			...e,
			points: e.points.map(([x, y]) => [x * SX, y * SY] as [number, number]),
		})),
	};
	const byId = new Map(view.nodes.map((n) => [n.id, n]));
	// A holder draws first, so that its children sit above it.
	const depth = (id: string | null): number => (id ? 1 + depth(byId.get(id)?.parent ?? null) : 0);
	const nodes = [...view.nodes].sort((a, b) => depth(a.id) - depth(b.id));
	return (
		<svg
			viewBox={`-8 -8 ${view.width + 16} ${view.height + 16}`}
			width={view.width + 16}
			height={view.height + 16}
			className="max-w-full text-n-10"
			aria-hidden="true"
		>
			<defs>
				<marker
					id={`arrow-${view.id}`}
					markerWidth="8"
					markerHeight="8"
					refX="7"
					refY="4"
					orient="auto"
				>
					<path d="M0 0L8 4L0 8z" fill="currentColor" />
				</marker>
				<filter id={`lift-${view.id}`} x="-20%" y="-20%" width="140%" height="150%">
					<feDropShadow
						dx="0"
						dy="6"
						stdDeviation="7"
						floodColor="currentColor"
						floodOpacity="0.12"
					/>
				</filter>
			</defs>
			{nodes.map((n) => {
				const holder = n.parent === null && view.nodes.some((c) => c.parent === n.id);
				const system = n.kind === "system";
				return (
					<g key={n.id}>
						<rect
							x={n.x}
							y={n.y}
							width={n.width}
							height={n.height}
							rx="16"
							filter={holder || system ? undefined : `url(#lift-${view.id})`}
							className={cn(
								holder ? "fill-n-2 stroke-n-7" : system ? "fill-accent" : "fill-surface-2",
							)}
						/>
						<text
							x={n.x + n.width / 2}
							y={n.y + n.height / 2}
							textAnchor="middle"
							dominantBaseline="middle"
							style={{ fontSize: 22 }}
							className={cn("font-semibold", system ? "fill-accent-fg" : "fill-n-12")}
						>
							{n.title}
						</text>
					</g>
				);
			})}
			{view.edges.map((e) => {
				const mid = e.points[Math.floor(e.points.length / 2)];
				const w = e.label.length * 9 + 28;
				return (
					<g key={e.id}>
						<path
							d={edgePath(e.points)}
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							markerEnd={`url(#arrow-${view.id})`}
						/>
						{e.label && mid ? (
							<g>
								<rect
									x={mid[0] - w / 2}
									y={mid[1] - 12}
									width={w}
									height="24"
									rx="12"
									className="fill-surface-2"
								/>
								<text
									x={mid[0]}
									y={mid[1]}
									textAnchor="middle"
									dominantBaseline="middle"
									style={{ fontSize: 16 }}
									className="fill-n-12 font-medium"
								>
									{e.label}
								</text>
							</g>
						) : null}
					</g>
				);
			})}
		</svg>
	);
}

/** Live render of a LikeC4 text. A broken text keeps the last good render and reports its error. */
export function LikeC4View({
	source,
	label,
	onError,
}: {
	source: string;
	/** The accessible name of the views. */
	label: string;
	onError?: (error: EditorError | null) => void;
}) {
	const [failure, setFailure] = useState<string | null>(null);
	const views = useRender(
		source,
		renderLikeC4,
		(e) => {
			setFailure(e?.message ?? null);
			onError?.(e);
		},
		400,
	);
	return (
		<ZoomFrame label={label} className="min-h-40">
			<div className="flex flex-col gap-4 p-3">
				{failure ? (
					<p role="alert" className="text-ui text-danger-text">
						{failure}
					</p>
				) : null}
				{(views ?? []).map((v) => (
					<figure key={v.id} aria-label={`${label}: ${v.title}`} className="flex flex-col gap-1">
						<Drawing view={v} />
					</figure>
				))}
			</div>
		</ZoomFrame>
	);
}

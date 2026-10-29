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
	return (await likec4.diagrams()).map(toLayout);
}

function Drawing({ view }: { view: Layout }) {
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
			</defs>
			{nodes.map((n) => (
				<g key={n.id}>
					<rect
						x={n.x}
						y={n.y}
						width={n.width}
						height={n.height}
						rx="6"
						className={
							n.parent === null && view.nodes.some((c) => c.parent === n.id)
								? "fill-n-2 stroke-n-7"
								: "fill-n-3 stroke-n-8"
						}
					/>
					<text
						x={n.x + n.width / 2}
						y={n.y + n.height / 2}
						textAnchor="middle"
						dominantBaseline="middle"
						className="fill-n-12 text-12"
					>
						{n.title}
					</text>
				</g>
			))}
			{view.edges.map((e) => (
				<g key={e.id}>
					<path
						d={edgePath(e.points)}
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						markerEnd={`url(#arrow-${view.id})`}
					/>
					{e.label && e.points[Math.floor(e.points.length / 2)] ? (
						<text
							x={e.points[Math.floor(e.points.length / 2)]?.[0]}
							y={e.points[Math.floor(e.points.length / 2)]?.[1]}
							textAnchor="middle"
							className="fill-n-11 stroke-n-1 stroke-[4px] text-11 [paint-order:stroke]"
						>
							{e.label}
						</text>
					) : null}
				</g>
			))}
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
	const views = useRender(source, renderLikeC4, onError, 400);
	return (
		<div className="flex min-h-40 flex-col gap-4 overflow-auto rounded-md border border-n-7 bg-n-1 p-3">
			{(views ?? []).map((v) => (
				<figure key={v.id} aria-label={`${label}: ${v.title}`} className="flex flex-col gap-1">
					<figcaption className="text-12 font-medium text-n-11">{v.title}</figcaption>
					<Drawing view={v} />
				</figure>
			))}
		</div>
	);
}

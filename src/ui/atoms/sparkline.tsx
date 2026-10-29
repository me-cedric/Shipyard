import { cn } from "@/lib/utils";

const W = 100;
const H = 24;

/** The points of a line through the values, scaled to a 100 x 24 box with 1 px of air. */
export function sparkPoints(values: number[]) {
	const min = Math.min(...values);
	const span = Math.max(...values) - min || 1;
	const step = W / Math.max(1, values.length - 1);
	return values.map(
		(v, i) => `${+(i * step).toFixed(2)},${+(H - 1 - ((v - min) / span) * (H - 2)).toFixed(2)}`,
	);
}

/** A trend in pure SVG: a line and a soft area. Decoration only: the figure next to it carries the value. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
	if (values.length < 2) return null;
	const line = sparkPoints(values).join(" ");
	return (
		<svg
			aria-hidden="true"
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="none"
			className={cn("h-6 w-full text-accent", className)}
		>
			<polygon points={`0,${H} ${line} ${W},${H}`} fill="currentColor" fillOpacity={0.14} />
			<polyline
				points={line}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

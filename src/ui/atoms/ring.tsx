import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SPRING } from "../motion";

const R = 15;
const C = 2 * Math.PI * R;

/** A value out of a maximum as a ring, with the figure in its centre. The arc is the accent. */
export function Ring({
	value,
	max,
	label,
	children,
	className,
}: {
	value: number;
	max: number;
	label: string;
	children?: ReactNode;
	className?: string;
}) {
	const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
	return (
		// biome-ignore lint/a11y/useSemanticElements: a <meter> cannot hold the ring and its figure
		<span
			role="meter"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={max}
			aria-valuenow={value}
			className={cn("relative inline-flex size-11 shrink-0 items-center justify-center", className)}
		>
			<svg aria-hidden="true" viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
				<circle cx="18" cy="18" r={R} fill="none" stroke="var(--n-5)" strokeWidth="3" />
				<motion.circle
					cx="18"
					cy="18"
					r={R}
					fill="none"
					stroke="var(--accent)"
					strokeWidth="3"
					strokeLinecap="round"
					strokeDasharray={C}
					initial={false}
					animate={{ strokeDashoffset: C * (1 - pct) }}
					transition={SPRING.smooth}
				/>
			</svg>
			<span aria-hidden="true" className="relative font-mono text-11 text-n-12">
				{children}
			</span>
		</span>
	);
}

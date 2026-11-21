import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { SPRING } from "../motion";

/** The meter: a value out of a maximum. `over` shows a value that is over its limit. */
export function Progress({
	value,
	max,
	label,
	over,
	className,
}: {
	value: number;
	max: number;
	label: string;
	over?: boolean;
	className?: string;
}) {
	const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
	return (
		<div
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={max}
			aria-valuenow={value}
			className={cn("h-2 w-full min-w-12 overflow-hidden rounded-full bg-n-5", className)}
		>
			<motion.div
				className={cn("h-full rounded-full", over ? "bg-attention-strong" : "bg-accent")}
				initial={false}
				animate={{ width: `${pct}%` }}
				transition={SPRING.smooth}
			/>
		</div>
	);
}

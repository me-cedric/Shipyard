import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { SPRING } from "../motion";

/** Progress across steps: done steps out of all steps. The fill is the accent gradient. */
export function Progress({
	value,
	max,
	label,
	className,
}: {
	value: number;
	max: number;
	label: string;
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
			className={cn("h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-n-4", className)}
		>
			<motion.div
				className="h-full rounded-full bg-accent-gradient"
				initial={false}
				animate={{ width: `${pct}%` }}
				transition={SPRING.smooth}
			/>
		</div>
	);
}

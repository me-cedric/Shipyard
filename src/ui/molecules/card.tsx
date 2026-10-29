import { type HTMLMotionProps, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ITEM, SPRING } from "../motion";

/**
 * A raised block on the second surface. It lifts on hover. `interactive` adds the press and the
 * focus glow for a card that is a control itself. In a list it takes the stagger of the parent.
 */
export function Card({
	interactive,
	className,
	...props
}: HTMLMotionProps<"div"> & { interactive?: boolean }) {
	return (
		<motion.div
			variants={ITEM}
			whileHover={{ y: -1 }}
			whileTap={interactive ? { scale: 0.99 } : undefined}
			transition={SPRING.snappy}
			className={cn(
				"rounded-lg border bg-surface-2 shadow-1 transition-shadow duration-(--duration-base) hover:shadow-2",
				interactive && "cursor-pointer focus-visible:shadow-glow",
				className,
			)}
			{...props}
		/>
	);
}

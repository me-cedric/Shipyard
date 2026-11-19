import { type HTMLMotionProps, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ITEM, SPRING } from "../motion";

/**
 * A white block with the elevation of a card and no border. `pad` adds the standard padding. `interactive`
 * adds the lift, the press and the focus ring for a card that is a control itself. In a list it
 * takes the stagger of the parent.
 */
export function Card({
	interactive,
	pad,
	className,
	...props
}: HTMLMotionProps<"div"> & { interactive?: boolean; pad?: boolean }) {
	return (
		<motion.div
			variants={ITEM}
			whileHover={interactive ? { y: -1 } : undefined}
			whileTap={interactive ? { scale: 0.99 } : undefined}
			transition={SPRING.snappy}
			className={cn(
				"min-w-0 rounded-lg bg-surface-2 shadow-2",
				pad && "px-6 py-5.5",
				interactive &&
					"cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
				className,
			)}
			{...props}
		/>
	);
}

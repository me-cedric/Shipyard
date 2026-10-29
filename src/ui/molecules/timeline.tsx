import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ITEM, LIST, useEnter } from "../motion";

/** Events in time order on one vertical line. */
export function Timeline({ children }: { children: ReactNode }) {
	return (
		<motion.ol
			variants={LIST}
			initial={useEnter()}
			animate="shown"
			className="relative flex flex-col before:absolute before:top-4 before:bottom-4 before:left-6 before:w-px before:bg-n-6"
		>
			{children}
		</motion.ol>
	);
}

/** One event: a lead (an avatar or a status shape) on the line, the title, the body and the time. */
export function TimelineItem({
	lead,
	title,
	body,
	time,
}: {
	lead: ReactNode;
	title: string;
	body?: string;
	/** Already formatted for the language. */
	time: string;
}) {
	return (
		<motion.li variants={ITEM} className="relative flex items-start gap-3 px-3 py-2 text-ui">
			<span className="z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-1">
				{lead}
			</span>
			<div className="min-w-0 flex-1">
				<p className="truncate text-n-12">{title}</p>
				{body ? <p className="truncate text-12 text-n-11">{body}</p> : null}
			</div>
			<span className="shrink-0 text-12 text-n-10">{time}</span>
		</motion.li>
	);
}

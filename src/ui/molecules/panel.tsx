import { motion } from "motion/react";
import type { ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";
import { LIST, useEnter } from "../motion";

/** A titled block on the first surface: a header with the count and a toolbar, then the body. */
export function Panel({
	title,
	count,
	toolbar,
	flush,
	className,
	children,
}: {
	title: string;
	count?: number;
	toolbar?: ReactNode;
	/** Rows that touch the edges, with no gap: a list, not cards. */
	flush?: boolean;
	className?: string;
	children: ReactNode;
}) {
	const { t } = useI18n();
	return (
		<section
			aria-label={title}
			className={cn("flex flex-col rounded-lg border bg-surface-1 shadow-1", className)}
		>
			<div className="flex min-h-10 items-center gap-2 border-b px-3">
				<h2
					aria-label={count === undefined ? undefined : format(t.count, { name: title, count })}
					className="flex flex-1 items-center gap-2 text-14 font-medium text-n-12"
				>
					{title}
					{count === undefined ? null : <Badge>{count}</Badge>}
				</h2>
				{toolbar}
			</div>
			<motion.div
				variants={LIST}
				initial={useEnter()}
				animate="shown"
				className={flush ? "flex flex-col overflow-hidden rounded-b-lg" : "flex flex-col gap-2 p-2"}
			>
				{children}
			</motion.div>
		</section>
	);
}

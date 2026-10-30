import { motion } from "motion/react";
import type { ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";
import { LIST, useEnter } from "../motion";

export type PanelTone = "accent" | "success" | "warning" | "danger" | "info" | "neutral";

/** A soft tint and a 2 px top line in the colour of the tone: the head of a lane. */
const TONE: Record<PanelTone, { head: string; line: string; badge: PanelTone }> = {
	accent: { head: "bg-accent-soft", line: "bg-accent-gradient", badge: "accent" },
	success: { head: "bg-success-soft", line: "bg-success", badge: "success" },
	warning: { head: "bg-warning-soft", line: "bg-warning", badge: "warning" },
	danger: { head: "bg-danger-soft", line: "bg-danger", badge: "danger" },
	info: { head: "bg-info-soft", line: "bg-info", badge: "info" },
	neutral: { head: "bg-n-3", line: "bg-n-8", badge: "neutral" },
};

/** A titled block on the first surface: a header with the count and a toolbar, then the body. */
export function Panel({
	title,
	count,
	icon,
	tone,
	toolbar,
	flush,
	className,
	bodyClassName,
	children,
}: {
	title: string;
	count?: number;
	icon?: ReactNode;
	/** Tints the header: a lane of a board. */
	tone?: PanelTone;
	toolbar?: ReactNode;
	/** Rows that touch the edges, with no gap: a list, not cards. */
	flush?: boolean;
	className?: string;
	bodyClassName?: string;
	children: ReactNode;
}) {
	const { t } = useI18n();
	const tint = tone ? TONE[tone] : null;
	return (
		<section
			aria-label={title}
			className={cn(
				"relative flex flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1",
				className,
			)}
		>
			{tint ? (
				<span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-0.5", tint.line)} />
			) : null}
			<div className={cn("flex min-h-10 shrink-0 items-center gap-2 border-b px-3", tint?.head)}>
				<h2
					aria-label={count === undefined ? undefined : format(t.count, { name: title, count })}
					className="flex flex-1 items-center gap-2 text-14 font-medium text-n-12"
				>
					{icon ? (
						<span aria-hidden="true" className="flex text-n-11">
							{icon}
						</span>
					) : null}
					{title}
					{count === undefined ? null : (
						<Badge variant={tint?.badge ?? "neutral"} className="font-mono">
							{count}
						</Badge>
					)}
				</h2>
				{toolbar}
			</div>
			<motion.div
				variants={LIST}
				initial={useEnter()}
				animate="shown"
				className={cn(
					flush ? "flex flex-col overflow-hidden" : "flex flex-col gap-2 p-2",
					bodyClassName,
				)}
			>
				{children}
			</motion.div>
		</section>
	);
}

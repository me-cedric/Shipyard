import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "../atoms/sparkline";
import { ITEM, LIST, useEnter } from "../motion";

export type StatTone = "accent" | "success" | "warning" | "danger" | "info";

export type StatItem = {
	label: string;
	value: ReactNode;
	icon?: ReactNode;
	/** A short change, for example "+2". */
	delta?: string;
	/** Older first. Two values or more draw a sparkline. */
	trend?: number[];
	/** The colour of the icon tile and the sparkline. Accent by default. */
	tone?: StatTone;
	/** A figure under the value: a bar or a ring. */
	extra?: ReactNode;
};

const TONE: Record<StatTone, { tile: string; line: string }> = {
	accent: { tile: "bg-accent-subtle text-accent-text", line: "text-accent" },
	success: { tile: "bg-success-soft text-success-text", line: "text-success" },
	warning: { tile: "bg-warning-soft text-warning-text", line: "text-warning" },
	danger: { tile: "bg-danger-soft text-danger-text", line: "text-danger" },
	info: { tile: "bg-info-soft text-info-text", line: "text-info" },
};

/** Three to five key figures as cards, each with an optional delta and sparkline. */
export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
	return (
		<motion.dl
			variants={LIST}
			initial={useEnter()}
			animate="shown"
			// The columns follow the count of the cards: a fifth card does not sit alone on a second row.
			className={cn("grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4", className)}
		>
			{items.map((s) => {
				const tone = TONE[s.tone ?? "accent"];
				return (
					<motion.div
						key={s.label}
						variants={ITEM}
						className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-surface-2 px-6 py-5.5 shadow-2"
					>
						<dt className="flex items-center gap-2 text-13 font-semibold text-n-11">
							{s.icon ? (
								<span
									aria-hidden="true"
									className={cn("flex size-6 items-center justify-center rounded-sm", tone.tile)}
								>
									{s.icon}
								</span>
							) : null}
							{s.label}
						</dt>
						<dd className="flex items-end gap-3">
							<span className="text-30 font-semibold text-n-12">{s.value}</span>
							{s.delta ? <span className="pb-1 text-13 text-n-11">{s.delta}</span> : null}
							{s.trend ? (
								<Sparkline values={s.trend} className={cn("ml-auto h-7 max-w-28", tone.line)} />
							) : null}
						</dd>
						{s.extra ? <dd>{s.extra}</dd> : null}
					</motion.div>
				);
			})}
		</motion.dl>
	);
}

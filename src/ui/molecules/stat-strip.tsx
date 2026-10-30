import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "../atoms/sparkline";
import { ITEM, LIST, useEnter } from "../motion";

export type StatTone = "accent" | "success" | "warning" | "danger" | "info";

export type StatItem = {
	label: string;
	value: string;
	icon?: ReactNode;
	/** A short change, for example "+2". */
	delta?: string;
	/** Older first. Two values or more draw a sparkline. */
	trend?: number[];
	/** The colour of the icon tile, the glow and the sparkline. Accent by default. */
	tone?: StatTone;
	/** A figure under the value: a bar or a ring. */
	extra?: ReactNode;
};

const TONE: Record<StatTone, { tile: string; glow: string; line: string }> = {
	accent: {
		tile: "bg-accent-soft text-accent-text",
		glow: "from-accent-soft",
		line: "text-accent",
	},
	success: {
		tile: "bg-success-soft text-success-text",
		glow: "from-success-soft",
		line: "text-success",
	},
	warning: {
		tile: "bg-warning-soft text-warning-text",
		glow: "from-warning-soft",
		line: "text-warning",
	},
	danger: {
		tile: "bg-danger-soft text-danger-text",
		glow: "from-danger-soft",
		line: "text-danger",
	},
	info: { tile: "bg-info-soft text-info-text", glow: "from-info-soft", line: "text-info" },
};

/** Three to five key figures as cards, each with an optional delta and sparkline. */
export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
	return (
		<motion.dl
			variants={LIST}
			initial={useEnter()}
			animate="shown"
			className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}
		>
			{items.map((s) => {
				const tone = TONE[s.tone ?? "accent"];
				return (
					<motion.div
						key={s.label}
						variants={ITEM}
						className="relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border bg-surface-2 px-3 py-2.5 shadow-1"
					>
						<span
							aria-hidden="true"
							className={cn(
								"pointer-events-none absolute inset-0 bg-linear-to-b to-transparent to-70% opacity-70",
								tone.glow,
							)}
						/>
						<dt className="relative flex items-center gap-2 text-12 text-n-11">
							{s.icon ? (
								<span
									aria-hidden="true"
									className={cn("flex size-5 items-center justify-center rounded-sm", tone.tile)}
								>
									{s.icon}
								</span>
							) : null}
							{s.label}
						</dt>
						<dd className="relative flex items-end gap-3">
							<span className="font-mono text-20 text-n-12">{s.value}</span>
							{s.delta ? <span className="pb-0.5 text-12 text-n-11">{s.delta}</span> : null}
							{s.trend ? (
								<Sparkline values={s.trend} className={cn("ml-auto h-7 max-w-28", tone.line)} />
							) : null}
						</dd>
						{s.extra ? <dd className="relative">{s.extra}</dd> : null}
					</motion.div>
				);
			})}
		</motion.dl>
	);
}

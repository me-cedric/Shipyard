import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "../atoms/sparkline";

export type StatItem = {
	label: string;
	value: string;
	icon?: ReactNode;
	/** A short change, for example "+2". */
	delta?: string;
	/** Older first. Two values or more draw a sparkline. */
	trend?: number[];
};

/** Three to five key figures as cards, each with an optional delta and sparkline. */
export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
	return (
		<dl className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
			{items.map((s) => (
				<div
					key={s.label}
					className="flex min-w-0 flex-col gap-1 rounded-lg border bg-surface-2 px-3 py-2.5 shadow-1"
				>
					<dt className="flex items-center gap-1.5 text-12 text-n-11">
						{s.icon}
						{s.label}
					</dt>
					<dd className="flex items-end gap-3">
						<span className="font-mono text-20 text-n-12">{s.value}</span>
						{s.delta ? <span className="pb-0.5 text-12 text-n-11">{s.delta}</span> : null}
						{s.trend ? <Sparkline values={s.trend} className="ml-auto h-7 max-w-28" /> : null}
					</dd>
				</div>
			))}
		</dl>
	);
}

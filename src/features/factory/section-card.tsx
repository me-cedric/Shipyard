import type { ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";

/**
 * A titled card of the new look (`spec:app-redesign#REQ-016`): the second surface, a small title, an
 * optional count and toolbar, then the body. `flush` lets rows touch the edges.
 */
export function SectionCard({
	id,
	title,
	count,
	toolbar,
	flush,
	className,
	bodyClassName,
	children,
}: {
	/** The anchor of the card: an error or a link can open it (`#id`). */
	id?: string;
	title: string;
	count?: number;
	toolbar?: ReactNode;
	flush?: boolean;
	className?: string;
	bodyClassName?: string;
	children: ReactNode;
}) {
	const { t } = useI18n();
	return (
		<section
			id={id}
			aria-label={title}
			className={cn("flex flex-col overflow-hidden rounded-xl bg-surface-2 shadow-1", className)}
		>
			<div className="flex min-h-control shrink-0 flex-wrap items-center gap-2 px-4 pt-1">
				<h2
					aria-label={count === undefined ? undefined : format(t.count, { name: title, count })}
					className="flex flex-1 items-center gap-2 text-12 font-medium text-n-11"
				>
					{title}
					{count === undefined ? null : <Badge className="font-mono">{count}</Badge>}
				</h2>
				{toolbar}
			</div>
			<div className={cn("flex flex-col", flush ? "px-1 pb-1" : "gap-2 px-4 pb-4", bodyClassName)}>
				{children}
			</div>
		</section>
	);
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";

/** The look of a chip that names the items that wait. */
export const ATTENTION_CHIP = "bg-attention-subtle font-semibold text-attention-text";

/**
 * A card for a thing that a person must act on. The only user of the attention colour. With `icon`
 * or `action` it is one row (icon, title, action) and has no tag.
 */
export function AttentionCard({
	who,
	title,
	icon,
	action,
	children,
}: {
	/** The tag of the card. The row layout has none. */
	who?: string;
	title: string;
	/** The row layout: the picture at the start. */
	icon?: ReactNode;
	/** The row layout: the one action at the end. */
	action?: ReactNode;
	/** The answer controls. */
	children?: ReactNode;
}) {
	const row = icon !== undefined || action !== undefined;
	return (
		<article
			className={
				row
					? "flex min-w-0 flex-wrap items-center gap-4 rounded-lg bg-surface-2 px-6 py-4 shadow-2 outline-2 outline-attention"
					: "flex min-w-0 flex-col gap-3 rounded-lg bg-surface-2 px-6 py-5.5 shadow-2 outline-2 outline-attention"
			}
		>
			{!row && who ? (
				<Badge variant="you" className="self-start">
					{who}
				</Badge>
			) : null}
			{icon}
			{/* tabIndex -1: the focus lands here when the card changes. */}
			<h3
				tabIndex={-1}
				className={cn(
					"text-20 font-semibold text-n-12 outline-none",
					row && "min-w-0 flex-[1_1_180px]",
				)}
			>
				{title}
			</h3>
			{action}
			{children}
		</article>
	);
}

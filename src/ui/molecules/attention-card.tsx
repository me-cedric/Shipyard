import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";

/** The look of a chip that names the items that wait. */
export const ATTENTION_CHIP = "bg-attention-subtle font-semibold text-attention-text";

/** The frame of a block that a person must act on, where the layout of `AttentionCard` does not fit. */
export const ATTENTION_FRAME = "outline-2 outline-attention";
/** The soft ground and the full fill of a meter or a block that is over its limit. */
export const ATTENTION_TINT = "bg-attention-subtle";
export const ATTENTION_FILL = "bg-attention-strong";

/**
 * A card for a thing that a person must act on. The only user of the attention colour. With `icon`
 * or `action` it is one row (icon, title, action) and has no tag.
 */
export function AttentionCard({
	who,
	head,
	title,
	titleClass = "text-20 font-semibold",
	heading: Heading = "h3",
	className = "",
	icon,
	action,
	children,
}: {
	/** The tag of the card. The row layout has none. */
	who?: string;
	/** A header row in place of the `who` tag, for a card that names a person or has controls. */
	head?: ReactNode;
	/** Left out when `head` holds the title. */
	title?: string;
	titleClass?: string;
	/** The heading element: "h2" where the page title is the only heading above the card. */
	heading?: "h2" | "h3";
	/** Layout classes of the card, such as `h-full` in a grid of equal cards. */
	className?: string;
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
			className={cn(
				row
					? "flex min-w-0 flex-wrap items-center gap-4 rounded-lg bg-surface-2 px-6 py-4 shadow-2 outline-2 outline-attention"
					: "flex min-w-0 flex-col gap-3 rounded-lg bg-surface-2 px-6 py-5.5 shadow-2 outline-2 outline-attention",
				className,
			)}
		>
			{row
				? null
				: (head ??
					(who ? (
						<Badge variant="you" className="self-start">
							{who}
						</Badge>
					) : null))}
			{icon}
			{/* tabIndex -1: the focus lands here when the card changes. */}
			{title ? (
				<Heading
					tabIndex={-1}
					className={cn(titleClass, "text-n-12 outline-none", row && "min-w-0 flex-[1_1_180px]")}
				>
					{title}
				</Heading>
			) : null}
			{action}
			{children}
		</article>
	);
}

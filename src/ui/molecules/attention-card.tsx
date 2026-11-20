import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "../atoms/avatar";

/** The look of a chip that names the items that wait. */
export const ATTENTION_CHIP = "bg-attention-subtle font-semibold text-attention-text";

/** The frame of a block that a person must act on, where the layout of `AttentionCard` does not fit. */
export const ATTENTION_FRAME = "outline-2 outline-attention";
/** The soft ground and the full fill of a meter or a block that is over its limit. */
export const ATTENTION_TINT = "bg-attention-subtle";
export const ATTENTION_FILL = "bg-attention-strong";
/** The ground and the glyph colour of an icon on such a card. */
export const ATTENTION_ICON = "bg-attention-subtle text-attention-text";
/** The colour of a glyph on such a card. */
export const ATTENTION_GLYPH = "text-attention-text";
/** The colour of an action on the inverted panel (the dark session panel), such as Stop. */
export const ATTENTION_ON_PANEL = "text-attention-on-panel";

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
	inline = false,
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
	/** One small bold line: the avatar of `who` and the title side by side, as the heading. */
	inline?: boolean;
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
					(who && !(inline && title) ? (
						<p className="flex items-center gap-3 font-semibold text-n-12">
							<Avatar agent name={who.split(" ")[0] ?? who} />
							{who}
						</p>
					) : null))}
			{icon}
			{/* tabIndex -1: the focus lands here when the card changes. */}
			{title ? (
				<Heading
					tabIndex={-1}
					className={cn(
						inline && who ? "flex items-center gap-3 font-semibold" : titleClass,
						"text-n-12 outline-none",
						row && "min-w-0 flex-[1_1_180px]",
					)}
				>
					{inline && who ? (
						<span aria-hidden="true" className="flex">
							<Avatar agent name={who.split(" ")[0] ?? who} />
						</span>
					) : null}
					{title}
				</Heading>
			) : null}
			{action}
			{children}
		</article>
	);
}

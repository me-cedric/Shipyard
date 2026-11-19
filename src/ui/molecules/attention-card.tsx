import type { ReactNode } from "react";
import { Badge } from "../atoms/badge";

/** The look of a chip that names the items that wait. */
export const ATTENTION_CHIP = "bg-attention-subtle font-semibold text-attention-text";

/** A card for a thing that a person must act on. The only user of the attention colour. */
export function AttentionCard({
	who,
	title,
	children,
}: {
	who: string;
	title: string;
	/** The answer controls. */
	children?: ReactNode;
}) {
	return (
		<article className="flex min-w-0 flex-col gap-3 rounded-lg bg-surface-2 px-6 py-5.5 shadow-2 outline-2 outline-attention">
			<Badge variant="you" className="self-start">
				{who}
			</Badge>
			{/* tabIndex -1: the focus lands here when the card changes. */}
			<h3 tabIndex={-1} className="text-20 font-semibold text-n-12 outline-none">
				{title}
			</h3>
			{children}
		</article>
	);
}

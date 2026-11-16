import type { ReactNode } from "react";

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
		<article className="flex flex-col gap-3 rounded-xl border-2 border-attention bg-surface-2 p-5 shadow-1">
			<p className="w-fit rounded-full bg-attention-subtle px-3 text-13 font-semibold text-attention-text">
				{who}
			</p>
			<h3 className="text-16 font-semibold text-n-12">{title}</h3>
			{children}
		</article>
	);
}

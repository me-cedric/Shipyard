import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";
import { ATTENTION_FRAME } from "./attention-card";
import { SettingsRow } from "./settings-row";

/** The body of a Setup page: two columns of cards that fill the width, one column when the page is narrow. */
export function Columns({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<div className={cn("flex flex-wrap items-start gap-6 px-4 pb-10", className)}>{children}</div>
	);
}

/** One column of `Columns`: its cards, one under the other. */
export function Column({ children }: { children: ReactNode }) {
	return <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">{children}</div>;
}

/** A white card of Setup: a small grey caption as the name of the group, then its rows. */
export function SetupCard({
	id,
	title,
	action,
	attention,
	className,
	children,
}: {
	/** The anchor of the card (`#id`). */
	id?: string;
	/** The caption. It names the region. */
	title?: string;
	/** One control at the right of the caption. */
	action?: ReactNode;
	/** A person must act here: the card has the attention outline. */
	attention?: boolean;
	className?: string;
	children: ReactNode;
}) {
	const head = useId();
	return (
		<section
			id={id}
			aria-labelledby={title ? head : undefined}
			className={cn(
				"min-w-0 rounded-lg bg-surface-2 py-2 shadow-2",
				attention && ATTENTION_FRAME,
				className,
			)}
		>
			{title ? (
				<div className="flex flex-wrap items-center gap-3 px-6 pt-3.5 pb-1.5">
					<h2 id={head} className="text-13 font-semibold text-n-11">
						{title}
					</h2>
					{action ? <span className="ml-auto">{action}</span> : null}
				</div>
			) : null}
			{children}
		</section>
	);
}

/**
 * One row of a Setup card, 60 px high: a bold label and the control at the right, at its own
 * width. With `href` the whole row is a link with a chevron.
 */
export function SetupRow(
	props: Omit<ComponentProps<typeof SettingsRow>, "wide" | "icon" | "current">,
) {
	return <SettingsRow wide={false} {...props} />;
}

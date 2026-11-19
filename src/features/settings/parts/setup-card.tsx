import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "@/ui/icons";
import { Row } from "@/ui/molecules/row";

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
				attention && "outline-2 outline-attention",
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
 * One row of a Setup card, 60 px high: a bold label and the control at the right. With `href` the
 * whole row is a link with a chevron.
 */
export function SetupRow({
	id,
	label,
	href,
	children,
}: {
	/** The anchor of the row (`#id`). */
	id?: string;
	label: ReactNode;
	/** The address that the row opens. The row has no control then. */
	href?: string;
	/** The control. It needs its own accessible name. */
	children?: ReactNode;
}) {
	const router = useRouter();
	const name = useId();
	if (href)
		return (
			<Row
				render={(row) => (
					<a
						id={id}
						href={href}
						onClick={(e) => {
							e.preventDefault();
							router.history.push(href);
						}}
						{...row}
						className={cn(row.className, "hover:bg-n-3")}
					/>
				)}
			>
				<span className="min-w-0 font-semibold">{label}</span>
				<span aria-hidden="true" className="ml-auto flex text-n-11">
					<ChevronRightIcon size={20} />
				</span>
			</Row>
		);
	return (
		<Row
			className="gap-y-1.5 py-2"
			render={(row) => (
				// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
				<div id={id} role="group" aria-labelledby={name} {...row} />
			)}
		>
			<span id={name} className="min-w-0 flex-[1_1_10rem] font-semibold">
				{label}
			</span>
			<div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
				{children}
			</div>
		</Row>
	);
}

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "../atoms/button";
import { ChevronRightIcon } from "../icons";

/** The line between two rows of a card, for a part that is not a `Row`: the same class pair as `Row`. */
export const LINE = "[&+&]:border-t [&+&]:border-n-6";

/** The look of a button on a link or on the summary of a fold. */
export const valueClass = (o?: { mono?: boolean; primary?: boolean }) =>
	cn(
		buttonVariants({ variant: o?.primary ? "primary" : "secondary" }),
		"min-w-0 shrink",
		o?.mono && "font-mono text-ui font-normal",
	);

/**
 * A row of a Setup card that opens: the controls that the row does not show are under it. The row is
 * the summary, 60 px high: the label, `hint`, `value` with the look of a button, the `state` pill and
 * a chevron that turns. `className` replaces the line between two folds.
 */
export function Fold({
	label,
	state,
	value,
	mono,
	hint,
	plain,
	quiet,
	fields,
	className,
	children,
	...props
}: Omit<ComponentProps<"details">, "children"> & {
	label: ReactNode;
	state?: ReactNode;
	/** The text of the button: the value of the setting, or an action such as "Edit". */
	value?: ReactNode;
	mono?: boolean;
	/** A quiet value that shows before the button, such as an address. */
	hint?: ReactNode;
	/** The value is a status, not a button: it has no button look. */
	plain?: boolean;
	/** No chevron: the row looks like a plain row of the design, and still opens. */
	quiet?: boolean;
	/** The content is fields, not rows: it gets the inset of the card. */
	fields?: boolean;
	children: ReactNode;
}) {
	return (
		<details className={cn("group/fold", className ?? LINE)} {...props}>
			<summary className="mx-2 flex max-w-[calc(100%-1rem)] min-h-15 cursor-pointer list-none flex-wrap items-center gap-3 rounded-md px-4 py-2 text-n-12 select-none hover:bg-n-3 [&::-webkit-details-marker]:hidden">
				<span className="min-w-0 flex-[1_1_10rem] font-semibold">{label}</span>
				{hint ? (
					<span className="min-w-0 flex-[0_1_auto] truncate text-right font-mono text-ui text-n-11">
						{hint}
					</span>
				) : null}
				{value === undefined ? null : (
					<span className={cn(plain ? "" : valueClass({ mono }), !hint && "ml-auto", "truncate")}>
						{value}
					</span>
				)}
				{state}
				{quiet ? null : (
					<span
						aria-hidden="true"
						className="flex text-n-11 transition-transform duration-(--duration-fast) group-open/fold:rotate-90"
					>
						<ChevronRightIcon size={20} />
					</span>
				)}
			</summary>
			<div className={cn("flex flex-col", fields ? "gap-3 px-6 pt-1 pb-5" : "pb-2")}>
				{children}
			</div>
		</details>
	);
}

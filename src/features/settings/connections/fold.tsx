import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "@/ui/icons";

/** The line between two rows of a card, for a part that is not a `Row`: the same class pair as `Row`. */
export const LINE = "[&+&]:border-t [&+&]:border-n-6";

/**
 * A row of a Setup card that opens: the controls that the design does not show are under it.
 * The row is the summary, 60 px high; `state` is the pill at its right.
 */
export function Fold({
	label,
	state,
	quiet,
	className,
	children,
	...props
}: Omit<ComponentProps<"details">, "children"> & {
	label: ReactNode;
	state?: ReactNode;
	/** No chevron: the row looks like a plain row of the design, and still opens. */
	quiet?: boolean;
	children: ReactNode;
}) {
	return (
		<details className={cn("group/fold", LINE, className)} {...props}>
			<summary className="flex min-h-15 cursor-pointer list-none items-center gap-3 px-6 font-semibold text-n-12 select-none hover:bg-n-3 [&::-webkit-details-marker]:hidden">
				<span className="min-w-0 flex-1">{label}</span>
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
			<div className="flex flex-col pb-2">{children}</div>
		</details>
	);
}

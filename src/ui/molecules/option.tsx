import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One answer of a list of answers. `selected` shows as a thick accent border and as the pressed state. */
export function Option({
	selected,
	trailing,
	className,
	children,
	...props
}: { selected?: boolean; trailing?: ReactNode } & ComponentProps<"button">) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			className={cn(
				"flex min-h-15 w-full cursor-pointer items-center gap-3.5 rounded-field border border-n-7 bg-surface-2 px-5 text-left text-17 font-medium text-n-12 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
				selected && "border-2 border-accent bg-accent-tint",
				className,
			)}
			{...props}
		>
			{children}
			{trailing ? <span className="ml-auto flex items-center">{trailing}</span> : null}
		</button>
	);
}

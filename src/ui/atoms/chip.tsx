import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A short choice. `selected` makes it a toggle that says its state. */
export function Chip({
	selected,
	className,
	...props
}: ComponentProps<"button"> & { selected?: boolean }) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			className={cn(
				"inline-flex min-h-control items-center gap-2 rounded-sm px-3.5 font-medium transition-colors duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-50",
				selected ? "bg-accent text-accent-fg" : "bg-n-3 text-n-12",
				className,
			)}
			{...props}
		/>
	);
}

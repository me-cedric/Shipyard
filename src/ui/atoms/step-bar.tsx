import { cn } from "@/lib/utils";

/** The steps of a flow as short bars. `current` starts at 1: the bars before it are done. */
export function StepBar({
	total,
	current,
	label,
	className,
}: {
	total: number;
	current: number;
	/** Accessible name, for example "Step 2 of 5". */
	label: string;
	className?: string;
}) {
	return (
		<span role="img" aria-label={label} className={cn("inline-flex gap-1", className)}>
			{Array.from({ length: total }, (_, i) => {
				const state = i + 1 < current ? "done" : i + 1 === current ? "current" : "todo";
				return (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: the bars have no identity but their place
						key={i}
						data-step={state}
						className={cn(
							"h-1.25 w-5.5 rounded-full",
							state === "done" ? "bg-primary" : state === "current" ? "bg-accent" : "bg-n-7",
						)}
					/>
				);
			})}
		</span>
	);
}

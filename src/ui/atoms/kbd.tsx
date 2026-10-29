import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
	return (
		<kbd
			className={cn(
				"inline-flex h-4 min-w-4 items-center justify-center rounded-sm border bg-n-2 px-1 font-mono text-11 text-n-11",
				className,
			)}
			{...props}
		/>
	);
}

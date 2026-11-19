import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
	return (
		<kbd
			className={cn(
				"inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-sm bg-n-3 px-2.5 font-semibold",
				className,
			)}
			{...props}
		/>
	);
}

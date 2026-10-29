import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Static placeholder. Nothing loops except an active run. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
	return <div aria-hidden="true" className={cn("rounded-sm bg-n-3", className)} {...props} />;
}

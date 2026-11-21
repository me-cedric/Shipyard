import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** The look of a text link. Use it on a router `Link`. */
export const linkClass =
	"inline-flex min-h-control items-center gap-2 self-start font-semibold text-accent transition-colors duration-(--duration-fast) hover:text-accent-hover disabled:pointer-events-none disabled:opacity-50";

/** An action that looks like a text link. */
export function LinkButton({ className, ...props }: ComponentProps<"button">) {
	return <button type="button" className={cn(linkClass, className)} {...props} />;
}

import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
	"inline-flex h-6.5 items-center gap-1.5 rounded-full px-2.5 text-13 font-semibold whitespace-nowrap",
	{
		variants: {
			variant: {
				neutral: "bg-n-3 text-n-10",
				you: "bg-attention-subtle text-attention-text",
				accent: "bg-accent-subtle text-accent-text",
				success: "bg-success-subtle text-success-text",
				warning: "bg-warning-subtle text-warning-text",
				danger: "bg-danger-subtle text-danger-text",
				info: "bg-info-subtle text-info-text",
			},
		},
		defaultVariants: { variant: "neutral" },
	},
);

/** The tag pill. `dot` shows a dot in the colour of the text before the words. */
export function Badge({
	className,
	variant,
	dot,
	children,
	...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
	return (
		<span className={cn(badgeVariants({ variant }), className)} {...props}>
			{dot ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" /> : null}
			{children}
		</span>
	);
}

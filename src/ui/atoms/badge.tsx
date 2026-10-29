import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
	"inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-11 font-medium whitespace-nowrap",
	{
		variants: {
			variant: {
				neutral: "border-n-7 bg-n-3 text-n-11",
				accent: "border-transparent bg-accent-subtle text-accent-text",
				success: "border-transparent bg-success-subtle text-success-text",
				warning: "border-transparent bg-warning-subtle text-warning-text",
				danger: "border-transparent bg-danger-subtle text-danger-text",
				info: "border-transparent bg-info-subtle text-info-text",
			},
		},
		defaultVariants: { variant: "neutral" },
	},
);

export function Badge({
	className,
	variant,
	...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

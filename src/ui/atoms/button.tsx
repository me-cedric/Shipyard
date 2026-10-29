import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
	"inline-flex h-row shrink-0 items-center justify-center gap-2 rounded-md border px-3 text-ui font-medium whitespace-nowrap transition-colors duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				primary: "border-transparent bg-accent text-accent-fg hover:bg-accent-hover",
				secondary: "border-n-7 bg-n-2 text-n-12 hover:bg-n-3",
				ghost: "border-transparent text-n-12 hover:bg-n-3",
				danger: "border-transparent bg-danger text-n-1 hover:opacity-90",
			},
		},
		defaultVariants: { variant: "secondary" },
	},
);

export type ButtonProps = ComponentProps<typeof BaseButton> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, ...props }: ButtonProps) {
	return <BaseButton className={cn(buttonVariants({ variant }), className)} {...props} />;
}

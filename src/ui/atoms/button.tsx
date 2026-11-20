import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { LiveDot } from "./live-dot";

export const buttonVariants = cva(
	"inline-flex min-h-control min-w-(--control-h) max-w-full shrink-0 items-center justify-center gap-2 rounded-md border px-4.5 font-semibold whitespace-nowrap transition-[color,background-color,border-color,opacity,scale] duration-(--duration-fast) active:scale-[.98] disabled:pointer-events-none",
	{
		variants: {
			variant: {
				// A disabled primary stays dark, as in the design, but fades enough to read as off.
				primary: "border-primary bg-primary text-primary-fg hover:opacity-90 disabled:opacity-70",
				secondary: "border-n-7 bg-surface-1 text-n-12 hover:bg-n-3 disabled:opacity-50",
				ghost: "border-transparent text-n-12 hover:bg-n-3 disabled:opacity-50",
				danger: "border-transparent bg-danger text-n-1 hover:opacity-90 disabled:opacity-50",
			},
			size: { md: "", lg: "min-h-13 px-6 text-17" },
		},
		defaultVariants: { variant: "secondary", size: "md" },
	},
);

export type ButtonProps = ComponentProps<typeof BaseButton> &
	VariantProps<typeof buttonVariants> & {
		/** A run is in progress: the button shows the live dot, is disabled and says it is busy. */
		busy?: boolean;
		/** Why it is disabled: the tooltip and the description of the button. */
		reason?: string;
	};

export function Button({
	className,
	variant,
	size,
	busy,
	disabled,
	reason,
	children,
	...props
}: ButtonProps) {
	const button = (
		<BaseButton
			className={cn(buttonVariants({ variant, size }), className)}
			disabled={disabled || busy}
			aria-busy={busy || undefined}
			aria-description={disabled ? reason : undefined}
			{...props}
		>
			{busy ? <LiveDot /> : null}
			{children}
		</BaseButton>
	);
	// A disabled button takes no pointer event: the tooltip sits on a wrapper. The wrapper stays
	// while a reason is given, so a change of `disabled` keeps the same button and its focus.
	return reason !== undefined ? (
		<span title={disabled ? reason : undefined} className="inline-flex">
			{button}
		</span>
	) : (
		button
	);
}

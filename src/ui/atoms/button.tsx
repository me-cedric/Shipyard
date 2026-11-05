import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { LiveDot } from "./live-dot";

export const buttonVariants = cva(
	"inline-flex h-row shrink-0 items-center justify-center gap-2 rounded-md border px-3 text-ui font-medium whitespace-nowrap transition-[color,background-color,border-color,filter,scale] duration-(--duration-fast) active:scale-[.98] disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				primary:
					"border-transparent bg-accent bg-accent-gradient text-accent-fg shadow-1 hover:brightness-110",
				secondary: "border-n-7 bg-surface-2 text-n-12 hover:bg-n-3",
				ghost: "border-transparent text-n-12 hover:bg-n-3",
				danger: "border-transparent bg-danger text-n-1 hover:opacity-90",
			},
		},
		defaultVariants: { variant: "secondary" },
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
	busy,
	disabled,
	reason,
	children,
	...props
}: ButtonProps) {
	const button = (
		<BaseButton
			className={cn(buttonVariants({ variant }), className)}
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

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export type IconButtonProps = Omit<ComponentProps<typeof BaseButton>, "aria-label"> & {
	/** Accessible name and tooltip text. */
	label: string;
	shortcut?: string;
	/** Why it is disabled: the tooltip and the description of the button. */
	reason?: string;
	/** `outline` is the white square with a border of the page top row. */
	variant?: "ghost" | "outline";
};

export function IconButton({
	label,
	shortcut,
	reason,
	variant,
	className,
	children,
	...props
}: IconButtonProps) {
	const button = (
		<Tooltip label={label} shortcut={shortcut}>
			<BaseButton
				aria-label={label}
				aria-description={props.disabled ? reason : undefined}
				className={cn(
					"inline-flex size-(--control-h) shrink-0 items-center justify-center rounded-md border transition-[color,background-color,scale] duration-(--duration-fast) active:scale-[.96] hover:bg-n-3 hover:text-n-12 disabled:pointer-events-none disabled:opacity-50",
					variant === "outline"
						? "border-n-7 bg-surface-1 text-n-12"
						: "border-transparent text-n-11",
					className,
				)}
				{...props}
			>
				{children}
			</BaseButton>
		</Tooltip>
	);
	// A disabled button takes no pointer event: the title sits on a wrapper.
	return reason !== undefined ? (
		<span title={props.disabled ? reason : undefined} className="inline-flex">
			{button}
		</span>
	) : (
		button
	);
}

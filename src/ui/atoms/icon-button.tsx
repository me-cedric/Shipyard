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
};

export function IconButton({
	label,
	shortcut,
	reason,
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
					"inline-flex size-(--row-h) shrink-0 items-center justify-center rounded-md border border-transparent text-n-11 transition-colors duration-(--duration-fast) hover:bg-n-3 hover:text-n-12 disabled:pointer-events-none disabled:opacity-50",
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

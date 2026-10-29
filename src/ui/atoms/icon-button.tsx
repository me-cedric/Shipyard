import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export type IconButtonProps = Omit<ComponentProps<typeof BaseButton>, "aria-label"> & {
	/** Accessible name and tooltip text. */
	label: string;
	shortcut?: string;
};

export function IconButton({ label, shortcut, className, children, ...props }: IconButtonProps) {
	return (
		<Tooltip label={label} shortcut={shortcut}>
			<BaseButton
				aria-label={label}
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
}

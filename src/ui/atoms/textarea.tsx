import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Caption } from "./input";

export type TextareaProps = Omit<ComponentProps<"textarea">, "aria-label"> & {
	/** Accessible name. */
	label: string;
	/** Show the name above the field. */
	caption?: boolean;
};

export function Textarea({ label, caption, className, ...props }: TextareaProps) {
	const area = (
		<textarea
			aria-label={label}
			className={cn(
				"min-h-16 w-full min-w-0 resize-y rounded-md border border-n-7 bg-surface-1 px-4 py-2.5 text-n-12 placeholder:text-n-11 disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
	return caption ? <Caption label={label}>{area}</Caption> : area;
}

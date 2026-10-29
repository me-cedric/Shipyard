import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = Omit<ComponentProps<"textarea">, "aria-label"> & {
	/** Accessible name. */
	label: string;
};

export function Textarea({ label, className, ...props }: TextareaProps) {
	return (
		<textarea
			aria-label={label}
			className={cn(
				"min-h-16 w-full min-w-0 resize-y rounded-md border border-n-7 bg-n-1 px-2 py-1 text-ui text-n-12 placeholder:text-n-10 disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

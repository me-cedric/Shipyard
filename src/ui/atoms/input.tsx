import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type InputProps = Omit<ComponentProps<typeof BaseInput>, "aria-label"> & {
	/** Accessible name. */
	label: string;
};

export function Input({ label, className, ...props }: InputProps) {
	return (
		<BaseInput
			aria-label={label}
			className={cn(
				"h-row w-full min-w-0 rounded-md border border-n-7 bg-n-1 px-2 text-ui text-n-12 placeholder:text-n-10 disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

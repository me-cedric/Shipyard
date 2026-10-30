import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type InputProps = Omit<ComponentProps<typeof BaseInput>, "aria-label"> & {
	/** Accessible name. */
	label: string;
	/** Show the name above the field. The field keeps its own accessible name. */
	caption?: boolean;
};

export function Input({ label, caption, className, ...props }: InputProps) {
	const input = (
		<BaseInput
			aria-label={label}
			// An empty field shows its noun, so a field without a caption never looks blank.
			placeholder={caption ? undefined : label}
			className={cn(
				"h-row w-full min-w-0 rounded-md border border-n-7 bg-n-1 px-2 text-ui text-n-12 placeholder:text-n-10 disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
	return caption ? <Caption label={label}>{input}</Caption> : input;
}

/** A noun above a control. It is hidden from assistive tools: the control names itself. */
export function Caption({ label, children }: { label: string; children: ReactNode }) {
	return (
		<span className="flex min-w-0 flex-col gap-1">
			<span aria-hidden="true" className="text-12 text-n-11">
				{label}
			</span>
			{children}
		</span>
	);
}

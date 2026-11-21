import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon } from "../icons";

export type CheckboxProps = Omit<ComponentProps<typeof BaseCheckbox.Root>, "aria-label"> & {
	label: string;
	/** Keep the label for assistive technology only. */
	hideLabel?: boolean;
};

export function Checkbox({ label, hideLabel, className, ...props }: CheckboxProps) {
	return (
		<label className="inline-flex min-h-control items-center gap-3 text-ui">
			<BaseCheckbox.Root
				aria-label={label}
				className={cn(
					// Half of the small radius: a 20 px box with the full one looks like a radio button.
					"flex size-5 shrink-0 items-center justify-center rounded-[calc(var(--radius-sm)/2)] border border-n-7 bg-surface-1 transition-colors duration-(--duration-fast) data-[checked]:border-transparent data-[checked]:bg-accent data-[checked]:text-accent-fg",
					className,
				)}
				{...props}
			>
				<BaseCheckbox.Indicator>
					<CheckIcon size={14} />
				</BaseCheckbox.Indicator>
			</BaseCheckbox.Root>
			<span className={hideLabel ? "sr-only" : undefined}>{label}</span>
		</label>
	);
}

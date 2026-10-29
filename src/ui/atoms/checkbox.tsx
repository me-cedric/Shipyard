import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon } from "../icons";

export type CheckboxProps = Omit<ComponentProps<typeof BaseCheckbox.Root>, "aria-label"> & {
	label: string;
};

export function Checkbox({ label, className, ...props }: CheckboxProps) {
	return (
		<label className="inline-flex h-row items-center gap-2 text-ui">
			<BaseCheckbox.Root
				aria-label={label}
				className={cn(
					"flex size-4 shrink-0 items-center justify-center rounded-sm border border-n-8 bg-n-1 transition-colors duration-(--duration-fast) data-[checked]:border-transparent data-[checked]:bg-accent data-[checked]:text-accent-fg",
					className,
				)}
				{...props}
			>
				<BaseCheckbox.Indicator>
					<CheckIcon size={12} />
				</BaseCheckbox.Indicator>
			</BaseCheckbox.Root>
			{label}
		</label>
	);
}

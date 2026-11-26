import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type SwitchProps = Omit<ComponentProps<typeof BaseSwitch.Root>, "aria-label"> & {
	label: string;
	/** Hide the visible text. The name stays for assistive tools. */
	iconOnly?: boolean;
	/** Why it is disabled: the tooltip and the description of the switch. */
	reason?: string;
	/** `sm`: a 40 px by 24 px track, for a box of small controls. The target stays 44 px. */
	size?: "md" | "sm";
};

export function Switch({
	label,
	iconOnly,
	reason,
	size = "md",
	className,
	disabled,
	...props
}: SwitchProps) {
	const sm = size === "sm";
	return (
		<label
			title={disabled ? reason : undefined}
			className={cn(
				"inline-flex min-h-control items-center gap-2 text-ui",
				sm && "gap-2.5 font-medium",
			)}
		>
			<BaseSwitch.Root
				aria-label={label}
				aria-description={disabled ? reason : undefined}
				disabled={disabled}
				className={cn(
					"relative inline-flex h-7.5 w-13 shrink-0 items-center rounded-full bg-n-9 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 transition-colors duration-(--duration-fast) motion-reduce:transition-none data-[checked]:bg-success-text",
					sm && "h-6 w-10 bg-n-8",
					className,
				)}
				{...props}
			>
				<BaseSwitch.Thumb
					className={cn(
						"block size-6 translate-x-[3px] rounded-full bg-n-1 transition-transform duration-(--duration-fast) motion-reduce:transition-none data-[checked]:translate-x-[25px]",
						sm && "size-[18px] data-[checked]:translate-x-[19px]",
					)}
				/>
			</BaseSwitch.Root>
			{iconOnly ? null : label}
		</label>
	);
}

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type SwitchProps = Omit<ComponentProps<typeof BaseSwitch.Root>, "aria-label"> & {
	label: string;
	/** Hide the visible text. The name stays for assistive tools. */
	iconOnly?: boolean;
	/** Why it is disabled: the tooltip and the description of the switch. */
	reason?: string;
};

export function Switch({ label, iconOnly, reason, className, disabled, ...props }: SwitchProps) {
	return (
		<label
			title={disabled ? reason : undefined}
			className="inline-flex min-h-control items-center gap-2 text-ui"
		>
			<BaseSwitch.Root
				aria-label={label}
				aria-description={disabled ? reason : undefined}
				disabled={disabled}
				className={cn(
					"relative inline-flex h-7.5 w-13 shrink-0 items-center rounded-full bg-n-9 transition-colors duration-(--duration-fast) motion-reduce:transition-none data-[checked]:bg-success-text",
					className,
				)}
				{...props}
			>
				<BaseSwitch.Thumb className="block size-6 translate-x-[3px] rounded-full bg-n-1 transition-transform duration-(--duration-fast) motion-reduce:transition-none data-[checked]:translate-x-[25px]" />
			</BaseSwitch.Root>
			{iconOnly ? null : label}
		</label>
	);
}

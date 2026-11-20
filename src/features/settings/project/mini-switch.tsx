import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps } from "react";

/** The small switch of the commit box: a 40 px by 24 px track in a target of 44 px, the words after it. */
export function MiniSwitch({
	label,
	reason,
	disabled,
	...props
}: Omit<ComponentProps<typeof BaseSwitch.Root>, "aria-label"> & {
	label: string;
	/** Why it is disabled: the tooltip and the description of the switch. */
	reason?: string;
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: the switch inside is the control; its label also names it
		<label
			title={disabled ? reason : undefined}
			className="inline-flex min-h-control items-center gap-2.5 font-medium"
		>
			<BaseSwitch.Root
				aria-label={label}
				aria-description={disabled ? reason : undefined}
				disabled={disabled}
				className="group inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-n-8 p-[3px] transition-colors duration-(--duration-fast) data-[checked]:bg-success-text disabled:opacity-50"
				{...props}
			>
				<BaseSwitch.Thumb className="block size-[18px] rounded-full bg-surface-1 transition-transform duration-(--duration-fast) data-[checked]:translate-x-4" />
			</BaseSwitch.Root>
			{label}
		</label>
	);
}

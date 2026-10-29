import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type SwitchProps = Omit<ComponentProps<typeof BaseSwitch.Root>, "aria-label"> & {
	label: string;
	/** Hide the visible text. The name stays for assistive tools. */
	iconOnly?: boolean;
};

export function Switch({ label, iconOnly, className, ...props }: SwitchProps) {
	return (
		<label className="inline-flex h-row items-center gap-2 text-ui">
			<BaseSwitch.Root
				aria-label={label}
				className={cn(
					"relative h-4 w-7 shrink-0 rounded-full border border-n-8 bg-n-3 transition-colors duration-(--duration-fast) data-[checked]:border-transparent data-[checked]:bg-accent",
					className,
				)}
				{...props}
			>
				<BaseSwitch.Thumb className="block size-3 translate-x-px rounded-full bg-n-12 transition-transform duration-(--duration-fast) data-[checked]:translate-x-3 data-[checked]:bg-accent-fg" />
			</BaseSwitch.Root>
			{iconOnly ? null : label}
		</label>
	);
}

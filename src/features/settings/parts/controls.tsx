import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps, ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button, type ButtonProps } from "@/ui/atoms/button";

/** The white button that shows the value of a setting. It opens the select, the menu or the dialog of the value. */
export function ValueButton({ mono, className, ...props }: ButtonProps & { mono?: boolean }) {
	return (
		<Button
			variant="secondary"
			className={cn("min-w-0 shrink", mono && "font-mono text-ui font-normal", className)}
			{...props}
		/>
	);
}

/** A number with a step down and a step up. The buttons stop at `min` and `max`. */
export function Stepper({
	label,
	value,
	onValueChange,
	min = 0,
	max = Number.POSITIVE_INFINITY,
	step = 1,
	show,
	disabled,
}: {
	/** The name of the group and of its two buttons. */
	label: string;
	value: number;
	onValueChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	/** The text of the value, such as "100 %". */
	show?: (value: number) => ReactNode;
	disabled?: boolean;
}) {
	const { t } = useI18n();
	const side =
		"inline-flex size-(--control-h) items-center justify-center text-20 text-n-12 hover:bg-n-3 disabled:pointer-events-none disabled:opacity-50";
	const to = (next: number) => onValueChange(Math.min(max, Math.max(min, next)));
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<span
			role="group"
			aria-label={label}
			className="inline-flex shrink-0 items-center overflow-hidden rounded-md border border-n-7 bg-surface-1"
		>
			<button
				type="button"
				aria-label={format(t.settings.parts.less, { name: label })}
				disabled={disabled || value <= min}
				onClick={() => to(value - step)}
				className={side}
			>
				−
			</button>
			<output className="min-w-10 px-1 text-center font-semibold">
				{show ? show(value) : value}
			</output>
			<button
				type="button"
				aria-label={format(t.settings.parts.more, { name: label })}
				disabled={disabled || value >= max}
				onClick={() => to(value + step)}
				className={side}
			>
				+
			</button>
		</span>
	);
}

/** The switch of the design: a track of 52 px by 30 px in a target of 44 px. The row shows the words; `label` is the name. */
export function Toggle({
	label,
	reason,
	disabled,
	className,
	...props
}: Omit<ComponentProps<typeof BaseSwitch.Root>, "aria-label"> & {
	label: string;
	/** Why it is disabled: the tooltip and the description of the switch. */
	reason?: string;
}) {
	return (
		<BaseSwitch.Root
			aria-label={label}
			aria-description={disabled ? reason : undefined}
			title={disabled ? reason : undefined}
			disabled={disabled}
			className={cn(
				"group inline-flex h-(--control-h) w-13 shrink-0 items-center disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<span className="flex h-7.5 w-13 items-center rounded-full bg-n-9 p-[3px] transition-colors duration-(--duration-fast) group-data-[checked]:bg-success-text">
				<BaseSwitch.Thumb className="block size-6 rounded-full bg-surface-1 transition-transform duration-(--duration-fast) data-[checked]:translate-x-[22px]" />
			</span>
		</BaseSwitch.Root>
	);
}

const STATE = { ready: "success", fix: "you", off: "neutral" } as const;

/** The state of a tool or a connection, as a soft pill: ready, to fix or off. The children replace the default words. */
export function StatePill({
	state,
	children,
}: {
	state: keyof typeof STATE;
	children?: ReactNode;
}) {
	const { t } = useI18n();
	return (
		<Badge variant={STATE[state]} dot={state !== "off"}>
			{children ?? t.settings.parts[state]}
		</Badge>
	);
}

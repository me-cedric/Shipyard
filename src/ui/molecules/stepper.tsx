import type { ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";

/** The frame of a stepper: the two buttons and the value between them. */
export const STEPPER =
	"inline-flex shrink-0 items-center overflow-hidden rounded-md border border-n-7 bg-surface-1";

/** One button of a stepper: a 44 px square with a hover fill. */
export const STEPPER_SIDE =
	"inline-flex size-(--control-h) items-center justify-center text-20 text-n-12 hover:bg-n-3 disabled:pointer-events-none disabled:opacity-50";

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
	const to = (next: number) => onValueChange(Math.min(max, Math.max(min, next)));
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<span role="group" aria-label={label} className={STEPPER}>
			<button
				type="button"
				aria-label={format(t.settings.parts.less, { name: label })}
				disabled={disabled || value <= min}
				onClick={() => to(value - step)}
				className={STEPPER_SIDE}
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
				className={STEPPER_SIDE}
			>
				+
			</button>
		</span>
	);
}

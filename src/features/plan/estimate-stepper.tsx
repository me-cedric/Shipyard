import { format, useI18n } from "@/lib/i18n";

const SIDE = "min-h-control min-w-(--control-h) text-20 text-n-12 disabled:opacity-50";

/**
 * Less, the value, more. With `onType` the value is a number field that a person can type in.
 * Without it the value is text, and each press of a side is one change.
 */
export function Stepper({
	label,
	value,
	onStep,
	onType,
	disabled,
	reason,
}: {
	label: string;
	value: string;
	onStep: (by: -1 | 1) => void;
	onType?: (value: string) => void;
	disabled?: boolean;
	/** Why it is off. */
	reason?: string;
}) {
	const { t } = useI18n();
	const p = t.costing.estimate;
	const side = (by: -1 | 1) => (
		<button
			type="button"
			aria-label={format(by < 0 ? p.less : p.more, { name: label })}
			aria-description={disabled ? reason : undefined}
			disabled={disabled}
			onClick={() => onStep(by)}
			className={SIDE}
		>
			{by < 0 ? "−" : "+"}
		</button>
	);
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<span
			role="group"
			aria-label={label}
			title={disabled ? reason : undefined}
			className="inline-flex shrink-0 items-center rounded-md border border-n-7 bg-surface-1"
		>
			{side(-1)}
			{onType ? (
				<input
					type="number"
					min={0}
					step={0.25}
					aria-label={label}
					value={value}
					disabled={disabled}
					onChange={(ev) => onType(ev.target.value)}
					className="min-h-control w-14 [appearance:textfield] bg-transparent text-center font-semibold text-n-12 [&::-webkit-inner-spin-button]:appearance-none"
				/>
			) : (
				<output className="min-w-7 text-center font-semibold whitespace-nowrap">{value}</output>
			)}
			{side(1)}
		</span>
	);
}

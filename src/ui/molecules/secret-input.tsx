import { Input } from "../atoms/input";

/** Shown in place of a saved secret. A fixed string: the real value never reaches the view. */
export const MASK = "••••••••";

/**
 * A write-only field. It shows the mask while a secret is saved and the field is empty.
 * An empty value means "keep the saved secret". Typing sets a new one.
 */
export function SecretInput({
	label,
	saved,
	value,
	onChange,
	className,
}: {
	label: string;
	saved: boolean;
	value: string;
	onChange: (value: string) => void;
	className?: string;
}) {
	return (
		<Input
			label={label}
			type="password"
			autoComplete="off"
			spellCheck={false}
			value={value}
			placeholder={saved ? MASK : undefined}
			onChange={(e) => onChange(e.target.value)}
			className={className}
		/>
	);
}

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
	plain,
	placeholder,
	className,
}: {
	label: string;
	saved: boolean;
	value: string;
	onChange: (value: string) => void;
	/** The value is not a secret (an email): the typed text shows. The saved value stays hidden. */
	plain?: boolean;
	/** The noun of the field, shown while it is empty and nothing is saved. */
	placeholder?: string;
	className?: string;
}) {
	return (
		<Input
			label={label}
			type={plain ? "text" : "password"}
			autoComplete="off"
			spellCheck={false}
			value={value}
			placeholder={saved ? MASK : placeholder}
			onChange={(e) => onChange(e.target.value)}
			className={className}
		/>
	);
}

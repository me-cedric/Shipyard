import { cn } from "@/lib/utils";
import { buttonVariants } from "../atoms/button";

/** A day as a button that shows `text`. The date field of the system lies on it and opens the date picker. */
export function DateButton({
	label,
	text,
	value,
	disabled,
	onChange,
}: {
	label: string;
	text: string;
	value: string;
	disabled?: boolean;
	onChange: (value: string) => void;
}) {
	return (
		<span
			className={cn(
				buttonVariants(),
				"relative focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
				disabled && "pointer-events-none opacity-50",
			)}
		>
			{text}
			<input
				type="date"
				aria-label={label}
				disabled={disabled}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onClick={(e) => e.currentTarget.showPicker?.()}
				className="absolute inset-0 size-full cursor-pointer opacity-0"
			/>
		</span>
	);
}

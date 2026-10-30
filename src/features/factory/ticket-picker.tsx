import { type Ref, useEffect, useId, useMemo, useState } from "react";
import { useWorkItems } from "@/lib/sync";
import { Input } from "@/ui/atoms/input";

const NO_FILTER = {};

/**
 * The field that names the ticket of a run: a combobox over the tickets of the mirror, by title.
 * `onChange` gets the key of the ticket. A text that matches no title goes on as it is, so a key
 * that is typed still works, and the start reports a ticket that the mirror lacks.
 */
export function TicketPicker({
	label,
	value,
	onChange,
	onSubmit,
	ref,
	className,
}: {
	label: string;
	/** The key now. An empty key clears the field. */
	value: string;
	onChange: (key: string) => void;
	onSubmit: () => void;
	ref?: Ref<HTMLInputElement>;
	className?: string;
}) {
	const list = useId();
	const items = useWorkItems(NO_FILTER).data;
	const [text, setText] = useState("");
	useEffect(() => {
		if (value === "") setText("");
	}, [value]);
	// A title that two tickets share shows its key too, so each option names one ticket.
	const options = useMemo(() => {
		const count = new Map<string, number>();
		for (const i of items ?? []) count.set(i.title, (count.get(i.title) ?? 0) + 1);
		return (items ?? []).map((i) => ({
			key: i.key,
			text: (count.get(i.title) ?? 0) > 1 ? `${i.title} (${i.key})` : i.title,
		}));
	}, [items]);
	return (
		<>
			<Input
				ref={ref}
				label={label}
				className={className}
				list={list}
				value={text}
				onChange={(e) => {
					setText(e.target.value);
					onChange(options.find((o) => o.text === e.target.value)?.key ?? e.target.value.trim());
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" && value) onSubmit();
				}}
			/>
			<datalist id={list}>
				{options.map((o) => (
					<option key={o.key} value={o.text} label={o.key} />
				))}
			</datalist>
		</>
	);
}

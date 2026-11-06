import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/ui/atoms/input";

export type TicketChoice = { key: string; title: string };

/** A ticket key field with a list of the mirror tickets: the full key and the title, filtered by either. */
export function TicketField({
	label,
	value,
	onChange,
	items,
}: {
	label: string;
	value: string;
	onChange: (key: string) => void;
	items: TicketChoice[];
}) {
	const listId = useId();
	const [open, setOpen] = useState(false);
	const [at, setAt] = useState(0);
	const q = value.trim().toLowerCase().replace(/^wi:/, "");
	const rows = items
		.filter((i) => !q || i.key.toLowerCase().includes(q) || i.title.toLowerCase().includes(q))
		.slice(0, 50);
	const shown = open && rows.length > 0 && !items.some((i) => i.key === value.trim());
	const pick = (key: string) => {
		onChange(key);
		setOpen(false);
	};
	return (
		<span className="relative flex min-w-0 flex-col">
			<Input
				caption
				label={label}
				role="combobox"
				aria-expanded={shown}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={shown && rows[at] ? `${listId}-${at}` : undefined}
				autoComplete="off"
				value={value}
				onChange={(ev) => {
					onChange(ev.target.value);
					setOpen(true);
					setAt(0);
				}}
				onFocus={() => setOpen(true)}
				onBlur={() => setOpen(false)}
				onKeyDown={(ev) => {
					if (!shown) return;
					if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
						ev.preventDefault();
						setAt(Math.min(Math.max(at + (ev.key === "ArrowDown" ? 1 : -1), 0), rows.length - 1));
					} else if (ev.key === "Enter" && rows[at]) {
						ev.preventDefault();
						pick(rows[at].key);
					} else if (ev.key === "Escape") {
						ev.stopPropagation();
						setOpen(false);
					}
				}}
				className="font-mono"
			/>
			{shown ? (
				<div
					id={listId}
					role="listbox"
					aria-label={label}
					className="absolute top-full left-0 z-50 mt-1 max-h-64 w-max min-w-full max-w-[32rem] overflow-y-auto rounded-lg border border-n-6 bg-surface-3 p-1 text-ui shadow-3"
				>
					{rows.map((r, i) => (
						// biome-ignore lint/a11y/useKeyWithClickEvents: the field owns the keys and names the row with aria-activedescendant
						<div
							key={r.key}
							id={`${listId}-${i}`}
							role="option"
							aria-selected={i === at}
							tabIndex={-1}
							// Keep the focus in the field: a blur would close the list before the click.
							onMouseDown={(ev) => ev.preventDefault()}
							onClick={() => pick(r.key)}
							className={cn(
								"flex h-row cursor-pointer items-center gap-2 rounded-sm px-2 text-n-12 hover:bg-n-5",
								i === at && "bg-n-5",
							)}
						>
							<span className="shrink-0 font-mono text-11">{r.key}</span>
							<span className="min-w-0 flex-1 truncate text-n-11" title={r.title}>
								{r.title}
							</span>
						</div>
					))}
				</div>
			) : null}
		</span>
	);
}

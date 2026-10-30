import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MenuItem = { id: string; label: string; pick: () => void };

/** The list of the slash commands or of the `@` matches, above the input. The input keeps the focus. */
export function ComposerMenu({
	label,
	listId,
	items,
	active,
}: {
	label: string;
	listId: string;
	items: MenuItem[];
	active: number;
}): ReactNode {
	return (
		<div
			id={listId}
			role="listbox"
			aria-label={label}
			className="absolute right-0 bottom-full left-0 z-10 mb-1 max-h-48 overflow-y-auto rounded-md border bg-surface-3 p-1 shadow-3"
		>
			{items.map((item, i) => (
				<div
					key={item.id}
					id={`${listId}-${i}`}
					role="option"
					tabIndex={-1}
					aria-selected={i === active}
					// The mouse down keeps the focus in the input.
					onMouseDown={(e) => {
						e.preventDefault();
						item.pick();
					}}
					className={cn(
						"cursor-pointer truncate rounded-sm px-2 py-1 font-mono text-12",
						i === active ? "bg-accent-subtle text-n-12" : "text-n-11 hover:bg-n-3",
					)}
				>
					{item.label}
				</div>
			))}
		</div>
	);
}

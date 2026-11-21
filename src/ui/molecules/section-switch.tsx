import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SwitchItem = { id: string; label: string; current?: boolean };
export type SwitchItemProps = {
	className: string;
	"aria-current": "page" | undefined;
};

const ITEM =
	"inline-flex min-h-control cursor-pointer items-center rounded-sm px-3.5 font-medium text-n-10 transition-colors duration-(--duration-fast) hover:text-n-12";

/** One segmented control in the title row of a page. It wraps when the width is small. Links through `renderItem`, buttons by default. */
export function SectionSwitch({
	label,
	items,
	onSelect,
	renderItem,
}: {
	label: string;
	items: SwitchItem[];
	onSelect?: (id: string) => void;
	renderItem?: (item: SwitchItem, props: SwitchItemProps) => ReactNode;
}) {
	return (
		<nav aria-label={label}>
			<ul className="flex w-fit max-w-full flex-wrap rounded-md bg-n-4 p-1">
				{items.map((i) => {
					const className = cn(ITEM, i.current && "bg-surface-2 text-n-12 shadow-1");
					return (
						<li key={i.id}>
							{renderItem ? (
								renderItem(i, { className, "aria-current": i.current ? "page" : undefined })
							) : (
								<button
									type="button"
									aria-pressed={!!i.current}
									className={className}
									onClick={() => onSelect?.(i.id)}
								>
									{i.label}
								</button>
							)}
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

import { Toggle } from "@base-ui/react/toggle";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Input } from "../atoms/input";
import { MagnifyingGlassIcon } from "../icons";

export type FilterOption = { id: string; label: string; icon?: ReactNode };

export function FilterBar({
	query,
	onQueryChange,
	filters,
	active,
	onToggle,
}: {
	query: string;
	onQueryChange: (query: string) => void;
	filters: FilterOption[];
	active: string[];
	onToggle: (id: string) => void;
}) {
	const { t } = useI18n();
	return (
		<search className="flex items-center gap-2">
			<div className="relative w-44">
				<span
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-n-10"
				>
					<MagnifyingGlassIcon size={14} />
				</span>
				<Input
					label={t.filter.search}
					value={query}
					onChange={(e) => onQueryChange(e.target.value)}
					className="pl-7"
				/>
			</div>
			{filters.map((f) => (
				<Toggle
					key={f.id}
					pressed={active.includes(f.id)}
					onPressedChange={() => onToggle(f.id)}
					className={cn(
						"inline-flex h-row items-center gap-1.5 rounded-md border border-n-7 px-2 text-ui text-n-11 transition-colors duration-(--duration-fast) hover:bg-n-3 data-[pressed]:bg-accent-subtle data-[pressed]:text-accent-text",
					)}
				>
					{f.icon}
					{f.label}
				</Toggle>
			))}
		</search>
	);
}

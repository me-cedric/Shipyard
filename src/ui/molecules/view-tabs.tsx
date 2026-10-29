import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

export type ViewTab<V extends string> = { value: V; label: string; icon?: ReactNode };

/** A row of views in one place. The caller draws the view that `value` names. */
export function ViewTabs<V extends string>({
	label,
	value,
	onValueChange,
	tabs,
}: {
	label: string;
	value: V;
	onValueChange: (value: V) => void;
	tabs: ViewTab<V>[];
}) {
	return (
		<Tabs.Root value={value} onValueChange={(v) => onValueChange(v as V)}>
			<Tabs.List
				aria-label={label}
				className="flex items-center gap-1 rounded-md border border-n-7 bg-n-2 p-0.5"
			>
				{tabs.map((tab) => (
					<Tabs.Tab
						key={tab.value}
						value={tab.value}
						className="inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-ui text-n-11 transition-colors duration-(--duration-fast) hover:text-n-12 data-[active]:bg-n-4 data-[active]:text-n-12"
					>
						{tab.icon}
						{tab.label}
					</Tabs.Tab>
				))}
			</Tabs.List>
		</Tabs.Root>
	);
}

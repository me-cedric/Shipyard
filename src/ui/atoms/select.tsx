import { Select as BaseSelect } from "@base-ui/react/select";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronRightIcon } from "../icons";

export type SelectItem = { value: string; label: string };

export function Select({
	label,
	items,
	value,
	onValueChange,
	className,
}: {
	label: string;
	items: SelectItem[];
	value: string;
	onValueChange: (value: string) => void;
	className?: string;
}) {
	return (
		<BaseSelect.Root
			items={items}
			value={value}
			onValueChange={(v) => {
				if (v !== null) onValueChange(v);
			}}
		>
			<BaseSelect.Trigger
				aria-label={label}
				className={cn(
					"inline-flex h-row min-w-24 items-center justify-between gap-2 rounded-md border border-n-7 bg-n-1 px-2 text-ui text-n-12",
					className,
				)}
			>
				<BaseSelect.Value />
				<BaseSelect.Icon className="rotate-90 text-n-10">
					<ChevronRightIcon size={12} />
				</BaseSelect.Icon>
			</BaseSelect.Trigger>
			<BaseSelect.Portal>
				<BaseSelect.Positioner sideOffset={4} className="z-50">
					<BaseSelect.Popup className="min-w-(--anchor-width) rounded-md border border-n-7 bg-n-2 p-1 text-ui transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
						<BaseSelect.List>
							{items.map((item) => (
								<BaseSelect.Item
									key={item.value}
									value={item.value}
									className="flex h-row cursor-default items-center gap-2 rounded-sm px-2 text-n-12 data-[highlighted]:bg-n-4"
								>
									<BaseSelect.ItemIndicator className="w-3">
										<CheckIcon size={12} />
									</BaseSelect.ItemIndicator>
									<BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
								</BaseSelect.Item>
							))}
						</BaseSelect.List>
					</BaseSelect.Popup>
				</BaseSelect.Positioner>
			</BaseSelect.Portal>
		</BaseSelect.Root>
	);
}
